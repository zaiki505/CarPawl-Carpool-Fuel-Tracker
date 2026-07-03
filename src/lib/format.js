/* Display formatting. Currency + date format are fixed for this build:
   MYR (RM prefix) and DD-MM-YYYY (build spec §7.6 / §11). Rounding happens
   here, never in the calc engine. */

export const CURRENCY_PREFIX = "RM";

/** "RM30.00" - money to 2dp with the RM prefix. */
export function formatMoney(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}${CURRENCY_PREFIX}${Math.abs(v).toFixed(2)}`;
}

/** Money without forcing 2dp of noise for whole numbers, e.g. "RM5". */
export function formatMoneyShort(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
  return `${v < 0 ? "-" : ""}${CURRENCY_PREFIX}${body}`;
}

export function formatLiters(n) {
  return `${(Number(n) || 0).toFixed(2)} L`;
}

export function formatKm(n) {
  const v = Number(n) || 0;
  return `${v.toFixed(v < 100 ? 1 : 0)} km`;
}

export function formatKmpl(n) {
  return `${(Number(n) || 0).toFixed(1)} km/L`;
}

/** ISO 'YYYY-MM-DD' (or full ISO) -> 'DD-MM-YYYY'. */
export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

/** Short, friendly date like "3 Jul" for dense lists. */
export function formatDateShort(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

/** Today's date as an ISO 'YYYY-MM-DD' string in local time (for <input type=date>). */
export function todayISODate() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

/** Month label like "July 2026". */
export function monthLabel(ref = new Date()) {
  return ref.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/** Parse a user-typed number, returning null when blank/invalid. */
export function parseNum(v) {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
}
