/* Pure data-shaping for the dashboard chart carousel (#18). Each function takes
   a flat list of entries (already scoped to whichever vehicle(s) the carousel
   filter picked) and returns exactly what its chart needs to render. No React,
   no Recharts - keeps this side testable and the components dumb. */

import { shareOfRow } from "./calc.js";
import { whoKey } from "./identity.js";
import { whoName } from "./names.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Last `count` calendar months (oldest first) as [start, end) ranges. */
function lastMonths(count, ref) {
  const out = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
    out.push({
      label: start.toLocaleDateString(undefined, { month: "short" }),
      start,
      end: new Date(start.getFullYear(), start.getMonth() + 1, 1),
    });
  }
  return out;
}

const inRange = (entry, start, end) => {
  const d = new Date(entry.date);
  return d >= start && d < end;
};

/** [{label, cost}] for the last `months` calendar months, oldest first. */
export function monthlyCostTrend(entries, { months = 6, ref = new Date() } = {}) {
  return lastMonths(months, ref).map(({ label, start, end }) => ({
    label,
    cost: round2(
      entries
        .filter((e) => inRange(e, start, end))
        .reduce((sum, e) => sum + (Number(e.totalCost) || 0), 0)
    ),
  }));
}

/** This calendar month's total cost vs last month's, plus % change (null if
 *  last month was zero - nothing to compare against). */
export function monthVsLastMonth(entries, { ref = new Date() } = {}) {
  const [prev, cur] = lastMonths(2, ref);
  const sumIn = (bucket) =>
    round2(
      entries
        .filter((e) => inRange(e, bucket.start, bucket.end))
        .reduce((sum, e) => sum + (Number(e.totalCost) || 0), 0)
    );
  const thisMonth = sumIn(cur);
  const lastMonth = sumIn(prev);
  const pctChange = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 1000) / 10 : null;
  return { thisMonth, lastMonth, pctChange };
}

/** [{key, name, amount}] each passenger's total share across the entries,
 *  highest first. Includes "Me" wherever they're a billed passenger. */
export function costByPerson(entries, peopleMap) {
  const totals = new Map();
  for (const e of entries) {
    for (const p of e.passengers || []) {
      const key = whoKey(p.who);
      const row = totals.get(key) || { key, name: whoName(p.who, peopleMap), amount: 0 };
      row.amount += shareOfRow(e, p);
      totals.set(key, row);
    }
  }
  return [...totals.values()]
    .map((r) => ({ ...r, amount: round2(r.amount) }))
    .filter((r) => r.amount > 0.005)
    .sort((a, b) => b.amount - a.amount);
}

/** [{label, count}] refuels logged per calendar month, last `months` months. */
export function refuelFrequency(entries, { months = 6, ref = new Date() } = {}) {
  return lastMonths(months, ref).map(({ label, start, end }) => ({
    label,
    count: entries.filter((e) => inRange(e, start, end)).length,
  }));
}
