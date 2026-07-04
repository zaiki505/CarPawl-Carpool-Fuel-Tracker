import { describe, it, expect } from "vitest";
import { monthlyCostTrend, monthVsLastMonth, costByPerson, refuelFrequency } from "./dashboardCharts.js";
import { ME, person } from "./identity.js";

const REF = new Date("2026-07-15T12:00:00"); // mid-July

describe("monthlyCostTrend", () => {
  it("buckets cost by calendar month, oldest first, zero-fills gaps", () => {
    const entries = [
      { date: "2026-05-10", totalCost: 50 },
      { date: "2026-07-03", totalCost: 90 },
      { date: "2026-07-20", totalCost: 30 },
    ];
    const trend = monthlyCostTrend(entries, { months: 3, ref: REF });
    expect(trend.map((t) => t.label)).toEqual(["May", "Jun", "Jul"]);
    expect(trend.map((t) => t.cost)).toEqual([50, 0, 120]);
  });
});

describe("monthVsLastMonth", () => {
  it("computes percent change between calendar months", () => {
    const entries = [
      { date: "2026-06-10", totalCost: 100 },
      { date: "2026-07-10", totalCost: 150 },
    ];
    const r = monthVsLastMonth(entries, { ref: REF });
    expect(r).toEqual({ thisMonth: 150, lastMonth: 100, pctChange: 50 });
  });

  it("null percent change when last month was zero", () => {
    const entries = [{ date: "2026-07-10", totalCost: 90 }];
    const r = monthVsLastMonth(entries, { ref: REF });
    expect(r.pctChange).toBeNull();
    expect(r.thisMonth).toBe(90);
  });
});

describe("costByPerson", () => {
  it("sums each passenger's share, sorted highest first", () => {
    const entries = [
      {
        date: "2026-07-01",
        totalCost: 90,
        totalDistance: 300,
        splitMethod: "distance",
        passengers: [
          { who: ME, distanceAssigned: 200 },
          { who: person("alex"), distanceAssigned: 100 },
        ],
      },
      {
        date: "2026-07-05",
        totalCost: 60,
        totalDistance: 200,
        splitMethod: "distance",
        passengers: [{ who: person("alex"), distanceAssigned: 200 }],
      },
    ];
    const peopleMap = new Map([["alex", { id: "alex", name: "Alex" }]]);
    const result = costByPerson(entries, peopleMap);
    expect(result[0]).toMatchObject({ name: "Alex", amount: 90 }); // 30 + 60
    expect(result[1]).toMatchObject({ name: "Me", amount: 60 });
  });

  it("empty entries -> empty list", () => {
    expect(costByPerson([], new Map())).toEqual([]);
  });
});

describe("refuelFrequency", () => {
  it("counts refuels per calendar month", () => {
    const entries = [
      { date: "2026-07-01" },
      { date: "2026-07-15" },
      { date: "2026-06-01" },
    ];
    const freq = refuelFrequency(entries, { months: 2, ref: REF });
    expect(freq).toEqual([
      { label: "Jun", count: 1 },
      { label: "Jul", count: 2 },
    ]);
  });
});
