import Dexie from "dexie";

/* CarPawl local database (IndexedDB via Dexie).

   Notes:
   - `passengers` (on Entry) and `who` (on Payment) are stored as embedded
     objects/arrays. They're always read with their parent and never queried independently.
   - `who` is `{ type: 'me' }` or `{ type: 'person', personId }`. 'me' is a fixed
     built-in identity, never a Person row.
   - Deleting a Group/Person that has history archives it instead (see actions).
*/

export const db = new Dexie("carpawl");

db.version(1).stores({
  // Only fields actually query/sort on are indexed.
  people: "id, isArchived, createdAt",
  groups: "id, ownerType, ownerPersonId, isArchived, createdAt",
  entries: "id, groupId, date, createdAt",
  payments: "id, entryId, date, createdAt",
  // key/value settings row, id fixed to "app"
  settings: "id",
});

/* v2 - two-way sync support.
   - `deletions` is the tombstone log: one row per hard-deleted record so a
     delete on one device propagates instead of the record resurrecting from
     another device's snapshot. Compound primary key [table+id] means a repeat
     delete of the same record upserts rather than duplicating.
   - Backfill `updatedAt` (used for last-write-wins) onto pre-existing rows that
     never carried one; fall back to createdAt so their age is preserved. */
db.version(2)
  .stores({
    people: "id, isArchived, createdAt",
    groups: "id, ownerType, ownerPersonId, isArchived, createdAt",
    entries: "id, groupId, date, createdAt",
    payments: "id, entryId, date, createdAt",
    settings: "id",
    deletions: "[table+id], table, deletedAt",
  })
  .upgrade(async (tx) => {
    const backfill = (row) => {
      if (!row.updatedAt) row.updatedAt = row.createdAt || null;
    };
    await tx.table("people").toCollection().modify(backfill);
    await tx.table("groups").toCollection().modify(backfill);
    await tx.table("entries").toCollection().modify(backfill);
    await tx.table("payments").toCollection().modify(backfill);
    await tx.table("settings").toCollection().modify(backfill);
  });

/* v3 - credit offset ledger. `creditApplications` records each time a debtor's
   overpayment credit is applied against a specific debt (target entry), so the
   offset has an explicit, reversible history (never a silent balance mutation).
   Synced like the other record tables (LWW + tombstones). New empty table, so
   no data upgrade step is needed. */
db.version(3).stores({
  people: "id, isArchived, createdAt",
  groups: "id, ownerType, ownerPersonId, isArchived, createdAt",
  entries: "id, groupId, date, createdAt",
  payments: "id, entryId, date, createdAt",
  settings: "id",
  deletions: "[table+id], table, deletedAt",
  creditApplications: "id, targetEntryId, groupId, debtorKey, creditorKey, date, createdAt",
});

export const SETTINGS_ID = "app";

/* Settings keys that are DEVICE-LOCAL and must never travel through Drive sync:
   connection state + the per-device sync bookkeeping and a sync's own
   `lastSyncedAt` write can't make the local snapshot "dirty". */
export const DEVICE_LOCAL_SETTINGS = Object.freeze([
  "gdriveConnected",
  "gdriveUserEmail",
  "gdriveFileId",
  "gdriveEtag",
  "gdriveToken",
  "lastSyncedAt",
  "lastRemotePollAt",
  "lastLocalHash",
]);

export const DEFAULTS = Object.freeze({
  defaultFuelPricePerLiter: 1.99, // MYR/L (RON95 subsidy ballpark; user-editable)
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
  upcomingWindow: "1mo", // how far ahead upcoming trips show inline (see lib/upcoming.js)
  onboardedAt: null,
});

/**
 * Get-or-create the settings row. This WRITES on first run, so it must only be
 * called from normal contexts (app boot, action handlers) - NEVER from inside a
 * Dexie useLiveQuery reader, where writes throw a read-only transaction error.
 * Reactive reads should use `readSettings()` (pure) instead.
 */
export async function ensureSettings() {
  let s = await db.settings.get(SETTINGS_ID);
  if (!s) {
    s = { ...DEFAULT_SETTINGS, createdAt: nowISO(), updatedAt: nowISO() };
    await db.settings.put(s);
  }
  return s;
}

/** Pure read: the settings row, or defaults if it doesn't exist yet. */
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
  // A patch that only touches device-local sync bookkeeping must NOT bump the
  // synced `updatedAt` - otherwise every sync would make this device's settings
  // look newer and win the last-write-wins merge over real pref changes.
  const onlyDeviceLocal = Object.keys(patch).every((k) =>
    DEVICE_LOCAL_SETTINGS.includes(k)
  );
  if (!onlyDeviceLocal) next.updatedAt = nowISO();
  await db.settings.put(next);
  return next;
}

/** True until the user has created their first (owned) car. */
export async function isOnboarded() {
  const s = await getSettings();
  return Boolean(s.onboardedAt);
}
