/* Display formatting. Currency symbol + date format are runtime-configurable
   (Settings). `setFormatConfig` is called from the app shell so the pure
   formatters below can stay synchronous. Rounding happens here, NEVER in calc. */

let _symbol = "RM";
let _dateFormat = "DD-MM-YYYY";

/** Push user's chosen currency symbol + date format into the formatters. */
export function setFormatConfig(settings) {
  if (!settings) return;
  if (settings.currencySymbol) _symbol = settings.currencySymbol;
  if (settings.dateFormat) _dateFormat = settings.dateFormat;
}

/** "RM30.00" - money to 2dp with the configured currency symbol. */
export function formatMoney(n) {
  const v = Number(n) || 0;
  const sign = v < 0 ? "-" : "";
  return `${sign}${_symbol}${Math.abs(v).toFixed(2)}`;
}

/** Money without forcing 2dp of noise for whole numbers, example: "RM5". */
export function formatMoneyShort(n) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
  return `${v < 0 ? "-" : ""}${_symbol}${body}`;
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

export const DATE_FORMATS = ["DD-MM-YYYY", "MM-DD-YYYY", "YYYY-MM-DD", "DD/MM/YYYY"];

/** Parse a stored date. Full ISO timestamps (createdAt etc.) pass through to the native parser. 
 * Returns null for blank/invalid input. */
export function parseISODate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value).trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when an ISO date is strictly AFTER today (local). */
export function isFutureDate(dateStr, ref = new Date()) {
  const d = parseISODate(dateStr);
  if (!d) return false;
  const today = new Date(ref);
  today.setHours(0, 0, 0, 0);
  return d.getTime() > today.getTime();
}

/** ISO date -> the user's configured date format. */
export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = parseISODate(dateStr);
  if (!d) return String(dateStr);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  switch (_dateFormat) {
    case "MM-DD-YYYY":
      return `${mm}-${dd}-${yyyy}`;
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "DD/MM/YYYY":
      return `${dd}/${mm}/${yyyy}`;
    case "DD-MM-YYYY":
    default:
      return `${dd}-${mm}-${yyyy}`;
  }
}

/** Short, friendly date like "3 Jul" for dense lists. */
export function formatDateShort(dateStr) {
  if (!dateStr) return "";
  const d = parseISODate(dateStr);
  if (!d) return String(dateStr);
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
