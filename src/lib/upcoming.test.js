import { describe, it, expect } from "vitest";
import {
  upcomingWindowDays,
  isBeyondUpcomingWindow,
  partitionUpcoming,
} from "./upcoming.js";

// Fixed "today" so the tests don't drift: 11 July 2026 (local).
const REF = new Date(2026, 6, 11);

const E = (id, date) => ({ id, date });

describe("upcomingWindowDays", () => {
  it("maps known window values to day counts", () => {
    expect(upcomingWindowDays("off")).toBe(0);
    expect(upcomingWindowDays("7d")).toBe(7);
    expect(upcomingWindowDays("1mo")).toBe(30);
    expect(upcomingWindowDays("1yr")).toBe(365);
  });
  it("falls back to 1 month for unknown/missing", () => {
    expect(upcomingWindowDays(undefined)).toBe(30);
    expect(upcomingWindowDays("bogus")).toBe(30);
  });
});

describe("isBeyondUpcomingWindow", () => {
  it("never hides past or today entries", () => {
    expect(isBeyondUpcomingWindow("2026-07-01", 0, REF)).toBe(false);
    expect(isBeyondUpcomingWindow("2026-07-11", 0, REF)).toBe(false);
  });
  it("hides every future entry when the window is off (0 days)", () => {
    expect(isBeyondUpcomingWindow("2026-07-12", 0, REF)).toBe(true);
  });
  it("keeps entries within the window, hides those past its edge", () => {
    // 7-day window -> edge is 2026-07-18 (inclusive).
    expect(isBeyondUpcomingWindow("2026-07-15", 7, REF)).toBe(false);
    expect(isBeyondUpcomingWindow("2026-07-18", 7, REF)).toBe(false);
    expect(isBeyondUpcomingWindow("2026-07-19", 7, REF)).toBe(true);
  });
});

describe("partitionUpcoming", () => {
  const entries = [
    E("far", "2027-01-01"),
    E("mid", "2026-08-05"),
    E("near", "2026-07-15"),
    E("today", "2026-07-11"),
    E("past", "2026-07-01"),
  ];

  it("1-month window keeps near+mid visible, hides only the far one", () => {
    const { visible, hidden } = partitionUpcoming(entries, 30, REF);
    expect(visible.map((e) => e.id)).toEqual(["mid", "near", "today", "past"]);
    expect(hidden.map((e) => e.id)).toEqual(["far"]);
  });

  it("off (0 days) hides all upcoming, soonest-first", () => {
    const { visible, hidden } = partitionUpcoming(entries, 0, REF);
    expect(visible.map((e) => e.id)).toEqual(["today", "past"]);
    expect(hidden.map((e) => e.id)).toEqual(["near", "mid", "far"]);
  });

  it("preserves the incoming order of the visible entries", () => {
    const { visible } = partitionUpcoming(entries, 365, REF);
    expect(visible.map((e) => e.id)).toEqual(["far", "mid", "near", "today", "past"]);
  });
});
