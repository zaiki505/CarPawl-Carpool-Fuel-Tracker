import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { db } from "./db.js";
import {
  applyCredit,
  reverseCreditApplication,
  createPayment,
  updatePayment,
  removePayment,
  removeEntry,
} from "./actions.js";
import { outstanding, availableCredit, withCoveredWho } from "../lib/calc.js";
import { person } from "../lib/identity.js";

const zai = person("zai");
const ben = person("ben");
const far = person("far");

const wipe = () =>
  Promise.all([
    db.entries.clear(),
    db.payments.clear(),
    db.creditApplications.clear(),
    db.groups.clear(),
    db.deletions.clear(),
  ]);

async function seed() {
  // g1 is zai's carpool - ben rides and owes zai.
  await db.groups.add({
    id: "g1",
    name: "Zai's car",
    ownerType: "person",
    ownerPersonId: "zai",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
  });
  await db.entries.bulkAdd([
    { id: "e1", groupId: "g1", date: "2026-01-01", splitMethod: "equal", totalCost: 10, passengers: [{ who: ben }], createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "e2", groupId: "g1", date: "2026-02-01", splitMethod: "equal", totalCost: 50, passengers: [{ who: ben }], createdAt: "2026-02-01", updatedAt: "2026-02-01" },
  ]);
  // ben overpays e1 (share 10) by 20.
  await createPayment({ entryId: "e1", who: ben, amount: 30, date: "2026-01-02" });
}

const load = async () => ({
  entries: await db.entries.where("groupId").equals("g1").toArray(),
  payments: await db.payments.toArray(),
  apps: await db.creditApplications.toArray(),
});

beforeEach(async () => {
  await wipe();
  await seed();
});

describe("applyCredit", () => {
  it("writes a ledger row and reduces the target debt", async () => {
    const created = await applyCredit({
      debtorWho: ben,
      creditorWho: zai,
      groupId: "g1",
      allocations: [{ entryId: "e2", amount: 20 }],
    });
    expect(created).toHaveLength(1);
    const { entries, payments, apps } = await load();
    const e2 = entries.find((e) => e.id === "e2");
    expect(outstanding(e2, ben, payments, apps)).toBeCloseTo(30);
    expect(availableCredit(entries, ben, payments, apps)).toBeCloseTo(0);
  });

  it("rejects applying more than the available credit", async () => {
    await expect(
      applyCredit({ debtorWho: ben, creditorWho: zai, groupId: "g1", allocations: [{ entryId: "e2", amount: 25 }] })
    ).rejects.toThrow(/more credit than is available/i);
  });
});

describe("reversal", () => {
  it("reverseCreditApplication restores credit and debt", async () => {
    const [app] = await applyCredit({
      debtorWho: ben,
      creditorWho: zai,
      groupId: "g1",
      allocations: [{ entryId: "e2", amount: 20 }],
    });
    await reverseCreditApplication(app.id);
    const { entries, payments, apps } = await load();
    const e2 = entries.find((e) => e.id === "e2");
    expect(outstanding(e2, ben, payments, apps)).toBeCloseTo(50);
    expect(availableCredit(entries, ben, payments, apps)).toBeCloseTo(20);
  });

  it("removing the overpayment auto-reverses the application (reconcile)", async () => {
    await applyCredit({ debtorWho: ben, creditorWho: zai, groupId: "g1", allocations: [{ entryId: "e2", amount: 20 }] });
    const pay = (await db.payments.toArray()).find((p) => p.entryId === "e1");
    await removePayment(pay.id);
    const { entries, payments, apps } = await load();
    const e2 = entries.find((e) => e.id === "e2");
    // credit source gone -> application reversed -> debt back to full, no credit
    expect(apps.every((a) => a.reversedAt)).toBe(true);
    expect(outstanding(e2, ben, payments, apps)).toBeCloseTo(50);
    expect(availableCredit(entries, ben, payments, apps)).toBeCloseTo(0);
  });

  it("deleting the debt entry orphans and reverses its applications", async () => {
    await applyCredit({ debtorWho: ben, creditorWho: zai, groupId: "g1", allocations: [{ entryId: "e2", amount: 20 }] });
    await removeEntry("e2");
    const apps = await db.creditApplications.toArray();
    expect(apps).toHaveLength(1);
    expect(apps[0].reversedAt).toBeTruthy();
  });
});

/* The write path (credit caps + reconcile) must price a trip EXACTLY as the
   screens do. It reads entries straight from Dexie, so it has to stamp the
   covered payer itself - when it didn't, a driver-comp trip with a markup cost
   34.50 on screen but 33 in the ledger, which made valid credit unappliable and
   silently reversed good applications. */
describe("write path prices driver-comp like the UI does", () => {
  // g2: zai's carpool, zai rides along. fuel 90 +10% => unmarked 90, markup 9.
  // zai (covered) pays no markup: 30. ben & far: 30 + 4.5 = 34.50 each.
  beforeEach(async () => {
    await db.groups.add({
      id: "g2",
      name: "Zai's other car",
      ownerType: "person",
      ownerPersonId: "zai",
      createdAt: "2026-03-01",
      updatedAt: "2026-03-01",
    });
    await db.entries.bulkAdd([
      // ben overpays this by 40 -> 40 credit.
      { id: "e3", groupId: "g2", date: "2026-03-01", splitMethod: "equal", totalCost: 40, passengers: [{ who: ben }], createdAt: "2026-03-01", updatedAt: "2026-03-01" },
      { id: "e4", groupId: "g2", date: "2026-03-02", splitMethod: "driver_comp", totalCost: 90, parking: 0, maintenancePct: 10, passengers: [{ who: zai }, { who: ben }, { who: far }], createdAt: "2026-03-02", updatedAt: "2026-03-02" },
    ]);
    await createPayment({ entryId: "e3", who: ben, amount: 80, date: "2026-03-01" });
  });

  it("the UI prices ben's driver-comp share at 34.50", async () => {
    const group = await db.groups.get("g2");
    const e4 = withCoveredWho(await db.entries.get("e4"), group);
    expect(outstanding(e4, ben, [], [])).toBeCloseTo(34.5);
  });

  it("accepts credit up to the share the UI shows (not the raw 33)", async () => {
    // 34 sits between the raw legacy share (33) and the real one (34.50): the
    // unstamped write path used to reject this as "more than the outstanding".
    const created = await applyCredit({
      debtorWho: ben,
      creditorWho: zai,
      groupId: "g2",
      allocations: [{ entryId: "e4", amount: 34 }],
    });
    expect(created).toHaveLength(1);
    const apps = await db.creditApplications.where("groupId").equals("g2").toArray();
    expect(apps[0].reversedAt).toBeFalsy();
  });

  it("a valid application survives an unrelated reconcile", async () => {
    await applyCredit({
      debtorWho: ben,
      creditorWho: zai,
      groupId: "g2",
      allocations: [{ entryId: "e4", amount: 34 }],
    });
    // Any payment edit re-reconciles the group; the application must not be
    // silently reversed just because the ledger priced the trip differently.
    const pay = (await db.payments.toArray()).find((p) => p.entryId === "e3");
    await updatePayment(pay.id, { note: "cash" });
    const apps = await db.creditApplications.where("groupId").equals("g2").toArray();
    expect(apps[0].reversedAt).toBeFalsy();
  });
});

describe("payment edits keep credit honest", () => {
  it("editing the backing overpayment DOWN reverses the credit it funded", async () => {
    await applyCredit({ debtorWho: ben, creditorWho: zai, groupId: "g1", allocations: [{ entryId: "e2", amount: 20 }] });
    const pay = (await db.payments.toArray()).find((p) => p.entryId === "e1");
    // 30 -> 10 leaves no overpayment, so the 20 it funded can't stand.
    await updatePayment(pay.id, { amount: 10 });
    const { entries, payments, apps } = await load();
    expect(apps.every((a) => a.reversedAt)).toBe(true);
    const e2 = entries.find((e) => e.id === "e2");
    expect(outstanding(e2, ben, payments, apps)).toBeCloseTo(50);
    expect(availableCredit(entries, ben, payments, apps)).toBeCloseTo(0);
  });

  it("paying a credit-settled debt in cash refunds the credit instead of settling twice", async () => {
    await db.entries.add({ id: "e5", groupId: "g1", date: "2026-03-01", splitMethod: "equal", totalCost: 20, passengers: [{ who: ben }], createdAt: "2026-03-01", updatedAt: "2026-03-01" });
    await applyCredit({ debtorWho: ben, creditorWho: zai, groupId: "g1", allocations: [{ entryId: "e5", amount: 20 }] });
    // e5 is settled by credit; now ben pays it in cash anyway.
    await createPayment({ entryId: "e5", who: ben, amount: 20, date: "2026-03-02" });
    const { entries, payments, apps } = await load();
    const e5 = entries.find((e) => e.id === "e5");
    // Still settled exactly once - by the cash - and the credit is back.
    expect(outstanding(e5, ben, payments, apps)).toBeCloseTo(0);
    expect(apps.every((a) => a.reversedAt)).toBe(true);
    expect(availableCredit(entries, ben, payments, apps)).toBeCloseTo(20);
  });
});
