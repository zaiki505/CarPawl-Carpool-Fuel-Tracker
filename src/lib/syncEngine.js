/* Sync orchestrator: ties together buildSnapshot, Drive download/upload, and
   mergeSnapshots into a single syncNow() function.

   Also exports:
   - useSyncStatus()   - React hook for reactive sync state (no context needed)
   - initAutoSync()    - registers auto-trigger listeners (call once at app boot)

   Sync state machine:
     idle --> [syncNow()] --> syncing --> done  (updates lastSyncedAt)
                                     --> error (stores error message)
     done|error --> [next trigger] --> syncing (loop)

   Rapid triggers are debounced: if a sync is already in flight the new trigger
   is silently dropped. The next auto-trigger (focus/online) will pick it up. */

import { buildSnapshot, applySnapshot } from "./snapshot.js";
import { mergeSnapshots } from "./sync.js";
import { connect, download, upload, isConnected, DriveAuthError } from "./drive.js";
import { db, updateSettings, readSettings } from "../db/db.js";

// ---- Sync state (module-level - shared across all hook subscribers) ------

/** @type {'idle'|'syncing'|'done'|'error'} */
let _state = "idle";
let _lastSyncedAt = null; // ISO string or null
let _error = null; // string or null
let _isSyncing = false;
// Set when a sync fails because Drive auth lapsed (token expired, no silent
// refresh). Automatic syncs then back off - re-hitting the dead token on every
// focus/change just spams the same failure - until an interactive sync or a
// reconnect clears it.
let _needsReauth = false;
// True only while a sync is writing merged data into the local DB. The Dexie
// table hooks fire for those writes too; this flag lets notifyDataChanged ignore
// them so a sync never triggers another sync of its own writes.
let _applying = false;

// Pub/sub for the React hook
const _listeners = new Set();
function _notify() {
  for (const fn of _listeners)
    fn({ state: _state, lastSyncedAt: _lastSyncedAt, error: _error, needsReauth: _needsReauth });
}
function _setState(state, extra = {}) {
  _state = state;
  if ("lastSyncedAt" in extra) _lastSyncedAt = extra.lastSyncedAt;
  if ("error" in extra) _error = extra.error;
  _notify();
}

// ---- React hook ---------------------------------------------------------

import { useEffect, useState } from "react";

/**
 * React hook that returns the current sync status.
 * @returns {{ state: string, lastSyncedAt: string|null, error: string|null }}
 */
export function useSyncStatus() {
  const [status, setStatus] = useState({
    state: _state,
    lastSyncedAt: _lastSyncedAt,
    error: _error,
    needsReauth: _needsReauth,
  });

  useEffect(() => {
    // Sync the hook with any updates that happened before mount.
    setStatus({ state: _state, lastSyncedAt: _lastSyncedAt, error: _error, needsReauth: _needsReauth });
    _listeners.add(setStatus);
    return () => _listeners.delete(setStatus);
  }, []);

  return status;
}

// ---- Core sync ----------------------------------------------------------

async function hashSnapshot(obj) {
  const str = JSON.stringify(obj || {});
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Run a full sync cycle:
 *   1. buildSnapshot (local)
 *   2. drive.download (remote; null = no file yet)
 *   3. mergeSnapshots
 *   4. applySnapshot (update this device)
 *   5. drive.upload (push merged snapshot to Drive)
 *   6. updateSettings({ lastSyncedAt })
 *
 * @param {Object} [opts]
 * @param {boolean} [opts.allowInteractive=false] - pass true when triggered by
 *   an explicit user click (allows OAuth popup for silent-refresh fallback).
 */
export async function syncNow({ allowInteractive = false, _local = null, _localHash = null } = {}) {
  // Claim the sync SYNCHRONOUSLY, before any await - otherwise two triggers
  // firing close together (e.g. "focus" and "online" on app resume, or a
  // debounced data-change sync overlapping the periodic poll) can both read
  // `_isSyncing` as false and run concurrently, racing each other's etag reads
  // and uploads.
  if (_isSyncing) return;
  _isSyncing = true;

  const connected = await isConnected();
  if (!connected) {
    _isSyncing = false;
    return; // not connected - nothing to do
  }

  // An interactive attempt (a user pressing "Sync now" / connecting) is a fresh
  // chance to re-auth, so drop any prior back-off.
  if (allowInteractive) _needsReauth = false;

  _setState("syncing", { error: null });

  try {
    const s = await readSettings();

    // 1. Read local state and hash it (reuse the auto-trigger's precomputed
    //    snapshot/hash when provided, to avoid building it twice).
    const local = _local || (await buildSnapshot());
    const localHash = _localHash || (await hashSnapshot(local));

    // 2. Download remote metadata (skips payload if ETag matches). Pass the
    //    interactive flag so a user-triggered sync can re-auth if the token
    //    lapsed, instead of silently failing like a background sync.
    const { snapshot: remote, etag, notModified } = await download(s.gdriveEtag, { allowInteractive });

    // Early exit if nothing changed anywhere
    if (notModified && localHash === s.lastLocalHash) {
      _needsReauth = false;
      const now = new Date().toISOString();
      await updateSettings({ lastSyncedAt: now, lastRemotePollAt: now });
      _setState("done", { lastSyncedAt: now, error: null });
      return;
    }

    // 3. Merge
    let merged;
    if (notModified) {
      // Remote matches; no other devices have written.
      // So local is the winner. Prune tombstones by merging local with itself.
      merged = mergeSnapshots(local, local, { now: Date.now() });
    } else {
      merged = mergeSnapshots(local, remote || {}, { now: Date.now() });
      // 4. Apply merged state locally. Merge mode keeps rows the user added
      //    mid-sync (only tombstoned ids are deleted), and _applying stops our
      //    own writes from scheduling a redundant follow-up sync.
      _applying = true;
      try {
        await applySnapshot(merged, { wholesale: false });
      } finally {
        _applying = false;
      }
    }

    const mergedHash = await hashSnapshot(merged);

    // 5. Upload merged state to Drive
    // Skip upload if we didn't add any new local changes to the remote state.
    let newEtag = etag;
    let needUpload = false;
    
    if (notModified) {
      needUpload = true; // We know local changed because we didn't early exit
    } else {
      const remoteHash = await hashSnapshot(remote);
      needUpload = (mergedHash !== remoteHash);
    }

    if (needUpload) {
      newEtag = await upload(merged, etag, { allowInteractive });
    }

    // 6. Record success
    _needsReauth = false;
    const now = new Date().toISOString();
    await updateSettings({
      lastSyncedAt: now,
      lastRemotePollAt: now,
      gdriveEtag: newEtag,
      lastLocalHash: mergedHash
    });
    _setState("done", { lastSyncedAt: now, error: null });
  } catch (err) {
    if (err instanceof DriveAuthError) {
      // Expected when a connected session's token lapses - not a crash. Back
      // off automatic retries and nudge the user to reconnect, quietly.
      _needsReauth = true;
      console.warn("CarPawl sync: Drive sign-in expired - reconnect to resume syncing.");
      _setState("error", { error: "Reconnect Google Drive to resume syncing" });
    } else {
      console.error("CarPawl sync error:", err);
      _setState("error", { error: err?.message || "Sync failed" });
    }
  } finally {
    _isSyncing = false;
    // Start the post-sync quiet buffer from completion (#6): an edit made right
    // after a sync then waits out AUTO_SYNC_COOLDOWN_MS instead of immediately
    // racing another sync that could fight the change or re-apply stale data.
    _lastAutoSyncAt = Date.now();
  }
}

// ---- Connect + first-sync reconciliation --------------------------------

/** Per-table record counts for a snapshot (used to describe a conflict). */
export function snapshotCounts(snap) {
  return {
    people: snap?.people?.length || 0,
    groups: snap?.groups?.length || 0,
    entries: snap?.entries?.length || 0,
    payments: snap?.payments?.length || 0,
  };
}
function hasData(snap) {
  const c = snapshotCounts(snap);
  return c.people + c.groups + c.entries + c.payments > 0;
}

/**
 * Connect Drive (interactive OAuth) and look at both sides. If THIS device and
 * Drive BOTH already hold data, returns a conflict for the caller to resolve
 * (merge vs replace) - the one case where silently merging could surprise the
 * user. Otherwise it just syncs (a fresh device pulls Drive's copy; an empty
 * Drive receives this device's data) and returns 'synced'.
 *
 * @returns {Promise<{status:'synced'} | {status:'conflict', remote, etag, local, remoteCounts}>}
 */
export async function connectAndPrepare() {
  await connect(); // interactive OAuth; marks the device connected
  const local = await buildSnapshot();
  const { snapshot: remote, etag } = await download();
  if (hasData(local) && hasData(remote)) {
    return {
      status: "conflict",
      remote,
      etag,
      local: snapshotCounts(local),
      remoteCounts: snapshotCounts(remote),
    };
  }
  await syncNow({ allowInteractive: true });
  return { status: "synced" };
}

/**
 * Resolve a first-connect conflict surfaced by connectAndPrepare().
 *  - 'merge'   : keep everything from both sides (a normal sync).
 *  - 'replace' : discard THIS device's data and adopt Drive's copy wholesale.
 */
export async function resolveConflict(choice, remote, etag) {
  if (choice === "replace") {
    // Wholesale adopt Drive's copy, discarding this device's data.
    _applying = true;
    try {
      await applySnapshot(remote);
    } finally {
      _applying = false;
    }
    _lastAutoSyncAt = Date.now();
    const localAfter = await buildSnapshot();
    const now = new Date().toISOString();
    await updateSettings({
      gdriveEtag: etag,
      lastLocalHash: await hashSnapshot(localAfter),
      lastSyncedAt: now,
      lastRemotePollAt: now,
    });
    _setState("done", { lastSyncedAt: now, error: null });
  } else {
    await syncNow({ allowInteractive: true });
  }
}

// ---- Auto-sync triggers -------------------------------------------------

// Coalesce rapid triggers (focus + online often fire together).
const AUTO_SYNC_COOLDOWN_MS = 5_000;
// When nothing local changed, still pull remote at most this often - so other
// devices' edits arrive without spending a token grant on every trigger.
const REMOTE_POLL_INTERVAL_MS = 5 * 60_000;
// Debounce a burst of local writes into a single sync.
const CHANGE_DEBOUNCE_MS = 4_000;

let _lastAutoSyncAt = 0;
let _changeTimer = null;
let _pollTimer = null;
let _retryTimer = null;

// Within the post-sync buffer we DEFER (not drop) pending work: schedule a
// single retry once the buffer elapses, so a change made right after a sync
// still syncs promptly instead of waiting for the next focus/poll.
function scheduleRetry(ms) {
  if (_retryTimer || _isSyncing) return;
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    maybeAutoSync();
  }, ms);
}

/**
 * The gate every AUTOMATIC trigger runs through. It only contacts Drive (and
 * only then spends a token) when there's actually something to do:
 *   - local data changed since the last sync (hash differs), or
 *   - the remote-poll interval has elapsed (catch other devices).
 * Otherwise it returns immediately, having done just a cheap local hash.
 * Manual "Sync now" calls syncNow() directly and bypasses this gate.
 */
async function maybeAutoSync() {
  if (_isSyncing) return;
  // Drive auth lapsed - don't keep hammering the dead token on every focus /
  // data change. A user-triggered "Sync now" or reconnect clears this.
  if (_needsReauth) return;
  const now = Date.now();
  const withinBuffer = AUTO_SYNC_COOLDOWN_MS - (now - _lastAutoSyncAt);
  if (withinBuffer > 0) {
    // Still inside the post-sync buffer - come back once it's elapsed.
    scheduleRetry(withinBuffer + 50);
    return;
  }
  if (!(await isConnected())) return;

  const s = await readSettings();
  const local = await buildSnapshot();
  const localHash = await hashSnapshot(local);
  const localChanged = localHash !== s.lastLocalHash;
  const lastPoll = s.lastRemotePollAt ? Date.parse(s.lastRemotePollAt) : 0;
  const pollDue = now - lastPoll >= REMOTE_POLL_INTERVAL_MS;

  if (!localChanged && !pollDue) return; // nothing to push, not time to poll

  _lastAutoSyncAt = now;
  await syncNow({ allowInteractive: false, _local: local, _localHash: localHash });
}

/**
 * Called (debounced) whenever local data changes, so an edit syncs promptly
 * instead of waiting for the next focus/poll. Exported for callers that want to
 * nudge a sync explicitly; DB table hooks below call it automatically.
 */
export function notifyDataChanged() {
  // Ignore the writes a sync makes while applying merged data - they're not a
  // user edit and must not schedule another sync (#6).
  if (_applying) return;
  if (_changeTimer) clearTimeout(_changeTimer);
  _changeTimer = setTimeout(() => {
    _changeTimer = null;
    maybeAutoSync();
  }, CHANGE_DEBOUNCE_MS);
}

let _autoSyncInitialized = false;

/**
 * Register auto-sync triggers. Call once at app boot (main.jsx). Safe to call
 * repeatedly - only runs once. Triggers:
 *   - local data change (debounced) -> prompt sync
 *   - app open / window focus / back online -> gated sync
 *   - periodic timer -> gated remote poll
 * Every path funnels through maybeAutoSync(), which no-ops when there's nothing
 * to do, so token grants stay minimal.
 */
export async function initAutoSync() {
  if (_autoSyncInitialized) return;
  _autoSyncInitialized = true;

  // Restore lastSyncedAt from settings into module state on boot.
  try {
    const s = await readSettings();
    if (s.lastSyncedAt) _lastSyncedAt = s.lastSyncedAt;
  } catch {
    // ignore
  }

  // Fire a prompt (debounced) sync whenever user data changes. clear()/bulkPut
  // from applySnapshot can also trip these, but the hash gate makes that a
  // harmless no-op (the just-applied data already matches lastLocalHash).
  for (const name of ["people", "groups", "entries", "payments"]) {
    const table = db[name];
    table.hook("creating", () => notifyDataChanged());
    table.hook("updating", () => notifyDataChanged());
    table.hook("deleting", () => notifyDataChanged());
  }

  maybeAutoSync(); // on app open
  window.addEventListener("focus", maybeAutoSync);
  window.addEventListener("online", maybeAutoSync);
  // Periodic poll so other devices' changes arrive even if the app sits open.
  _pollTimer = setInterval(maybeAutoSync, REMOTE_POLL_INTERVAL_MS);
}
