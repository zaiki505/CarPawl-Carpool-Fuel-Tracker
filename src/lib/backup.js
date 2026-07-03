import { db, SETTINGS_ID, ensureSettings } from "../db/db.js";

/* Manual JSON backup & restore (§9). This is the always-available baseline;
   Google Drive is a documented later add-on and is intentionally not built in
   this version. A restore FULLY REPLACES on-device data (no merge) — callers
   must confirm with the user first (§8). */

export const BACKUP_VERSION = 1;

/** Read the entire app state into a plain, serialisable object. */
export async function collectBackup() {
  const [people, groups, entries, payments, settings] = await Promise.all([
    db.people.toArray(),
    db.groups.toArray(),
    db.entries.toArray(),
    db.payments.toArray(),
    ensureSettings(),
  ]);
  return {
    app: "CarPawl",
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { people, groups, entries, payments, settings },
  };
}

/** Trigger a download of the full backup as a timestamped .json file. */
export async function exportToFile() {
  const backup = await collectBackup();
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `carpawl-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return backup;
}

/** Validate a parsed backup object, throwing a friendly error if it's not one. */
export function validateBackup(obj) {
  if (!obj || typeof obj !== "object" || obj.app !== "CarPawl" || !obj.data) {
    throw new Error("That doesn't look like a CarPawl backup file.");
  }
  const d = obj.data;
  for (const key of ["people", "groups", "entries", "payments"]) {
    if (!Array.isArray(d[key])) {
      throw new Error(`Backup is missing its "${key}" list — it may be corrupted.`);
    }
  }
  return obj;
}

/**
 * Fully replace all on-device data with the contents of a backup. Destructive:
 * confirm before calling. Runs in a single transaction so a failure leaves the
 * existing data untouched.
 */
export async function restoreFromBackup(obj) {
  const backup = validateBackup(obj);
  const { people, groups, entries, payments, settings } = backup.data;

  await db.transaction(
    "rw",
    db.people,
    db.groups,
    db.entries,
    db.payments,
    db.settings,
    async () => {
      await Promise.all([
        db.people.clear(),
        db.groups.clear(),
        db.entries.clear(),
        db.payments.clear(),
        db.settings.clear(),
      ]);
      await db.people.bulkAdd(people);
      await db.groups.bulkAdd(groups);
      await db.entries.bulkAdd(entries);
      await db.payments.bulkAdd(payments);
      if (settings && typeof settings === "object") {
        await db.settings.put({ ...settings, id: SETTINGS_ID });
      }
    }
  );
  // Make sure a settings row always exists post-restore.
  await ensureSettings();

  return {
    people: people.length,
    groups: groups.length,
    entries: entries.length,
    payments: payments.length,
  };
}

/** Read a File (from an <input type=file>) and parse it as a backup object. */
export async function readBackupFile(file) {
  const text = await file.text();
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error("Couldn't read that file — it isn't valid JSON.");
  }
  return validateBackup(obj);
}
