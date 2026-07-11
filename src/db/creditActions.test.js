import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { db } from "./db.js";
import {
  applyCredit,
  reverseCreditApplication,
  createPayment,
  removePayment,
  removeEntry,
} from "./actions.js";
import { outstanding, availableCredit } from "../lib/calc.js";
import { person } from "../lib/identity.js";

const zai = person("zai");
const ben = person("ben");

const wipe = () =>
  Promise.all([
    db.entries.clear(),
    db.payments.clear(),
    db.creditApplications.clear(),
    db.deletions.clear(),
  ]);

async function seed() {
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
