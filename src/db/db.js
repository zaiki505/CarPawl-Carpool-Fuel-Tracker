import Dexie from "dexie";

/* CarPawl local database (IndexedDB via Dexie).
   Single-user, on-device, no backend. See build spec §3 for the data model.

   Notes on shape:
   - `passengers` (on Entry) and `who` (on Payment) are stored as embedded
     objects/arrays, not separate tables - they're always read with their parent
     and never queried independently.
   - `who` is `{ type: 'me' }` or `{ type: 'person', personId }`. 'me' is a fixed
     built-in identity, never a Person row.
   - Deleting a Group/Person that has history archives it instead (see actions).
*/

export const db = new Dexie("carpawl");

db.version(1).stores({
  // Only fields we actually query/sort on are indexed.
  people: "id, isArchived, createdAt",
  groups: "id, ownerType, ownerPersonId, isArchived, createdAt",
  entries: "id, groupId, date, createdAt",
  payments: "id, entryId, date, createdAt",
  // key/value settings row, id fixed to "app"
  settings: "id",
});

export const SETTINGS_ID = "app";

export const DEFAULTS = Object.freeze({
  defaultFuelPricePerLiter: 2.05, // MYR/L (RON95 ballpark; user-editable)
  defaultKmPerLiter: 12, // used as the suggested value when creating a group
  currency: "MYR",
  currencySymbol: "RM",
  dateFormat: "DD-MM-YYYY",
  defaultSplitMethod: "distance", // 'distance' | 'equal' | 'driver_comp'
  defaultMaintenancePct: 10, // % markup for driver-compensation split
});

/** Small, collision-resistant id. crypto.randomUUID where available. */
export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

export const DEFAULT_SETTINGS = Object.freeze({
  id: SETTINGS_ID,
  defaultFuelPricePerLiter: DEFAULTS.defaultFuelPricePerLiter,
  currency: DEFAULTS.currency,
  currencySymbol: DEFAULTS.currencySymbol,
  dateFormat: DEFAULTS.dateFormat,
  defaultSplitMethod: DEFAULTS.defaultSplitMethod,
  defaultMaintenancePct: DEFAULTS.defaultMaintenancePct,
  onboardedAt: null,
});

/**
 * Get-or-create the settings row. This WRITES on first run, so it must only be
 * called from normal contexts (app boot, action handlers) — NEVER from inside a
 * Dexie useLiveQuery reader, where writes throw a read-only transaction error.
 * Reactive reads should use `readSettings()` (pure) instead.
 */
export async function ensureSettings() {
  let s = await db.settings.get(SETTINGS_ID);
  if (!s) {
    s = { ...DEFAULT_SETTINGS, createdAt: nowISO() };
    await db.settings.put(s);
  }
  return s;
}

/** Pure read: the settings row, or defaults if it doesn't exist yet. No writes,
 *  safe inside live queries. */
export async function readSettings() {
  const s = await db.settings.get(SETTINGS_ID);
  return s || { ...DEFAULT_SETTINGS };
}

/** Back-compat alias used by action handlers (write context is fine there). */
export async function getSettings() {
  return ensureSettings();
}

export async function updateSettings(patch) {
  const s = await getSettings();
  const next = { ...s, ...patch };
  await db.settings.put(next);
  return next;
}

/** True until the user has created their first (owned) car. */
export async function isOnboarded() {
  const s = await getSettings();
  return Boolean(s.onboardedAt);
}
