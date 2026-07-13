/* Bridge between the local Dexie DB and the pure merge engine in sync.js.

   buildSnapshot()  - read the whole local DB into the plain snapshot object
                      that mergeSnapshots() expects.
   applySnapshot()  - write a merged snapshot back into the local DB, replacing
                      table contents so records the merge dropped (via a remote
                      tombstone) actually disappear locally.

   The usual sync cycle:
     local  = await buildSnapshot()
     remote = <download JSON from Drive>            // or null on first sync
     merged = mergeSnapshots(local, remote, { now: Date.now() })
     await applySnapshot(merged)                    // update this device
     <upload merged JSON to Drive>                  // update the shared copy

   Drive I/O and auth live in the Drive client (separate); this file is pure DB. */

import { db, SETTINGS_ID, DEVICE_LOCAL_SETTINGS } from "../db/db.js";
import { SYNC_VERSION, SYNC_TABLES } from "./sync.js";

/** Copy of a settings row with device-local sync bookkeeping removed, so it
 *  never travels through Drive. */
function stripDeviceLocal(settings) {
  if (!settings) return settings;
  const clean = { ...settings };
  for (const k of DEVICE_LOCAL_SETTINGS) delete clean[k];
  return clean;
}

/** Read the entire local DB into a snapshot (shape: see sync.js header). */
export async function buildSnapshot() {
  const [people, groups, entries, payments, creditApplications, deletions, settings] =
    await db.transaction(
      "r",
      db.people,
      db.groups,
      db.entries,
      db.payments,
      db.creditApplications,
      db.deletions,
      db.settings,
      async () =>
        Promise.all([
          db.people.toArray(),
          db.groups.toArray(),
          db.entries.toArray(),
          db.payments.toArray(),
          db.creditApplications.toArray(),
          db.deletions.toArray(),
          db.settings.get(SETTINGS_ID),
        ])
    );
  return {
    app: "CarPawl",
    syncVersion: SYNC_VERSION,
    people,
    groups,
    entries,
    payments,
    creditApplications,
    settings: settings ? stripDeviceLocal(settings) : null,
    deletions,
  };
}

/**
 * Write a snapshot into the local DB.
 *
 * Two modes:
 *  - wholesale (default): clear + bulkPut each table, so the DB ends up EXACTLY
 *    matching the snapshot. Used for "replace with Drive's copy" and first sync.
 *  - merge (`{ wholesale: false }`): bulkPut the merged rows and delete ONLY the
 *    ids the merge tombstoned - never a blanket clear. This is what the normal
 *    sync uses so a row the user creates between buildSnapshot() and here isn't
 *    wiped (which used to lose or "fight" a change made mid-sync), and because
 *    every put is keyed by id it can never duplicate a record. Deletes still
 *    propagate because a real merge always carries a tombstone for each removal.
 *
 * The tombstone log is always replaced with the merged/pruned set.
 */
export async function applySnapshot(snap, { wholesale = true } = {}) {
  if (!snap) return;
  await db.transaction(
    "rw",
    db.people,
    db.groups,
    db.entries,
    db.payments,
    db.creditApplications,
    db.deletions,
    db.settings,
    async () => {
      for (const t of SYNC_TABLES) {
        if (wholesale) await db[t].clear();
        const rows = snap[t] || [];
        if (rows.length) await db[t].bulkPut(rows);
      }
      if (!wholesale) {
        // Remove exactly what the merge tombstoned, per table - not the whole
        // table - so concurrent local inserts survive.
        const dels = snap.deletions || [];
        for (const t of SYNC_TABLES) {
          const ids = dels.filter((d) => d.table === t).map((d) => d.id);
          if (ids.length) await db[t].bulkDelete(ids);
        }
      }
      await db.deletions.clear();
      if (snap.deletions?.length) await db.deletions.bulkPut(snap.deletions);
      // Only write a settings row that actually carries the fixed id, so a
      // degenerate merge of two empty snapshots can't drop an id-less row in.
      // Preserve THIS device's local sync bookkeeping (connection/etag/hash) and
      // never import those keys from a remote snapshot.
      if (snap.settings?.id) {
        const localSettings = await db.settings.get(SETTINGS_ID);
        const next = { ...snap.settings };
        for (const k of DEVICE_LOCAL_SETTINGS) {
          if (localSettings && localSettings[k] !== undefined) next[k] = localSettings[k];
          else delete next[k];
        }
        await db.settings.put(next);
      }
    }
  );
}
