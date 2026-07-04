/* Carpool fuel-spend dashboard logic.

  Scope (user choice): "owned only, gross".
  - groupTotal = fuelCost of trips you drove (your own vehicles) in the period.
  - yourSpend = asDriver (full fuelCost of trips you drove) + asRider  (your split on carpool trips you rode), gross.
  - trend = % change of yourSpend vs the previous equivalent period.

   The core `computeFuelSpend` takes callbacks so it stays pure and
   testable; the dashboard adapts the entries into it. All money rounded to 2dp. */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const FUEL_PERIODS = [
  { value: "week", label: "1 Week" },
  { value: "month", label: "1 Month" },
  { value: "all", label: "All Time" },
];

/** [start, end) date range for the current period. */
export function periodRange(period, ref = new Date()) {
  const now = new Date(ref);
  if (period === "week") {
    const day = now.getDay(); // 0 Sun .. 6 Sat
    const backToMon = (day + 6) % 7;
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(now.getDate() - backToMon);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return { start, end };
  }
  if (period === "month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  // all time
  return { start: new Date(0), end: new Date(8640000000000000) };
}

/** Previous equivalent range, or null for "all time" (nothing to compare to). */
export function previousPeriodRange(period, ref = new Date()) {
  const now = new Date(ref);
  if (period === "week") {
    const { start } = periodRange("week", ref);
    const pStart = new Date(start);
    pStart.setDate(start.getDate() - 7);
    return { start: pStart, end: start };
  }
  if (period === "month") {
    return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 1),
    };
  }
  return null;
}

export const NO_BASELINE_MESSAGES = [
  "No history to race against, you're on gear one.",
  "Nothing before this, fresh tank, fresh start.",
  "First of its kind. Come back next period!",
  "Zero to compare with..",
];

/** Trend of `current` vs `previous`. Handles no-previous-period and /0. */
export function computeTrend(current, previous, seed = 0) {
  const message =
    NO_BASELINE_MESSAGES[Math.abs(seed) % NO_BASELINE_MESSAGES.length];
  if (previous === null || previous === undefined || previous === 0) {
    return {
      percentChange: null,
      direction: current > 0 ? "up" : "flat",
      message,
    };
  }
  const pct = round2(((current - previous) / previous) * 100);
  const direction = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return { percentChange: pct, direction };
}

/**
 * @param {Object} opts
 * @param {Array} opts.trips
 * @param {(t)=>boolean} opts.isDriver did the user drive this trip?
 * @param {(t)=>number}  opts.riderSplit user's split when a passenger (0 if not)
 * @param {(t)=>number}  [opts.fuelCost] trip fuel cost (default t.fuelCost)
 * @param {'week'|'month'|'all'} [opts.period]
 * @param {Date} [opts.ref]
 * @returns {{groupTotal:number, yourSpend:number,
 *   yourSpendBreakdown:{asDriver:number,asRider:number},
 *   trend:{percentChange:number|null, direction:'up'|'down'|'flat', message?:string}}}
 */
export function computeFuelSpend({
  trips,
  isDriver,
  riderSplit,
  fuelCost = (t) => t.fuelCost,
  period = "month",
  ref = new Date(),
}) {
  const inRange = (t, s, e) => {
    const d = new Date(t.date);
    return d >= s && d < e;
  };
  const spendOf = (list) =>
    round2(
      list.reduce(
        (sum, t) =>
          sum + (isDriver(t) ? Number(fuelCost(t)) || 0 : Number(riderSplit(t)) || 0),
        0
      )
    );

  const cur = periodRange(period, ref);
  const curTrips = (trips || []).filter((t) => inRange(t, cur.start, cur.end));

  const asDriver = round2(
    curTrips.filter(isDriver).reduce((s, t) => s + (Number(fuelCost(t)) || 0), 0)
  );
  const asRider = round2(
    curTrips.filter((t) => !isDriver(t)).reduce((s, t) => s + (Number(riderSplit(t)) || 0), 0)
  );
  const yourSpend = round2(asDriver + asRider);
  const groupTotal = asDriver; // owned-only scope

  const prev = previousPeriodRange(period, ref);
  let trend;
  if (!prev) {
    trend = computeTrend(yourSpend, null, curTrips.length);
  } else {
    const prevTrips = (trips || []).filter((t) => inRange(t, prev.start, prev.end));
    trend = computeTrend(yourSpend, spendOf(prevTrips), prevTrips.length);
  }

  return {
    groupTotal,
    yourSpend,
    yourSpendBreakdown: { asDriver, asRider },
    trend,
  };
}
