import { describe, it, expect } from "vitest";
import { buildWhatsAppText } from "./exportText.js";
import { person, ME } from "./identity.js";

/* The shared balances text must net out applied credit, same as every other
   balance view (v0.2.9 BATCH_2 #1 - credit consistency). */
const ben = person("ben");
const peopleMap = new Map([["ben", { id: "ben", name: "Ben" }]]);
const group = { id: "g1", name: "Ben's Civic", ownerType: "person", ownerPersonId: "far" };
// Ben owes RM50 on a carpool trip (equal split, one passenger => share = cost).
const entries = [
  { id: "e2", date: "2026-02-01", splitMethod: "equal", totalCost: 50, passengers: [{ who: ben }] },
];
const payments = [];

describe("buildWhatsAppText credit netting", () => {
  it("lists the debt when no credit is applied", () => {
    const text = buildWhatsAppText(group, entries, payments, peopleMap, []);
    expect(text).toContain("Ben");
    expect(text).toContain("RM50");
    expect(text).not.toContain("all settled");
  });

  it("nets out a credit application that fully covers the debt", () => {
    const apps = [
      { id: "a1", targetEntryId: "e2", debtorWho: ben, amount: 50, reversedAt: null },
    ];
    const text = buildWhatsAppText(group, entries, payments, peopleMap, apps);
    expect(text).toContain("all settled");
    expect(text).not.toMatch(/Ben: RM50/);
  });
});

/* The one who paid the pump is never owed by themselves. The Balances screen
   drops them; the shared text must too, or a carpool owner riding along gets
   exported as owing themselves. */
describe("buildWhatsAppText never bills the pump payer", () => {
  const far = person("far");
  const withOwnerAboard = [
    {
      id: "e9",
      date: "2026-02-01",
      splitMethod: "equal",
      totalCost: 60,
      passengers: [{ who: far }, { who: ben }],
    },
  ];

  it("a carpool owner riding along is not listed as owing", () => {
    // far owns this carpool AND rode in it.
    const g = { id: "g9", name: "Far's Civic", ownerType: "person", ownerPersonId: "far" };
    const map = new Map([
      ["ben", { id: "ben", name: "Ben" }],
      ["far", { id: "far", name: "Far" }],
    ]);
    const text = buildWhatsAppText(g, withOwnerAboard, [], map, []);
    expect(text).toContain("Ben");
    expect(text).not.toContain("Far:"); // never owed to themselves
  });

  it("my own share is not listed in my own car", () => {
    const g = { id: "g8", name: "My Myvi", ownerType: "me", ownerPersonId: null };
    const mine = [
      { id: "e8", date: "2026-02-01", splitMethod: "equal", totalCost: 60, passengers: [{ who: ME }, { who: ben }] },
    ];
    const map = new Map([["ben", { id: "ben", name: "Ben" }]]);
    const text = buildWhatsAppText(g, mine, [], map, []);
    expect(text).toContain("Ben");
    expect(text).not.toMatch(/You: RM|Me: RM/);
  });
});
