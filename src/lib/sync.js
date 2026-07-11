/* Two-way sync merge engine (pure - no Drive/IO here, so it's fully testable).

   Google Drive is only a FILE store: no real-time push, no server-side merge.
   So "sync" means each device reconciles its local snapshot with the single
   shared snapshot kept in Drive's hidden appDataFolder, using:

     - per-record LAST-WRITE-WINS by `updatedAt` (concurrent edits to DIFFERENT
       records both survive; concurrent edits to the SAME record keep the newer)
     - TOMBSTONES for deletes (a `{table,id,deletedAt}` log) so a delete on one
       device propagates instead of the record simply reappearing from the other

   This is eventual consistency, not live collaboration - good enough for a
   single user across a couple of devices. The Drive client (auth + up/download
   + etag-guarded write) layers on top of this and is built separately. */

export const SYNC_VERSION = 1;

// Tables merged record-by-record. `settings` is merged as a single row below.
export const SYNC_TABLES = ["people", "groups", "entries", "payments", "creditApplications"];

const ms = (iso) => (iso ? Date.parse(iso) || 0 : 0);
const tsOf = (rec) => ms(rec?.updatedAt);

/** Latest tombstone per (table,id) across both sides. */
export function mergeDeletions(a = [], b = []) {
  const map = new Map();
  for (const d of [...a, ...b]) {
    if (!d || !d.table || !d.id || !d.deletedAt) continue;
    const k = `${d.table}:${d.id}`;
    const prev = map.get(k);
    if (!prev || ms(d.deletedAt) > ms(prev.deletedAt)) map.set(k, d);
  }
  return [...map.values()];
}

/** Union of records by id (last-write-wins by updatedAt), minus any whose
 *  tombstone is newer than the record's last edit (deleted after last change).
 *  A record edited AFTER its delete (updatedAt > deletedAt) is "resurrected". */
function mergeTable(local = [], remote = [], tombstones = []) {
  const byId = new Map();
  for (const r of [...(local || []), ...(remote || [])]) {
    if (!r || r.id == null) continue;
    const prev = byId.get(r.id);
    if (!prev || tsOf(r) >= tsOf(prev)) byId.set(r.id, r);
  }
  const deletedAt = new Map();
  for (const d of tombstones) deletedAt.set(d.id, ms(d.deletedAt));
  const out = [];
  for (const r of byId.values()) {
    const del = deletedAt.get(r.id);
    if (del != null && del >= tsOf(r)) continue; // deleted at/after last edit -> gone
    out.push(r);
  }
  return out;
}

/** Merge the single settings row (LWW), but keep `onboardedAt` sticky - once a
 *  device has onboarded, syncing a fresher-but-unonboarded row shouldn't wipe
 *  it back to the first-run screen. */
function mergeSettings(local, remote) {
  const base = tsOf(remote) > tsOf(local) ? { ...remote } : { ...local };
  base.onboardedAt = local?.onboardedAt || remote?.onboardedAt || base.onboardedAt || null;
  return base;
}

/**
 * Merge two snapshots into one. Snapshot shape:
 *   { app, syncVersion, people:[], groups:[], entries:[], payments:[],
 *     settings:{id:"app",...}, deletions:[{table,id,deletedAt}] }
 * Every record carries `updatedAt` (ISO); deletes are recorded in `deletions`.
 *
 * @param {Object} opts
 * @param {number} [opts.now]  epoch ms, injected for deterministic tombstone pruning
 * @param {number} [opts.tombstoneTtlDays=90]  drop tombstones older than this
 */
export function mergeSnapshots(local = {}, remote = {}, { now = Date.now(), tombstoneTtlDays = 90 } = {}) {
  const deletions = mergeDeletions(local.deletions, remote.deletions);
  const merged = { app: "CarPawl", syncVersion: SYNC_VERSION };
  const survived = {};
  for (const t of SYNC_TABLES) {
    const tombs = deletions.filter((d) => d.table === t);
    merged[t] = mergeTable(local[t], remote[t], tombs);
    survived[t] = new Set(merged[t].map((r) => r.id));
  }
  merged.settings = mergeSettings(local.settings, remote.settings);
  // Prune tombstones that are obsolete (the record was resurrected) or old
  // enough that every device is assumed to have applied them.
  const cutoff = now - tombstoneTtlDays * 86400000;
  merged.deletions = deletions.filter(
    (d) => !survived[d.table]?.has(d.id) && ms(d.deletedAt) >= cutoff
  );
  return merged;
}
