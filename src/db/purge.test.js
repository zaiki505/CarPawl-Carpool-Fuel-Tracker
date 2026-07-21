import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { db } from "./db.js";
import * as actions from "./actions.js";
import { share, entryShares, withCoveredWho } from "../lib/calc.js";
import { person, ME } from "../lib/identity.js";

/* Permanent delete is the one destructive path in the app: it rewrites history
   rather than hiding it. These tests pin the two promises that path makes -
   nobody who stays behind has their debt moved, and nothing is left pointing at
   a record that's gone. */

const wipe = async () => {
  await Promise.all([
    db.people.clear(),
    db.groups.clear(),
    db.entries.clear(),
    db.payments.clear(),
    db.creditApplications.clear(),
    db.deletions.clear(),
    db.settings.clear(),
  ]);
};

beforeEach(wipe);

/** Read an entry back priced the way the screens price it. */
async function priced(entryId) {
  const e = await db.entries.get(entryId);
  const g = await db.groups.get(e.groupId);
  return withCoveredWho(e, g);
}

const tombstoned = async (table, id) => Boolean(await db.deletions.get([table, id]));

describe("permanentlyDeletePerson - survivors keep their share", () => {
  it("equal split: the other riders still owe exactly what they owed", async () => {
    const ann = await actions.createPerson("Ann");
    const ben = await actions.createPerson("Ben");
    const cat = await actions.createPerson("Cat");
    const g = await actions.createGroup({ name: "My Car", ownerType: "me" });
    const e = await actions.createEntry({
      groupId: g.id,
      date: "2026-06-01",
      totalCost: 90,
      splitMethod: "equal",
      passengers: [{ who: person(ann.id) }, { who: person(ben.id) }, { who: person(cat.id) }],
    });
    // RM90 across 3 riders = RM30 each.
    expect(share(await priced(e.id), person(ben.id))).toBeCloseTo(30);

    await actions.permanentlyDeletePerson(ann.id);

    const after = await priced(e.id);
    expect(after.passengers).toHaveLength(2);
    // Naively re-splitting would make these RM45 - the whole point is they don't move.
    expect(share(after, person(ben.id))).toBeCloseTo(30);
    expect(share(after, person(cat.id))).toBeCloseTo(30);
    // The trip deliberately no longer adds up to its full cost: you absorb RM30.
    expect(entryShares(after).reduce((a, b) => a + b, 0)).toBeCloseTo(60);
  });

  it("distance split: shares are independent, so nothing gets pinned", async () => {
    const ann = await actions.createPerson("Ann");
    const ben = await actions.createPerson("Ben");
    const g = await actions.createGroup({ name: "My Car", ownerType: "me" });
    const e = await actions.createEntry({
      groupId: g.id,
      date: "2026-06-01",
      totalCost: 100,
      totalDistance: 100,
      splitMethod: "distance",
      passengers: [
        { who: person(ann.id), distanceAssigned: 40 },
        { who: person(ben.id), distanceAssigned: 25 },
      ],
    });
    expect(share(await priced(e.id), person(ben.id))).toBeCloseTo(25);

    await actions.permanentlyDeletePerson(ann.id);

    const after = await priced(e.id);
    expect(share(after, person(ben.id))).toBeCloseTo(25);
    // Left live so a later edit still re-splits normally.
    expect(after.passengers[0].pinnedShare).toBeUndefined();
  });

  it("compensate split: the markup stays off the owner and riders don't move", async () => {
    const ann = await actions.createPerson("Ann");
    const ben = await actions.createPerson("Ben");
    const g = await actions.createGroup({ name: "My Car", ownerType: "me" });
    const e = await actions.createEntry({
      groupId: g.id,
      date: "2026-06-01",
      totalCost: 100,
      splitMethod: "driver_comp",
      maintenancePct: 20,
      passengers: [{ who: ME }, { who: person(ann.id) }, { who: person(ben.id) }],
    });
    const beforeBen = share(await priced(e.id), person(ben.id));
    const beforeMe = share(await priced(e.id), ME);

    await actions.permanentlyDeletePerson(ann.id);

    const after = await priced(e.id);
    expect(share(after, person(ben.id))).toBeCloseTo(beforeBen);
    expect(share(after, ME)).toBeCloseTo(beforeMe);
  });

  it("an entry they were never on is left completely alone", async () => {
    const ann = await actions.createPerson("Ann");
    const ben = await actions.createPerson("Ben");
    const g = await actions.createGroup({ name: "My Car", ownerType: "me" });
    const e = await actions.createEntry({
      groupId: g.id,
      date: "2026-06-01",
      totalCost: 60,
      splitMethod: "equal",
      passengers: [{ who: person(ben.id) }],
    });
    const before = await db.entries.get(e.id);
    await actions.permanentlyDeletePerson(ann.id);
    const after = await db.entries.get(e.id);
    expect(after.updatedAt).toBe(before.updatedAt); // untouched, not just unchanged
    expect(share(await priced(e.id), person(ben.id))).toBeCloseTo(60);
  });
});

describe("permanentlyDeletePerson - what goes with them", () => {
  it("refuses while they still own a carpool, and changes nothing", async () => {
    const owner = await actions.createPerson("Owner");
    const g = await actions.createGroup({
      name: "Farid's Civic",
      ownerType: "person",
      ownerPersonId: owner.id,
    });
    await actions.createEntry({
      groupId: g.id,
      date: "2026-06-01",
      totalCost: 40,
      splitMethod: "equal",
      passengers: [{ who: ME }],
    });

    await expect(actions.permanentlyDeletePerson(owner.id)).rejects.toThrow(
      /Farid's Civic/
    );
    // The block must be total - no half-applied delete.
    expect(await db.people.get(owner.id)).toBeTruthy();
    expect(await db.groups.get(g.id)).toBeTruthy();
    expect(await db.entries.count()).toBe(1);
  });

  it("deletes their payments and credit, and tombstones both", async () => {
    const ann = await actions.createPerson("Ann");
    const ben = await actions.createPerson("Ben");
    const g = await actions.createGroup({ name: "My Car", ownerType: "me" });
    const cheap = await actions.createEntry({
      groupId: g.id,
      date: "2026-06-01",
      totalCost: 10,
      splitMethod: "equal",
      passengers: [{ who: person(ann.id) }],
    });
    const dear = await actions.createEntry({
      groupId: g.id,
      date: "2026-06-02",
      totalCost: 50,
      splitMethod: "equal",
      passengers: [{ who: person(ann.id) }, { who: person(ben.id) }],
    });
    // Ann overpays the RM10 fill-up by RM20, then puts that credit on the other.
    const pay = await actions.createPayment({
      entryId: cheap.id,
      who: person(ann.id),
      amount: 30,
      date: "2026-06-03",
    });
    const [app] = await actions.applyCredit({
      groupId: g.id,
      debtorWho: person(ann.id),
      creditorWho: ME,
      allocations: [{ entryId: dear.id, amount: 20 }],
    });
    expect(await db.creditApplications.count()).toBe(1);

    await actions.permanentlyDeletePerson(ann.id);

    expect(await db.payments.get(pay.id)).toBeUndefined();
    expect(await db.creditApplications.get(app.id)).toBeUndefined();
    expect(await db.people.get(ann.id)).toBeUndefined();
    expect(await tombstoned("people", ann.id)).toBe(true);
    expect(await tombstoned("payments", pay.id)).toBe(true);
    expect(await tombstoned("creditApplications", app.id)).toBe(true);
    // Ben rode the RM50 trip with Ann at RM25 each; that must not become RM50.
    expect(share(await priced(dear.id), person(ben.id))).toBeCloseTo(25);
  });
});

describe("permanentlyDeleteGroup", () => {
  it("takes its entries, payments and credit with it", async () => {
    const ann = await actions.createPerson("Ann");
    const g = await actions.createGroup({ name: "My Car", ownerType: "me" });
    const cheap = await actions.createEntry({
      groupId: g.id,
      date: "2026-06-01",
      totalCost: 10,
      splitMethod: "equal",
      passengers: [{ who: person(ann.id) }],
    });
    const dear = await actions.createEntry({
      groupId: g.id,
      date: "2026-06-02",
      totalCost: 50,
      splitMethod: "equal",
      passengers: [{ who: person(ann.id) }],
    });
    const pay = await actions.createPayment({
      entryId: cheap.id,
      who: person(ann.id),
      amount: 30,
      date: "2026-06-03",
    });
    const [app] = await actions.applyCredit({
      groupId: g.id,
      debtorWho: person(ann.id),
      creditorWho: ME,
      allocations: [{ entryId: dear.id, amount: 20 }],
    });

    await actions.permanentlyDeleteGroup(g.id);

    expect(await db.groups.get(g.id)).toBeUndefined();
    expect(await db.entries.count()).toBe(0);
    expect(await db.payments.count()).toBe(0);
    expect(await db.creditApplications.count()).toBe(0);
    expect(await tombstoned("groups", g.id)).toBe(true);
    expect(await tombstoned("entries", dear.id)).toBe(true);
    expect(await tombstoned("payments", pay.id)).toBe(true);
    expect(await tombstoned("creditApplications", app.id)).toBe(true);
    // The person themselves is untouched - only the car was deleted.
    expect(await db.people.get(ann.id)).toBeTruthy();
  });
});

describe("pinned shares are not permanent", () => {
  it("editing the trip afterwards puts it back on a live split", async () => {
    const ann = await actions.createPerson("Ann");
    const ben = await actions.createPerson("Ben");
    const g = await actions.createGroup({ name: "My Car", ownerType: "me" });
    const e = await actions.createEntry({
      groupId: g.id,
      date: "2026-06-01",
      totalCost: 90,
      splitMethod: "equal",
      passengers: [{ who: person(ann.id) }, { who: person(ben.id) }],
    });
    await actions.permanentlyDeletePerson(ann.id);
    expect(share(await priced(e.id), person(ben.id))).toBeCloseTo(45);

    // Any passenger edit rebuilds the rows, dropping the pin.
    await actions.updateEntry(e.id, { passengers: [{ who: person(ben.id) }] });
    const after = await priced(e.id);
    expect(after.passengers[0].pinnedShare).toBeUndefined();
    expect(share(after, person(ben.id))).toBeCloseTo(90);
  });
});
