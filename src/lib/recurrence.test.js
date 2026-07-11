import { describe, it, expect } from "vitest";
import { advanceDate, nextFutureDate, isRecurring, recurrenceLabel } from "./recurrence.js";

describe("advanceDate", () => {
  it("advances by each cadence", () => {
    expect(advanceDate("2026-07-10", "daily")).toBe("2026-07-11");
    expect(advanceDate("2026-07-10", "weekly")).toBe("2026-07-17");
    expect(advanceDate("2026-07-10", "monthly")).toBe("2026-08-10");
    expect(advanceDate("2026-07-10", "yearly")).toBe("2027-07-10");
  });
  it("rolls over month and year boundaries", () => {
    expect(advanceDate("2026-12-31", "daily")).toBe("2027-01-01");
    expect(advanceDate("2026-11-15", "monthly")).toBe("2026-12-15");
    expect(advanceDate("2026-12-15", "monthly")).toBe("2027-01-15");
  });
  it("returns the date unchanged for a non-cadence", () => {
    expect(advanceDate("2026-07-10", "none")).toBe("2026-07-10");
  });
});

describe("nextFutureDate", () => {
  const ref = new Date(2026, 6, 10); // 10 Jul 2026, local

  it("returns the first occurrence strictly after today", () => {
    expect(nextFutureDate("2026-07-09", "daily", ref)).toBe("2026-07-11");
    expect(nextFutureDate("2026-07-09", "weekly", ref)).toBe("2026-07-16");
  });
  it("skips long-passed steps straight to the next future date (no back-fill)", () => {
    // A daily series untouched since January jumps to tomorrow, not to a pile
    // of past dates.
    expect(nextFutureDate("2026-01-01", "daily", ref)).toBe("2026-07-11");
  });
  it("treats today as not-yet-future (advances past it)", () => {
    expect(nextFutureDate("2026-06-10", "monthly", ref)).toBe("2026-08-10");
  });
  it("returns null for a non-recurring cadence", () => {
    expect(nextFutureDate("2026-07-09", "none", ref)).toBeNull();
  });
});

describe("isRecurring / recurrenceLabel", () => {
  it("recognises real cadences only", () => {
    expect(isRecurring("weekly")).toBe(true);
    expect(isRecurring("none")).toBe(false);
    expect(isRecurring(null)).toBe(false);
  });
  it("labels cadences and returns null for one-offs", () => {
    expect(recurrenceLabel("weekly")).toBe("Repeats weekly");
    expect(recurrenceLabel("none")).toBeNull();
    expect(recurrenceLabel(null)).toBeNull();
  });
});
