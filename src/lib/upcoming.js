import { parseISODate } from "./format.js";

/* Upcoming-trip visibility window.

   Future-dated entries that fall beyond the window are collapsed behind a
   staged "show more" so a list isn't dominated by things scheduled far ahead.
   The window size is a user setting (Appearance). Past/today entries are never
   affected - only future-dated ("upcoming") ones. */

export const UPCOMING_WINDOW_OPTIONS = [
  { value: "off", label: "Don't show upcoming", days: 0 },
  { value: "7d", label: "Within 7 days", days: 7 },
  { value: "1mo", label: "Within 1 month", days: 30 },
  { value: "1yr", label: "Within 1 year", days: 365 },
];

// Reveal this many hidden upcoming trips per "show more" tap.
export const UPCOMING_STEP = 5;

/** Days for a stored window value. Unknown/missing falls back to 1 month. */
export function upcomingWindowDays(value) {
  const opt = UPCOMING_WINDOW_OPTIONS.find((o) => o.value === value);
  return opt ? opt.days : 30;
}

/**
 * True when an entry is a future-dated trip beyond the visibility window.
 * `days` is the window size; 0 means every upcoming trip is beyond it. Past and
 * today entries return false (they always show).
 */
export function isBeyondUpcomingWindow(dateStr, days, ref = new Date()) {
  const d = parseISODate(dateStr);
  if (!d) return false;
  const today = new Date(ref);
  today.setHours(0, 0, 0, 0);
  if (d.getTime() <= today.getTime()) return false; // past/today - always shown
  const edge = new Date(today);
  edge.setDate(edge.getDate() + days);
  edge.setHours(23, 59, 59, 999);
  return d.getTime() > edge.getTime();
}

/**
 * Split entries into the ones to show and the far-future upcoming ones to hide
 * behind a staged reveal. Input order is preserved for `visible`.
 * @returns {{ visible: any[], hidden: any[] }}
 *   - visible: non-upcoming + within-window upcoming, in original order
 *   - hidden:  beyond-window upcoming, ordered soonest-first (natural reveal order)
 */
export function partitionUpcoming(entries, days, ref = new Date()) {
  const visible = [];
  const hidden = [];
  for (const e of entries || []) {
    if (isBeyondUpcomingWindow(e.date, days, ref)) hidden.push(e);
    else visible.push(e);
  }
  hidden.sort((a, b) => (parseISODate(a.date) || 0) - (parseISODate(b.date) || 0));
  return { visible, hidden };
}
