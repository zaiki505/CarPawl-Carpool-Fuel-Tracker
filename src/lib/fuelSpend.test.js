import { describe, it, expect } from "vitest";
import { computeFuelSpend, computeTrend } from "./fuelSpend.js";

// A user "u1". Driver when trip.driverId === 'u1'; rider split from riders[].
const isDriver = (t) => t.driverId === "u1";
const riderSplit = (t) =>
  (t.riders || []).find((r) => r.userId === "u1")?.splitAmount || 0;
const opts = (trips, period, ref) => ({
  trips,
  isDriver,
  riderSplit,
  fuelCost: (t) => t.fuelCost,
  period,
  ref,
});

const REF = new Date("2026-07-15T12:00:00"); // mid-July

describe("computeFuelSpend", () => {
  it("empty trip list -> zeros and a no-baseline trend", () => {
    const r = computeFuelSpend(opts([], "month", REF));
    expect(r.groupTotal).toBe(0);
    expect(r.yourSpend).toBe(0);
    expect(r.yourSpendBreakdown).toEqual({ asDriver: 0, asRider: 0 });
    expect(r.trend.percentChange).toBeNull();
    expect(r.trend.message).toBeTruthy();
  });

  it("user with no trips in the period -> zeros for the period", () => {
    const trips = [
      // June trip, outside July
      { id: "a", date: "2026-06-10", driverId: "u1", fuelCost: 100, riders: [] },
    ];
    const r = computeFuelSpend(opts(trips, "month", REF));
    expect(r.yourSpend).toBe(0);
    expect(r.groupTotal).toBe(0);
  });

  it("sums driver fuel + rider split within the month", () => {
    const trips = [
      { id: "a", date: "2026-07-03", driverId: "u1", fuelCost: 100, riders: [] },
      { id: "b", date: "2026-07-10", driverId: "u1", fuelCost: 60, riders: [] },
      // carpool: someone else drove, u1 rode with a 25 split
      { id: "c", date: "2026-07-11", driverId: "u2", fuelCost: 80, riders: [{ userId: "u1", splitAmount: 25 }] },
    ];
    const r = computeFuelSpend(opts(trips, "month", REF));
    expect(r.groupTotal).toBe(160); // driver fuel only (owned)
    expect(r.yourSpendBreakdown).toEqual({ asDriver: 160, asRider: 25 });
    expect(r.yourSpend).toBe(185);
  });

  it("previous period with zero spend -> null percent + funny message", () => {
    // Only a July trip; June (previous month) had nothing.
    const trips = [
      { id: "a", date: "2026-07-03", driverId: "u1", fuelCost: 90, riders: [] },
    ];
    const r = computeFuelSpend(opts(trips, "month", REF));
    expect(r.trend.percentChange).toBeNull();
    expect(r.trend.message).toBeTruthy();
    expect(r.trend.direction).toBe("up");
  });

  it("computes a percentage trend vs the previous month", () => {
    const trips = [
      { id: "jun", date: "2026-06-10", driverId: "u1", fuelCost: 100, riders: [] },
      { id: "jul", date: "2026-07-10", driverId: "u1", fuelCost: 150, riders: [] },
    ];
    const r = computeFuelSpend(opts(trips, "month", REF));
    expect(r.yourSpend).toBe(150);
    expect(r.trend.percentChange).toBe(50); // 100 -> 150
    expect(r.trend.direction).toBe("up");
  });

  it("this week only counts the current week", () => {
    const trips = [
      { id: "thisweek", date: "2026-07-14", driverId: "u1", fuelCost: 40, riders: [] },
      { id: "lastweek", date: "2026-07-06", driverId: "u1", fuelCost: 999, riders: [] },
    ];
    const r = computeFuelSpend(opts(trips, "week", REF));
    expect(r.yourSpend).toBe(40);
  });

  it("excludes upcoming (future-dated) trips from the current period", () => {
    const trips = [
      { id: "past", date: "2026-07-10", driverId: "u1", fuelCost: 100, riders: [] },
      { id: "future", date: "2026-07-20", driverId: "u1", fuelCost: 999, riders: [] }, // after REF
    ];
    const r = computeFuelSpend(opts(trips, "month", REF));
    expect(r.yourSpend).toBe(100);
    expect(r.groupTotal).toBe(100);
  });

  it("all time has no previous period (funny message, no percentage)", () => {
    const trips = [
      { id: "a", date: "2020-01-01", driverId: "u1", fuelCost: 10, riders: [] },
    ];
    const r = computeFuelSpend(opts(trips, "all", REF));
    expect(r.trend.percentChange).toBeNull();
    expect(r.trend.message).toBeTruthy();
  });
});

describe("computeTrend edge cases", () => {
  it("division by zero previous -> null", () => {
    expect(computeTrend(50, 0).percentChange).toBeNull();
  });
  it("down trend", () => {
    expect(computeTrend(50, 100)).toMatchObject({ percentChange: -50, direction: "down" });
  });
  it("flat trend", () => {
    expect(computeTrend(100, 100)).toMatchObject({ percentChange: 0, direction: "flat" });
  });

  // BATCH_1 #8: the dashboard passes myDriverSpend so a driver's spend is only
  // their own billed share, not the whole pump cost (passengers pay the rest).
  it("myDriverSpend overrides the driver's spend to their own share", () => {
    const trips = [
      // Own-car trip: RM100 pumped, but my own share is only RM40.
      { id: "a", date: "2026-07-10", driverId: "u1", fuelCost: 100, totalLiters: 50, riders: [] },
    ];
    const r = computeFuelSpend({
      ...opts(trips, "month", REF),
      myDriverSpend: () => 40,
    });
    expect(r.yourSpendBreakdown.asDriver).toBe(40);
    expect(r.yourSpend).toBe(40);
    // Litres track the money I'm on the hook for: 40/100 of 50 L = 20 L.
    expect(r.liters).toBe(20);
  });

  it("without myDriverSpend, a driver's spend stays the full gross cost", () => {
    const trips = [
      { id: "a", date: "2026-07-10", driverId: "u1", fuelCost: 100, totalLiters: 50, riders: [] },
    ];
    const r = computeFuelSpend(opts(trips, "month", REF));
    expect(r.yourSpendBreakdown.asDriver).toBe(100);
    expect(r.liters).toBe(50);
  });
});
