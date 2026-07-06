import { describe, it, expect } from "vitest";
import {
  deriveEntryTotals,
  entryEfficiency,
  share,
  shareOfRow,
  outstanding,
  statusOf,
  balanceForWho,
  groupBalances,
  totalOwedToYou,
  totalYouOwe,
  thisMonthConsumption,
  efficiencyTrend,
  driverCompBase,
  tollsTotal,
  entryTotalBillable,
  entryShares,
} from "./calc.js";
import { ME, person } from "./identity.js";

const alex = person("alex");
const sam = person("sam");

/* --------------------------- Fuel math --------------------------- */
describe("deriveEntryTotals", () => {
  it("cost primary derives liters then distance", () => {
    const r = deriveEntryTotals({
      primaryField: "cost",
      primaryValue: 100,
      pricePerLiter: 2,
      kmPerLiter: 12,
    });
    expect(r.totalCost).toBe(100);
    expect(r.totalLiters).toBe(50);
    expect(r.totalDistance).toBe(600);
    expect(r.hasMeasuredEfficiency).toBe(false);
  });

  it("liters primary derives cost + distance", () => {
    const r = deriveEntryTotals({
      primaryField: "liters",
      primaryValue: 30,
      pricePerLiter: 2.05,
      kmPerLiter: 10,
    });
    expect(r.totalLiters).toBe(30);
    expect(r.totalCost).toBeCloseTo(61.5, 5);
    expect(r.totalDistance).toBe(300);
  });

  it("distance primary derives liters + cost", () => {
    const r = deriveEntryTotals({
      primaryField: "distance",
      primaryValue: 240,
      pricePerLiter: 2,
      kmPerLiter: 12,
    });
    expect(r.totalDistance).toBe(240);
    expect(r.totalLiters).toBe(20);
    expect(r.totalCost).toBe(40);
  });

  it("optional real distance (cost primary) sets measured efficiency", () => {
    const r = deriveEntryTotals({
      primaryField: "cost",
      primaryValue: 100,
      pricePerLiter: 2,
      kmPerLiter: 12,
      measuredDistance: 540, // real trip shorter than the 600 default implies
    });
    expect(r.totalLiters).toBe(50);
    expect(r.totalDistance).toBe(540);
    expect(r.hasMeasuredEfficiency).toBe(true);
    expect(entryEfficiency({ ...r })).toBeCloseTo(10.8, 5);
  });

  it("optional real liters (distance primary) overrides derived liters + cost", () => {
    const r = deriveEntryTotals({
      primaryField: "distance",
      primaryValue: 240,
      pricePerLiter: 2,
      kmPerLiter: 12,
      measuredLiters: 22, // real liters more than the 20 default implies
    });
    expect(r.totalDistance).toBe(240);
    expect(r.totalLiters).toBe(22);
    expect(r.totalCost).toBe(44);
    expect(r.hasMeasuredEfficiency).toBe(true);
    expect(entryEfficiency(r)).toBeCloseTo(240 / 22, 5);
  });

  it("unmeasured entry has null efficiency", () => {
    const r = deriveEntryTotals({
      primaryField: "cost",
      primaryValue: 50,
      pricePerLiter: 2,
      kmPerLiter: 10,
    });
    expect(entryEfficiency(r)).toBeNull();
  });
});

/* ---------------------- Split methods ---------------------- */
describe("split methods", () => {
  const passengers = [
    { who: alex, distanceAssigned: 300 },
    { who: sam, distanceAssigned: 150 },
  ];

  it("distance is the default when splitMethod is absent", () => {
    const e = { id: "e", totalCost: 60, totalDistance: 300, passengers };
    expect(share(e, alex)).toBe(60);
    expect(share(e, sam)).toBe(30);
  });

  it("equal splits fuel cost evenly among riders", () => {
    const e = {
      id: "e",
      splitMethod: "equal",
      totalCost: 60,
      totalDistance: 300,
      passengers,
    };
    expect(share(e, alex)).toBe(30);
    expect(share(e, sam)).toBe(30);
    expect(entryTotalBillable(e)).toBe(60);
  });

  describe("driver_comp (\"Compensate\")", () => {
    it("equal distances (what every real entry has today) behaves exactly like the old flat equal split", () => {
      const equalDistancePax = [
        { who: alex, distanceAssigned: 300 },
        { who: sam, distanceAssigned: 300 },
      ];
      const e = {
        id: "e",
        splitMethod: "driver_comp",
        totalCost: 60,
        tolls: 10,
        parking: 5,
        maintenancePct: 10,
        totalDistance: 300,
        passengers: equalDistancePax,
      };
      // base = (60+5) * 1.10 = 71.5, tolls = 10 pass-through -> 81.5 total,
      // split evenly across 2 equal-distance riders = 40.75 each.
      expect(driverCompBase(e)).toBeCloseTo(71.5, 5);
      expect(tollsTotal(e)).toBe(10);
      expect(share(e, alex)).toBeCloseTo(40.75, 5);
      expect(share(e, sam)).toBeCloseTo(40.75, 5);
    });

    it("remainder splits EQUALLY by default (ignores distance)", () => {
      const e = {
        id: "e",
        splitMethod: "driver_comp",
        totalCost: 60,
        parking: 0,
        maintenancePct: 0,
        totalDistance: 300,
        passengers, // alex 300, sam 150 - distance ignored under equal
      };
      expect(share(e, alex)).toBeCloseTo(30, 5);
      expect(share(e, sam)).toBeCloseTo(30, 5);
    });

    it("customRemainderSplit 'distance' weights the base by distance", () => {
      const e = {
        id: "e",
        splitMethod: "driver_comp",
        customRemainderSplit: "distance",
        totalCost: 60,
        parking: 0,
        maintenancePct: 0,
        totalDistance: 300,
        passengers, // alex 300, sam 150 -> 2:1
      };
      // base = 60, split 2:1 -> alex 40, sam 20
      expect(share(e, alex)).toBeCloseTo(40, 5);
      expect(share(e, sam)).toBeCloseTo(20, 5);
    });

    it("a manual override is subtractive - it reduces the pool the rest split", () => {
      const e = {
        id: "e",
        splitMethod: "driver_comp",
        totalCost: 90,
        parking: 0,
        maintenancePct: 0,
        totalDistance: 300,
        passengers: [
          { who: alex, distanceAssigned: 300, manualOverride: 15 },
          { who: sam, distanceAssigned: 300 },
        ],
      };
      expect(share(e, alex)).toBe(15);
      expect(share(e, sam)).toBe(75); // base pool 90 - 15 override = 75, sam covers it
      // total collected == the actual cost, no over-recovery
      expect(entryTotalBillable(e)).toBe(90);
    });

    it("override + tolls: overridden rider pays only their fixed amount, others cover base remainder + tolls", () => {
      const jo = person("jo");
      const e = {
        id: "e",
        splitMethod: "driver_comp",
        totalCost: 90, // base (parking 0, maint 0) = 90
        parking: 0,
        maintenancePct: 0,
        tolls: 20,
        totalDistance: 300,
        passengers: [
          { who: alex, distanceAssigned: 100, manualOverride: 15 },
          { who: sam, distanceAssigned: 100 },
          { who: jo, distanceAssigned: 100 },
        ],
      };
      // base pool = 90 - 15 = 75, split equally between sam & jo = 37.5 each.
      // tolls 20 split between the two non-overridden present = 10 each.
      expect(share(e, alex)).toBe(15);
      expect(share(e, sam)).toBe(47.5);
      expect(share(e, jo)).toBe(47.5);
      expect(entryTotalBillable(e)).toBe(110); // 90 base + 20 tolls
    });

    it("tolls only bill passengers marked present; absent/overridden riders owe nothing toward them", () => {
      const jo = person("jo");
      const e = {
        id: "e",
        splitMethod: "driver_comp",
        totalCost: 0,
        parking: 0,
        maintenancePct: 0,
        tolls: 20,
        totalDistance: 300,
        tollsPresentWho: [alex], // present: alex only
        passengers: [
          { who: alex, distanceAssigned: 100 },
          { who: sam, distanceAssigned: 100 },
          { who: jo, distanceAssigned: 100 },
        ],
      };
      // Only alex was present for the toll -> alex owes the full 20, everyone else 0.
      expect(share(e, alex)).toBe(20);
      expect(share(e, sam)).toBe(0);
      expect(share(e, jo)).toBe(0);
    });

    it("missing tollsPresentWho means everyone was present (backward compatible)", () => {
      const e = {
        id: "e",
        splitMethod: "driver_comp",
        totalCost: 0,
        tolls: 20,
        totalDistance: 300,
        passengers: [
          { who: alex, distanceAssigned: 100 },
          { who: sam, distanceAssigned: 100 },
        ],
      };
      expect(share(e, alex)).toBe(10);
      expect(share(e, sam)).toBe(10);
    });
  });

  it("shareOfRow matches share", () => {
    const e = { splitMethod: "equal", totalCost: 90, passengers };
    expect(shareOfRow(e, passengers[0])).toBe(45);
  });
});

/* ---------------------- cent rounding ---------------------- */
describe("cent-accurate shares", () => {
  const alx = person("alex");
  const sm = person("sam");
  const jo = person("jo");

  it("RM10 / 3 gives clean 2dp shares that sum EXACTLY to 10 (largest-remainder)", () => {
    const e = {
      splitMethod: "equal",
      totalCost: 10,
      passengers: [{ who: alx }, { who: sm }, { who: jo }],
    };
    const shares = entryShares(e);
    // every share is a whole number of cents
    shares.forEach((s) => expect(Math.round(s * 100)).toBe(s * 100));
    // they add up to exactly the total, not 9.99
    expect(shares.reduce((a, b) => a + b, 0)).toBe(10);
    expect(entryTotalBillable(e)).toBe(10);
    // 3.33 / 3.33 / 3.34 in some order
    expect([...shares].sort()).toEqual([3.33, 3.33, 3.34]);
  });

  it("paying the shown (rounded) share settles a passenger to exactly zero", () => {
    const e = {
      id: "e",
      splitMethod: "equal",
      totalCost: 10,
      passengers: [{ who: alx }, { who: sm }, { who: jo }],
    };
    const alxShare = share(e, alx); // 3.33 or 3.34, always 2dp
    const payments = [{ entryId: "e", who: alx, amount: alxShare }];
    expect(outstanding(e, alx, payments)).toBe(0);
    expect(statusOf(e, alx, payments)).toBe("paid");
  });

  it("no phantom balance: once everyone pays their shown share, owed is exactly 0", () => {
    const e = {
      id: "e",
      splitMethod: "equal",
      totalCost: 10,
      passengers: [{ who: alx }, { who: sm }, { who: jo }],
    };
    const payments = [alx, sm, jo].map((w) => ({
      entryId: "e",
      who: w,
      amount: share(e, w),
    }));
    for (const w of [alx, sm, jo]) {
      expect(balanceForWho([e], w, payments).owed).toBe(0);
    }
    expect(totalOwedToYou([{ id: "g" }], { g: [e] }, payments)).toBe(0);
  });
});

/* ---------------------- share + outstanding ---------------------- */
describe("share & outstanding", () => {
  const entry = {
    id: "e1",
    totalCost: 60,
    totalDistance: 300,
    passengers: [
      { who: alex, distanceAssigned: 300 },
      { who: sam, distanceAssigned: 150 }, // dropped off early
    ],
  };

  it("share is proportional to assigned distance", () => {
    expect(share(entry, alex)).toBe(60); // full distance -> full cost share basis
    expect(share(entry, sam)).toBe(30); // half distance
  });

  it("untagged distance is never billed", () => {
    const e = {
      id: "e2",
      totalCost: 60,
      totalDistance: 300,
      passengers: [{ who: alex, distanceAssigned: 100 }],
    };
    // alex rides 100 of 300km -> owes a third; the other 200km is owner's own
    expect(share(e, alex)).toBeCloseTo(20, 5);
  });

  it("outstanding subtracts payments and can go negative", () => {
    const payments = [
      { id: "p1", entryId: "e1", who: alex, amount: 20 },
      { id: "p2", entryId: "e1", who: sam, amount: 35 }, // overpaid by 5
    ];
    expect(outstanding(entry, alex, payments)).toBe(40);
    expect(outstanding(entry, sam, payments)).toBe(-5);
  });

  it("status labels", () => {
    const p = [
      { entryId: "e1", who: alex, amount: 0 },
      { entryId: "e1", who: sam, amount: 30 },
    ];
    expect(statusOf(entry, alex, p)).toBe("unpaid");
    expect(statusOf(entry, sam, p)).toBe("paid");
    expect(
      statusOf(entry, alex, [{ entryId: "e1", who: alex, amount: 25 }])
    ).toBe("partial");
    expect(
      statusOf(entry, sam, [{ entryId: "e1", who: sam, amount: 40 }])
    ).toBe("credit");
  });
});

/* ------------------------ Balances ------------------------ */
describe("balances (owed & credit never netted)", () => {
  const entries = [
    {
      id: "e1",
      groupId: "g1",
      totalCost: 30,
      totalDistance: 100,
      passengers: [{ who: alex, distanceAssigned: 100 }],
    },
    {
      id: "e2",
      groupId: "g1",
      totalCost: 20,
      totalDistance: 100,
      passengers: [{ who: alex, distanceAssigned: 100 }],
    },
  ];
  // On e1 Alex owes 30 (unpaid). On e2 Alex overpays: share 20, pays 25 -> -5.
  const payments = [{ id: "p", entryId: "e2", who: alex, amount: 25 }];

  it("credit on one entry does not reduce owed on another", () => {
    const b = balanceForWho(entries, alex, payments);
    expect(b.owed).toBe(30);
    expect(b.credit).toBe(5);
  });

  it("groupBalances lists each passenger once", () => {
    const rows = groupBalances(entries, payments);
    expect(rows).toHaveLength(1);
    expect(rows[0].owed).toBe(30);
    expect(rows[0].credit).toBe(5);
  });
});

/* ------------------------ Dashboard totals ------------------------ */
describe("dashboard totals", () => {
  const ownedGroups = [{ id: "g1", ownerType: "me" }];
  const nonOwnedGroups = [{ id: "g2", ownerType: "person", ownerPersonId: "d" }];
  const entriesByGroup = {
    g1: [
      {
        id: "e1",
        groupId: "g1",
        totalCost: 30,
        totalDistance: 100,
        passengers: [{ who: alex, distanceAssigned: 100 }],
      },
      {
        id: "e2",
        groupId: "g1",
        totalCost: 20,
        totalDistance: 100,
        passengers: [{ who: sam, distanceAssigned: 100 }],
      },
    ],
    g2: [
      {
        id: "e3",
        groupId: "g2",
        totalCost: 40,
        totalDistance: 100,
        passengers: [{ who: ME, distanceAssigned: 100 }],
      },
    ],
  };

  it("total owed to you sums owed across owned groups, ignoring credit", () => {
    const payments = [{ entryId: "e2", who: sam, amount: 25 }]; // sam credit 5
    expect(totalOwedToYou(ownedGroups, entriesByGroup, payments)).toBe(30);
  });

  it("total you owe sums your outstanding share in non-owned groups", () => {
    expect(totalYouOwe(nonOwnedGroups, entriesByGroup, [])).toBe(40);
    const paid = [{ entryId: "e3", who: ME, amount: 15 }];
    expect(totalYouOwe(nonOwnedGroups, entriesByGroup, paid)).toBe(25);
  });
});

/* ------------------------ This month consumption ------------------------ */
describe("This month consumption (owned, by entry date)", () => {
  const ref = new Date("2026-07-15T00:00:00");
  const ownedGroups = [{ id: "g1" }];
  const entriesByGroup = {
    g1: [
      { id: "e1", date: "2026-07-03", totalCost: 100, totalLiters: 48 },
      { id: "e2", date: "2026-07-11", totalCost: 50, totalLiters: 24 },
      { id: "e0", date: "2026-06-30", totalCost: 90, totalLiters: 40 },
    ],
  };
  it("sums cost + liters for the month only", () => {
    const c = thisMonthConsumption({ ownedGroups, entriesByGroup, ref });
    expect(c.cost).toBe(150);
    expect(c.liters).toBe(72);
  });
});

/* ------------------------ This month efficiency trend ------------------------ */
describe("This month efficiency trend", () => {
  const ref = new Date("2026-07-30T00:00:00");
  const entries = [
    { id: "e1", date: "2026-07-20", hasMeasuredEfficiency: true, totalDistance: 540, totalLiters: 50 },
    { id: "e2", date: "2026-07-10", hasMeasuredEfficiency: false, totalDistance: 600, totalLiters: 50 },
    { id: "e3", date: "2026-06-01", hasMeasuredEfficiency: true, totalDistance: 500, totalLiters: 50 }, // >30d out
    { id: "e4", date: "2026-07-25", hasMeasuredEfficiency: true, totalDistance: 480, totalLiters: 40 },
  ];
  it("plots only measured entries in the last 30 days, sorted by date", () => {
    const pts = efficiencyTrend(entries, { days: 30, ref });
    expect(pts.map((p) => p.id ?? p.date)).toEqual(["2026-07-20", "2026-07-25"]);
    expect(pts[0].efficiency).toBeCloseTo(10.8, 5);
    expect(pts[1].efficiency).toBeCloseTo(12, 5);
  });
  it("returns empty when no measured entries", () => {
    const pts = efficiencyTrend(
      [{ date: "2026-07-20", hasMeasuredEfficiency: false, totalDistance: 1, totalLiters: 1 }],
      { days: 30, ref }
    );
    expect(pts).toHaveLength(0);
  });
});
