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

import { db, SETTINGS_ID } from "../db/db.js";
import { SYNC_VERSION, SYNC_TABLES } from "./sync.js";

/** Read the entire local DB into a snapshot (shape: see sync.js header). */
export async function buildSnapshot() {
  const [people, groups, entries, payments, deletions, settings] = await db.transaction(
    "r",
    db.people,
    db.groups,
    db.entries,
    db.payments,
    db.deletions,
    db.settings,
    async () =>
      Promise.all([
        db.people.toArray(),
        db.groups.toArray(),
        db.entries.toArray(),
        db.payments.toArray(),
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
    settings: settings || null,
    deletions,
  };
}

/**
 * Overwrite the local DB with a merged snapshot. Each synced table is replaced
 * wholesale (clear + bulkPut) so that records the merge excluded - because a
 * remote device tombstoned them - are removed here too. The tombstone log is
 * likewise replaced with the merged/pruned set, dropping obsolete tombstones.
 *
 * Single-user, eventual-consistency assumption: kept intentionally simple. A
 * local write landing between buildSnapshot() and applySnapshot() could be
 * overwritten; callers keep the round-trip short and re-sync on the next tick.
 */
export async function applySnapshot(snap) {
  if (!snap) return;
  await db.transaction(
    "rw",
    db.people,
    db.groups,
    db.entries,
    db.payments,
    db.deletions,
    db.settings,
    async () => {
      for (const t of SYNC_TABLES) {
        await db[t].clear();
        const rows = snap[t] || [];
        if (rows.length) await db[t].bulkPut(rows);
      }
      await db.deletions.clear();
      if (snap.deletions?.length) await db.deletions.bulkPut(snap.deletions);
      // Only write a settings row that actually carries the fixed id, so a
      // degenerate merge of two empty snapshots can't drop an id-less row in.
      if (snap.settings?.id) await db.settings.put(snap.settings);
    }
  );
}
