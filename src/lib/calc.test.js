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
  thisMonthSpend,
  thisMonthConsumption,
  efficiencyTrend,
  driverCompBase,
  entryTotalBillable,
} from "./calc.js";
import { ME, person } from "./identity.js";

const alex = person("alex");
const sam = person("sam");

/* --------------------------- 4.1 fuel math --------------------------- */
describe("4.1 deriveEntryTotals", () => {
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

/* ---------------------- split methods ---------------------- */
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

  it("equal splits fuel cost evenly among riders (owner not charged)", () => {
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

  it("driver_comp adds tolls+parking+maintenance markup, split equally", () => {
    const e = {
      id: "e",
      splitMethod: "driver_comp",
      totalCost: 60,
      tolls: 10,
      parking: 5,
      maintenancePct: 10,
      totalDistance: 300,
      passengers,
    };
    // base = (60+10+5) * 1.10 = 82.5 ; each of 2 riders = 41.25
    expect(driverCompBase(e)).toBeCloseTo(82.5, 5);
    expect(share(e, alex)).toBeCloseTo(41.25, 5);
    expect(share(e, sam)).toBeCloseTo(41.25, 5);
    expect(entryTotalBillable(e)).toBeCloseTo(82.5, 5);
  });

  it("shareOfRow matches share", () => {
    const e = { splitMethod: "equal", totalCost: 90, passengers };
    expect(shareOfRow(e, passengers[0])).toBe(45);
  });
});

/* ---------------------- 4.2 / 4.3 share + outstanding ---------------------- */
describe("4.2 share & 4.3 outstanding", () => {
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

/* ------------------------ 4.4 balances ------------------------ */
describe("4.4 balances (owed & credit never netted)", () => {
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

/* ------------------------ 4.5 dashboard totals ------------------------ */
describe("4.5 dashboard totals", () => {
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

/* ------------------------ 4.6 month spend ------------------------ */
describe("4.6 this month's spend (cash flow, mixed date fields)", () => {
  const ref = new Date("2026-07-15T00:00:00");
  const ownedGroups = [{ id: "g1" }];
  const nonOwnedGroups = [{ id: "g2" }];
  const entriesByGroup = {
    g1: [
      // this month fuel
      { id: "e1", groupId: "g1", date: "2026-07-03", totalCost: 100, passengers: [{ who: alex, distanceAssigned: 100 }], totalDistance: 100 },
      // last month fuel (excluded)
      { id: "e0", groupId: "g1", date: "2026-06-20", totalCost: 80, passengers: [], totalDistance: 100 },
    ],
    g2: [
      { id: "e2", groupId: "g2", date: "2026-06-28", totalCost: 60, passengers: [{ who: ME, distanceAssigned: 100 }], totalDistance: 100 },
    ],
  };
  const payments = [
    // alex pays me this month for e1 -> reduces spend
    { entryId: "e1", who: alex, amount: 40, date: "2026-07-10" },
    // I pay toward my share on e2 this month (entry was last month) -> adds spend
    { entryId: "e2", who: ME, amount: 25, date: "2026-07-05" },
    // a payment last month -> excluded
    { entryId: "e1", who: alex, amount: 10, date: "2026-06-30" },
  ];

  it("buckets fuel by entry date and payments by payment date", () => {
    const spend = thisMonthSpend({
      ownedGroups,
      nonOwnedGroups,
      entriesByGroup,
      payments,
      ref,
    });
    // 100 (fuel e1) - 40 (alex paid) + 25 (my share on non-owned) = 85
    expect(spend).toBe(85);
  });
});

/* ------------------------ 4.7 consumption ------------------------ */
describe("4.7 month consumption (owned, by entry date)", () => {
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

/* ------------------------ 4.8 efficiency trend ------------------------ */
describe("4.8 efficiency trend", () => {
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
