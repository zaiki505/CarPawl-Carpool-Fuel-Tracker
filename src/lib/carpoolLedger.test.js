import { describe, it, expect, vi } from "vitest";
import {
  equalSplit,
  distanceSplit,
  computeEntryShares,
  applyEntryToBalances,
  computeBalances,
  balancesToArray,
  simplifyDebts,
} from "./carpoolLedger.js";
import { person } from "./identity.js";

const alex = person("alex");
const sam = person("sam");
const jo = person("jo");
const priya = person("priya");

describe("equalSplit", () => {
  it("RM10 across 3 people doesn't lose or gain a cent (uneven division)", () => {
    const shares = equalSplit({ totalCost: 10, passengers: [{ who: alex }, { who: sam }, { who: jo }] });
    expect(shares).toEqual([3.33, 3.33, 3.34]);
    expect(shares.reduce((s, v) => s + v, 0)).toBeCloseTo(10, 2);
  });
});

describe("distanceSplit", () => {
  it("splits proportionally to distance when all data is present", () => {
    const shares = distanceSplit({
      totalCost: 90,
      totalDistance: 300,
      passengers: [{ who: alex, distanceAssigned: 200 }, { who: sam, distanceAssigned: 100 }],
    });
    expect(shares).toEqual([60, 30]);
  });

  it("falls back to equal split and warns when a passenger is missing distance", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const entry = {
      id: "trip1",
      totalCost: 90,
      totalDistance: 300,
      passengers: [{ who: alex, distanceAssigned: 200 }, { who: sam }], // sam has no distanceAssigned
    };
    const shares = distanceSplit(entry);
    expect(shares).toEqual([45, 45]); // equal-split fallback, not distance-weighted
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("trip1");
    warn.mockRestore();
  });

  it("falls back to equal split when totalDistance itself is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const shares = distanceSplit({
      id: "trip2",
      totalCost: 40,
      passengers: [{ who: alex, distanceAssigned: 10 }, { who: sam, distanceAssigned: 30 }],
    });
    expect(shares).toEqual([20, 20]);
    warn.mockRestore();
  });
});

describe("computeEntryShares (manual override + remaining auto-split)", () => {
  it("overridden passenger pays exactly their amount; the rest split the remainder by distance", () => {
    const entry = {
      id: "trip3",
      totalCost: 100,
      totalDistance: 300,
      splitMethod: "distance",
      passengers: [
        { who: alex, manualOverride: 20 }, // fixed contribution
        { who: sam, distanceAssigned: 150 },
        { who: jo, distanceAssigned: 150 },
      ],
    };
    const shares = computeEntryShares(entry);
    // 100 - 20 override = 80 remaining, split 50/50 by equal distance -> 40 each
    expect(shares).toEqual([
      { who: alex, amount: 20 },
      { who: sam, amount: 40 },
      { who: jo, amount: 40 },
    ]);
  });

  it("a partially-specified manual trip falls back to equal split for the stragglers", () => {
    const entry = {
      totalCost: 60,
      splitMethod: "manual",
      passengers: [
        { who: alex, manualOverride: 30 },
        { who: sam },
        { who: jo },
      ],
    };
    const shares = computeEntryShares(entry);
    expect(shares).toEqual([
      { who: alex, amount: 30 },
      { who: sam, amount: 15 },
      { who: jo, amount: 15 },
    ]);
  });

  it("every passenger overridden - no remaining split needed", () => {
    const entry = {
      totalCost: 50,
      splitMethod: "equal",
      passengers: [{ who: alex, manualOverride: 20 }, { who: sam, manualOverride: 30 }],
    };
    expect(computeEntryShares(entry)).toEqual([
      { who: alex, amount: 20 },
      { who: sam, amount: 30 },
    ]);
  });
});

describe("balance tracking across a rotating driver", () => {
  it("credits whoever drove each trip and debits their passengers, netting over time", () => {
    // Trip 1: Alex drives, Sam + Jo ride, equal split of 30 -> 15 each
    const trip1 = {
      id: "t1",
      driverWho: alex,
      totalCost: 30,
      splitMethod: "equal",
      passengers: [{ who: sam }, { who: jo }],
    };
    // Trip 2: Sam drives, Alex + Jo ride, equal split of 30 -> 15 each
    const trip2 = {
      id: "t2",
      driverWho: sam,
      totalCost: 30,
      splitMethod: "equal",
      passengers: [{ who: alex }, { who: jo }],
    };

    const balances = computeBalances([trip1, trip2]);
    const byName = Object.fromEntries(
      balancesToArray(balances).map((b) => [b.who.personId, b.amountOwed])
    );

    // This is a running tab, not settle-per-trip: Alex fronted $30 driving t1
    // (nobody's paid that back yet) then rode t2 owing $15 - still net owed
    // $15 until an actual settle-up happens. Same shape for Sam.
    expect(byName.alex).toBe(-15);
    expect(byName.sam).toBe(-15);
    // Jo rode both trips and never drove: owes 15 + 15 = 30
    expect(byName.jo).toBe(30);
    // A proper ledger always nets to zero across the group.
    expect(Object.values(byName).reduce((s, v) => s + v, 0)).toBe(0);
  });

  it("applyEntryToBalances is a pure fold - same input, same output, no mutation of the prior map", () => {
    const before = new Map();
    const after = applyEntryToBalances(before, {
      driverWho: alex,
      totalCost: 20,
      splitMethod: "equal",
      passengers: [{ who: sam }],
    });
    expect(before.size).toBe(0); // original untouched
    expect(after.size).toBe(2);
  });
});

describe("simplifyDebts", () => {
  it("settles 4+ people in a small number of greedy-matched transactions", () => {
    const balances = [
      { who: alex, amountOwed: 30 },
      { who: sam, amountOwed: 20 },
      { who: jo, amountOwed: -25 },
      { who: priya, amountOwed: -25 },
    ];
    const txns = simplifyDebts(balances);

    // Every debtor's total outgoing matches their balance, every creditor's
    // total incoming matches theirs - the settlement is correct regardless of
    // exactly how transactions are grouped.
    const paidBy = (who) => txns.filter((t) => t.from === who).reduce((s, t) => s + t.amount, 0);
    const paidTo = (who) => txns.filter((t) => t.to === who).reduce((s, t) => s + t.amount, 0);
    expect(paidBy(alex)).toBe(30);
    expect(paidBy(sam)).toBe(20);
    expect(paidTo(jo)).toBe(25);
    expect(paidTo(priya)).toBe(25);
    expect(txns.length).toBeLessThanOrEqual(3); // never more than debtors+creditors-1
  });

  it("already-settled balances produce zero transactions", () => {
    expect(simplifyDebts([{ who: alex, amountOwed: 0 }, { who: sam, amountOwed: 0.004 }])).toEqual([]);
  });

  it("ignores dust below the 0.005 rounding threshold", () => {
    const txns = simplifyDebts([
      { who: alex, amountOwed: 0.004 },
      { who: sam, amountOwed: -0.004 },
    ]);
    expect(txns).toEqual([]);
  });
});
