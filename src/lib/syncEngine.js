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
import { download, upload, isConnected, DriveAuthError } from "./drive.js";
import { updateSettings, readSettings } from "../db/db.js";

// ---- Sync state (module-level - shared across all hook subscribers) ------

/** @type {'idle'|'syncing'|'done'|'error'} */
let _state = "idle";
let _lastSyncedAt = null; // ISO string or null
let _error = null; // string or null
let _isSyncing = false;

// Pub/sub for the React hook
const _listeners = new Set();
function _notify() {
  for (const fn of _listeners) fn({ state: _state, lastSyncedAt: _lastSyncedAt, error: _error });
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
  });

  useEffect(() => {
    // Sync the hook with any updates that happened before mount.
    setStatus({ state: _state, lastSyncedAt: _lastSyncedAt, error: _error });
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
export async function syncNow({ allowInteractive = false } = {}) {
  if (_isSyncing) return; // drop concurrent triggers

  const connected = await isConnected();
  if (!connected) return; // not connected - nothing to do

  _isSyncing = true;
  _setState("syncing", { error: null });

  try {
    const s = await readSettings();

    // 1. Read local state and hash it
    const local = await buildSnapshot();
    const localHash = await hashSnapshot(local);

    // 2. Download remote metadata (skips payload if ETag matches)
    const { snapshot: remote, etag, notModified } = await download(s.gdriveEtag);

    // Early exit if nothing changed anywhere
    if (notModified && localHash === s.lastLocalHash) {
      const now = new Date().toISOString();
      await updateSettings({ lastSyncedAt: now });
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
      // 4. Apply merged state locally
      await applySnapshot(merged);
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
      newEtag = await upload(merged, etag);
    }

    // 6. Record success
    const now = new Date().toISOString();
    await updateSettings({ 
      lastSyncedAt: now,
      gdriveEtag: newEtag,
      lastLocalHash: mergedHash
    });
    _setState("done", { lastSyncedAt: now, error: null });
  } catch (err) {
    const msg =
      err instanceof DriveAuthError
        ? "Not connected to Drive - reconnect to resume syncing"
        : err?.message || "Sync failed";
    console.error("CarPawl sync error:", err);
    _setState("error", { error: msg });
  } finally {
    _isSyncing = false;
  }
}

// ---- Auto-sync triggers -------------------------------------------------

// Minimum gap between auto-triggered syncs (ms). Manual syncs via syncNow()
// with allowInteractive bypass the cooldown check, but auto ones respect it.
const AUTO_SYNC_COOLDOWN_MS = 5_000;
let _lastAutoSyncAt = 0;

function _autoSync() {
  const now = Date.now();
  if (now - _lastAutoSyncAt < AUTO_SYNC_COOLDOWN_MS) return;
  _lastAutoSyncAt = now;
  syncNow({ allowInteractive: false });
}

let _autoSyncInitialized = false;

/**
 * Register auto-sync triggers: app open, window focus, and coming back online.
 * Call once at app boot (main.jsx). Safe to call multiple times - only runs once.
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

  // Sync on app open
  _autoSync();

  // Sync when the tab regains focus (user switched back from another tab/app)
  window.addEventListener("focus", _autoSync);

  // Sync when coming back online
  window.addEventListener("online", _autoSync);
}
