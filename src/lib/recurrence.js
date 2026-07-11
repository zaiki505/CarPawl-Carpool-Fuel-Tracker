/* Recurring-trip helpers (pure, so they're easy to test).

   A recurring entry carries `recurrence` (the cadence) and `recurrenceId` (a
   stable id shared by every entry in the same series). The app keeps exactly
   ONE future ("upcoming") occurrence scheduled per series: when that occurrence
   passes, the next future one is generated on the next app open (see
   generateDueRecurrences in db/actions.js). Missed occurrences are NOT
   back-filled - we only ever schedule the next FUTURE date, so a phone left off
   for a week can't spawn a pile of past entries that skew balances. */

import { parseISODate, isFutureDate } from "./format.js";

export const RECURRENCE_OPTIONS = [
  { value: "none", label: "One-off" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const RECURRENCE_LABELS = {
  daily: "Repeats daily",
  weekly: "Repeats weekly",
  monthly: "Repeats monthly",
  yearly: "Repeats yearly",
};

/** Human label for a cadence, or null for a one-off. */
export function recurrenceLabel(cadence) {
  return RECURRENCE_LABELS[cadence] || null;
}

/** true for a real recurring cadence (not "none"/null). */
export function isRecurring(cadence) {
  return cadence === "daily" || cadence === "weekly" || cadence === "monthly" || cadence === "yearly";
}

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Advance a yyyy-mm-dd date by one step of the given cadence (local time). */
export function advanceDate(iso, cadence) {
  const base = parseISODate(iso);
  if (!base) return iso;
  const d = new Date(base);
  if (cadence === "daily") d.setDate(d.getDate() + 1);
  else if (cadence === "weekly") d.setDate(d.getDate() + 7);
  else if (cadence === "monthly") d.setMonth(d.getMonth() + 1);
  else if (cadence === "yearly") d.setFullYear(d.getFullYear() + 1);
  else return iso;
  return toISODate(d);
}

/**
 * The next occurrence strictly AFTER `iso` that is also in the future relative
 * to `ref`. Advances repeatedly so a long-passed series jumps straight to its
 * next upcoming date instead of materialising every skipped step. Returns null
 * for a non-recurring cadence.
 */
export function nextFutureDate(iso, cadence, ref = new Date()) {
  if (!isRecurring(cadence)) return null;
  let next = advanceDate(iso, cadence);
  let guard = 0;
  while (!isFutureDate(next, ref) && guard < 4000) {
    next = advanceDate(next, cadence);
    guard += 1;
  }
  return next;
}
