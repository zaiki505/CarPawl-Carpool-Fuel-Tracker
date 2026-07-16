import { describe, it, expect } from "vitest";
import { parseISODate, isFutureDate, formatMoneyCompact } from "./format.js";

/* Compact money keeps big figures narrow so they don't squeeze a row's left
   content (BATCH_1 #7). Default currency symbol is "RM". */
describe("formatMoneyCompact", () => {
  it("leaves sub-thousand values readable, no trailing-zero noise", () => {
    expect(formatMoneyCompact(0)).toBe("RM0");
    expect(formatMoneyCompact(5)).toBe("RM5");
    expect(formatMoneyCompact(12.5)).toBe("RM12.50");
    expect(formatMoneyCompact(999)).toBe("RM999");
  });
  it("collapses thousands to a k suffix with one decimal, dropping .0", () => {
    expect(formatMoneyCompact(1000)).toBe("RM1k");
    expect(formatMoneyCompact(1234)).toBe("RM1.2k");
    expect(formatMoneyCompact(12345)).toBe("RM12.3k");
  });
  it("collapses millions and keeps the sign", () => {
    expect(formatMoneyCompact(1_500_000)).toBe("RM1.5M");
    expect(formatMoneyCompact(-2000)).toBe("-RM2k");
  });
});

/* These two underpin the whole future-vs-past-refuel behaviour, so they're
   worth locking down. parseISODate must read a bare date in LOCAL time (never
   UTC) so the calendar day can't shift under a negative offset. */
describe("parseISODate", () => {
  it("parses 'YYYY-MM-DD' in local time (no UTC day-shift)", () => {
    const d = parseISODate("2026-07-04");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6); // July (0-indexed)
    expect(d.getDate()).toBe(4);
    expect(d.getHours()).toBe(0); // local midnight, not UTC midnight
  });

  it("returns null for blank / nullish input", () => {
    expect(parseISODate("")).toBeNull();
    expect(parseISODate(null)).toBeNull();
    expect(parseISODate(undefined)).toBeNull();
  });

  it("returns null for garbage", () => {
    expect(parseISODate("not-a-date")).toBeNull();
  });

  it("passes a valid Date instance straight through", () => {
    const d = new Date(2026, 0, 1);
    expect(parseISODate(d)).toBe(d);
  });

  it("parses a full ISO timestamp via the native parser", () => {
    const d = parseISODate("2026-07-04T09:30:00.000Z");
    expect(d).toBeInstanceOf(Date);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });
});

describe("isFutureDate", () => {
  const ref = new Date("2026-07-15T12:00:00"); // local mid-July

  it("is true only for dates strictly after today", () => {
    expect(isFutureDate("2026-07-20", ref)).toBe(true);
  });

  it("is false for today", () => {
    expect(isFutureDate("2026-07-15", ref)).toBe(false);
  });

  it("is false for a past date", () => {
    expect(isFutureDate("2026-07-10", ref)).toBe(false);
  });

  it("ignores the time-of-day of ref (date-only comparison)", () => {
    // ref late in the day; an entry dated the same day is still 'today', not future
    expect(isFutureDate("2026-07-15", new Date("2026-07-15T23:59:00"))).toBe(false);
  });

  it("is false for blank / invalid dates (never treated as future)", () => {
    expect(isFutureDate("", ref)).toBe(false);
    expect(isFutureDate(null, ref)).toBe(false);
    expect(isFutureDate(undefined, ref)).toBe(false);
  });
});
