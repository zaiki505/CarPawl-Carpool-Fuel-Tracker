import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { db, SETTINGS_ID, ensureSettings } from "../db/db.js";

/* Manual JSON backup & restore. This is the always-available baseline;
   Google Drive is a documented later add-on. A restore FULLY REPLACES on-device data (no merge), 
   callers must confirm with the user first. */

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

/**
 * Export the full backup as a timestamped .json file.
 *  - Native: write it to the app cache and open the OS share sheet so the user
 *    can save it to Files/Drive/email etc. (a blob `<a download>` does nothing
 *    useful inside an Android WebView).
 *  - Web: the classic blob download.
 * @returns {Promise<{ backup, delivered: 'shared'|'downloaded' }>}
 */
export async function exportToFile() {
  const backup = await collectBackup();
  const json = JSON.stringify(backup, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `carpawl-backup-${stamp}.json`;

  if (Capacitor.isNativePlatform()) {
    const written = await Filesystem.writeFile({
      path: filename,
      data: json,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });
    await Share.share({
      title: "CarPawl backup",
      dialogTitle: "Save or send your CarPawl backup",
      files: [written.uri],
    });
    return { backup, delivered: "shared" };
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { backup, delivered: "downloaded" };
}

/** Validate a parsed backup object, throwing a friendly error if it's not one. */
export function validateBackup(obj) {
  if (!obj || typeof obj !== "object" || obj.app !== "CarPawl" || !obj.data) {
    throw new Error("That doesn't look like a CarPawl backup file.");
  }
  // A backup from a newer app version may carry fields/shapes this build
  // doesn't know how to restore - refuse rather than silently degrading.
  if (typeof obj.version === "number" && obj.version > BACKUP_VERSION) {
    throw new Error(
      "This backup was made by a newer version of CarPawl - update the app before restoring it."
    );
  }
  const d = obj.data;
  for (const key of ["people", "groups", "entries", "payments"]) {
    if (!Array.isArray(d[key])) {
      throw new Error(`Backup is missing its "${key}" list - it may be corrupted.`);
    }
    if (!d[key].every((row) => row && typeof row === "object" && typeof row.id === "string")) {
      throw new Error(`Backup's "${key}" list looks corrupted - one or more rows are invalid.`);
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
    throw new Error("Couldn't read that file - it isn't valid JSON.");
  }
  return validateBackup(obj);
}
