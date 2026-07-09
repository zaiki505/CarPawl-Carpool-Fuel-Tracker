/* Google Drive client for CarPawl two-way sync.
   Phase 4 of the sync implementation.

   Auth:   Google Identity Services (GIS) token client - OAuth 2.0 implicit flow.
           The access token is short-lived (~1 hour). We cache it in memory and
           re-prompt silently on expiry (no popup unless the silent attempt fails).

   Storage: One JSON file named "carpawl-sync.json" in the user's hidden
            appDataFolder (only this app can see it - not visible in Drive UI).
            The file's Drive ID is cached in settings.gdriveFileId so subsequent
            calls address it directly instead of doing a LIST search every time.

   Writes: Etag-guarded. Every upload sends If-Match: <etag>. On a 412 conflict
           (two devices syncing simultaneously), we re-download the latest,
           re-merge via mergeSnapshots, and retry once. The caller (syncEngine)
           handles the merge; drive.js itself exposes the retry as an option.

   No gapi SDK dependency - all Drive calls use plain fetch with an
   Authorization: Bearer header. This keeps the bundle lean and avoids loading
   gapi's own scripts at all. GIS only needs one small script tag for auth. */

import { updateSettings, readSettings } from "../db/db.js";
import { buildSnapshot } from "./snapshot.js";
import { mergeSnapshots } from "./sync.js";

// ---- Constants ----------------------------------------------------------

const CLIENT_ID =
  "434134706054-e0jseb2kn6a4vsfme3l1jvp0macqkd7l.apps.googleusercontent.com";
const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const FILE_NAME = "carpawl-sync.json";

// GIS script URL - loaded once on demand
const GIS_SCRIPT_SRC = "https://accounts.google.com/gsi/client";

// Drive REST API v3 base
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

// ---- Module-level state -------------------------------------------------

let _token = null; // { access_token, expires_at (epoch ms) }
let _tokenClient = null; // GIS token client instance
let _gisReady = null; // Promise<void> for GIS load

// ---- GIS loading --------------------------------------------------------

/** Inject the GIS script once and return a promise that resolves when ready. */
export function loadGis() {
  if (_gisReady) return _gisReady;
  _gisReady = new Promise((resolve, reject) => {
    if (typeof window.google !== "undefined" && window.google.accounts) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${GIS_SCRIPT_SRC}"]`);
    if (existing) {
      // Script is in the DOM but may not have fired its load event yet.
      existing.addEventListener("load", resolve);
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = GIS_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
  return _gisReady;
}

// ---- Token management ---------------------------------------------------

/** True if we have a non-expired cached token. */
function hasValidToken() {
  return _token && _token.expires_at > Date.now() + 30_000; // 30s safety margin
}

/**
 * Request a new token from GIS.
 * @param {boolean} interactive - if true, show the consent popup; if false,
 *   try a silent (no-popup) grant first and throw if it fails.
 */
function requestToken(interactive) {
  return new Promise(async (resolve, reject) => {
    await loadGis();
    if (!_tokenClient) {
      _tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPE,
        callback: (response) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          const expiresIn = Number(response.expires_in) || 3600;
          _token = {
            access_token: response.access_token,
            expires_at: Date.now() + expiresIn * 1000,
          };
          resolve(_token);
        },
        error_callback: (err) => {
          reject(new Error(err?.message || "OAuth error"));
        },
      });
    }
    _tokenClient.requestAccessToken({ prompt: interactive ? "" : "none" });
  });
}

/**
 * Resolve a valid access token. Tries silent refresh first; falls back to an
 * interactive popup only when `allowInteractive` is true (i.e., triggered by a
 * user click, not an automatic background sync).
 */
export async function getToken({ allowInteractive = false } = {}) {
  if (hasValidToken()) return _token;
  try {
    // Silent: no popup, succeeds if the user has already consented this session.
    return await requestToken(false);
  } catch {
    if (!allowInteractive) {
      throw new DriveAuthError("Token expired - reconnect Drive to continue syncing");
    }
    // Interactive popup for explicit connect/reconnect actions.
    return await requestToken(true);
  }
}

// ---- Custom error types -------------------------------------------------

export class DriveAuthError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "DriveAuthError";
  }
}

export class DriveConflictError extends Error {
  constructor(msg) {
    super(msg);
    this.name = "DriveConflictError";
  }
}

// ---- Connection state ---------------------------------------------------

/** True if the user has previously authorized Drive sync on this device. */
export async function isConnected() {
  const s = await readSettings();
  return Boolean(s.gdriveConnected);
}

/**
 * Prompt an OAuth popup and mark the device as connected.
 * Must be called from a user gesture (button click).
 */
export async function connect() {
  await loadGis();
  await requestToken(true); // always interactive on explicit connect
  // Ask for the user's email to show in the UI.
  const info = await fetchUserInfo();
  await updateSettings({
    gdriveConnected: true,
    gdriveUserEmail: info?.email || null,
  });
  return info;
}

/** Revoke the token and clear all Drive-related settings. */
export async function disconnect() {
  if (_token?.access_token) {
    try {
      // Best-effort revoke - ignore errors (token may already be expired).
      window.google?.accounts?.oauth2?.revoke?.(_token.access_token, () => {});
    } catch {
      // ignore
    }
  }
  _token = null;
  _tokenClient = null;
  await updateSettings({
    gdriveConnected: false,
    gdriveFileId: null,
    gdriveUserEmail: null,
    lastSyncedAt: null,
  });
}

/** Fetch the authenticated user's basic profile (email) via the Drive API. */
async function fetchUserInfo() {
  try {
    const token = await getToken();
    const res = await fetch(
      `${DRIVE_API}/about?fields=user`,
      { headers: { Authorization: `Bearer ${token.access_token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return { email: data.user?.emailAddress || null };
  } catch {
    return null;
  }
}

// ---- File helpers -------------------------------------------------------

/** Resolve the Drive file ID, using the cached value or a LIST search. */
async function resolveFileId() {
  const s = await readSettings();
  if (s.gdriveFileId) return s.gdriveFileId;

  const token = await getToken();
  const res = await fetch(
    `${DRIVE_API}/files?spaces=appDataFolder&q=name%3D'${FILE_NAME}'&fields=files(id%2Cname)&pageSize=1`,
    { headers: { Authorization: `Bearer ${token.access_token}` } }
  );
  if (!res.ok) throw new Error(`Drive LIST failed: ${res.status}`);
  const data = await res.json();
  const id = data.files?.[0]?.id || null;
  if (id) await updateSettings({ gdriveFileId: id });
  return id;
}

// ---- Download -----------------------------------------------------------

/**
 * Download the sync snapshot from Drive.
 * Returns `{ snapshot, etag, notModified }` or `{ snapshot: null, etag: null, notModified: false }` if no file
 * exists yet (first sync from this account).
 */
export async function download(cachedEtag = null) {
  const token = await getToken();
  const fileId = await resolveFileId();

  if (!fileId) {
    // No file in Drive yet - this is the first sync.
    return { snapshot: null, etag: null, notModified: false };
  }

  const headers = { Authorization: `Bearer ${token.access_token}` };
  if (cachedEtag) headers["If-None-Match"] = cachedEtag;

  const res = await fetch(
    `${DRIVE_API}/files/${fileId}?alt=media`,
    { headers }
  );

  if (res.status === 304) {
    // Remote file hasn't changed since our last sync
    return { snapshot: null, etag: cachedEtag, notModified: true };
  }

  if (res.status === 404) {
    // File was deleted externally; clear the cached ID.
    await updateSettings({ gdriveFileId: null });
    return { snapshot: null, etag: null, notModified: false };
  }

  if (!res.ok) throw new Error(`Drive download failed: ${res.status}`);

  const etag = res.headers.get("ETag") || res.headers.get("etag") || null;
  let snapshot;
  try {
    snapshot = await res.json();
  } catch {
    throw new Error("Drive file is corrupted or not valid JSON");
  }
  return { snapshot, etag, notModified: false };
}

// ---- Upload -------------------------------------------------------------

/**
 * Upload (create or update) the sync snapshot to Drive.
 *
 * @param {Object} snapshot  - the merged snapshot from mergeSnapshots()
 * @param {string|null} etag - the etag from the last download(); null = create
 * @param {Object} [opts]
 * @param {boolean} [opts.retryOnConflict=true] - if true and the server returns
 *   412, automatically re-download, re-merge, and retry once.
 */
export async function upload(snapshot, etag, { retryOnConflict = true } = {}) {
  const token = await getToken();
  const fileId = await resolveFileId();
  const body = JSON.stringify(snapshot);

  if (!fileId) {
    // Create: multipart upload (metadata + JSON body).
    return _create(token.access_token, body);
  } else {
    // Update: PATCH with If-Match etag guard.
    return _patch(token.access_token, fileId, body, etag, retryOnConflict);
  }
}

/** Create a new file in appDataFolder via multipart upload. */
async function _create(accessToken, body) {
  const metadata = JSON.stringify({
    name: FILE_NAME,
    parents: ["appDataFolder"],
  });

  const boundary = "carpawl_sync_boundary";
  const multipart =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${body}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,etag`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: multipart,
    }
  );

  if (!res.ok) throw new Error(`Drive create failed: ${res.status}`);
  const data = await res.json();
  if (data.id) await updateSettings({ gdriveFileId: data.id });
  return data.etag || res.headers.get("ETag") || res.headers.get("etag");
}

/** PATCH an existing file. On 412 conflict, optionally re-download, re-merge, retry. */
async function _patch(accessToken, fileId, body, etag, retryOnConflict) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  if (etag) headers["If-Match"] = etag;

  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media&fields=id,etag`,
    { method: "PATCH", headers, body }
  );

  if (res.status === 412 && retryOnConflict) {
    // Another device wrote between our download and upload. Re-download,
    // re-merge, and retry once without etag guard (accept-any).
    console.warn("CarPawl Drive: 412 conflict - re-downloading and retrying");
    const { snapshot: remoteLatest, etag: newEtag } = await download();
    const localSnap = JSON.parse(body); // our merged snapshot before conflict
    const remerged = mergeSnapshots(localSnap, remoteLatest, { now: Date.now() });

    // Build local snapshot fresh to include any writes that happened since
    // the original buildSnapshot() call, then re-merge.
    const freshLocal = await buildSnapshot();
    const finalSnap = mergeSnapshots(freshLocal, remerged, { now: Date.now() });

    const newBody = JSON.stringify(finalSnap);
    return _patch(accessToken, fileId, newBody, newEtag, false /* no second retry */);
  }

  if (res.status === 404) {
    // File was deleted; clear cached ID so the next upload creates it fresh.
    await updateSettings({ gdriveFileId: null });
    throw new Error("Drive file not found - it was deleted externally. Sync again to recreate it.");
  }

  if (!res.ok) throw new Error(`Drive upload failed: ${res.status}`);
  
  const etagHeader = res.headers.get("ETag") || res.headers.get("etag");
  let data = {};
  try { data = await res.json(); } catch(e) {}
  return data.etag || etagHeader;
}
