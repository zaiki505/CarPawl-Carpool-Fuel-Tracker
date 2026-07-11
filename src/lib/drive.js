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
import { Capacitor } from "@capacitor/core";
// A real installed dependency (not web-only), so a normal static import is
// correct here - it's bundled for both web and native builds. On web its
// methods are simply never called (guarded by Capacitor.isNativePlatform()
// everywhere below), so it's inert dead code there, not a runtime dependency.
// (A `/* @vite-ignore */` dynamic import was tried first to keep it "native
// only" - that's wrong: it leaves the bare specifier unresolved, and a plain
// WebView can't resolve bare module names at runtime, so it always failed.)
import { SocialLogin } from "@capgo/capacitor-social-login";

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
let _pending = null; // { resolve, reject } for the in-flight token request

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

// The access token is also written to device-local settings (see
// DEVICE_LOCAL_SETTINGS - never synced to Drive) so it survives app reloads and
// cold starts. Without this the token only lived in memory, so every relaunch
// re-authenticated - the main reason Drive kept asking you to reconnect.
const TOKEN_KEY = "gdriveToken";
let _hydrated = false;

/** Persist the current token so a relaunch reuses it until it truly expires. */
async function persistToken(tok) {
  try {
    await updateSettings({ [TOKEN_KEY]: tok || null });
  } catch {
    // Non-fatal: worst case we re-auth on the next launch.
  }
}

/** Load a persisted token into memory once. Returns it if still valid, else null. */
async function hydrateToken() {
  if (_token) return hasValidToken() ? _token : null;
  if (_hydrated) return null;
  _hydrated = true;
  try {
    const s = await readSettings();
    const saved = s?.[TOKEN_KEY];
    if (saved?.access_token && saved.expires_at) {
      _token = saved;
      return hasValidToken() ? _token : null;
    }
  } catch {
    // ignore - fall through to a fresh token request
  }
  return null;
}

/** Create the GIS token client once. Its callbacks dispatch to whichever token
 *  request is currently in flight (`_pending`) rather than closing over the very
 *  first request's resolve/reject - otherwise the second and later token
 *  requests (e.g. the silent hourly refresh) would never settle and hang. */
function ensureTokenClient() {
  if (_tokenClient) return;
  _tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPE,
    callback: (response) => {
      const p = _pending;
      _pending = null;
      if (!p) return;
      if (response.error) {
        p.reject(new Error(response.error_description || response.error));
        return;
      }
      const expiresIn = Number(response.expires_in) || 3600;
      _token = {
        access_token: response.access_token,
        expires_at: Date.now() + expiresIn * 1000,
      };
      persistToken(_token); // fire-and-forget: survive reloads
      p.resolve(_token);
    },
    error_callback: (err) => {
      const p = _pending;
      _pending = null;
      if (p) p.reject(new Error(err?.message || "OAuth error"));
    },
  });
}

/**
 * Request a new token from GIS.
 * @param {boolean} interactive - if true, show the consent popup; if false,
 *   try a silent (no-popup) grant first and throw if it fails.
 */
function requestToken(interactive) {
  return new Promise((resolve, reject) => {
    // Only one token request can be in flight at a time - GIS drives a single
    // client. Reject any earlier waiter that never got a callback.
    if (_pending) _pending.reject(new Error("Superseded by a newer token request"));
    _pending = { resolve, reject };
    loadGis()
      .then(() => {
        ensureTokenClient();
        _tokenClient.requestAccessToken({ prompt: interactive ? "" : "none" });
      })
      .catch((err) => {
        if (_pending?.reject === reject) _pending = null;
        reject(err);
      });
  });
}

// ---- Native (Capacitor) sign-in -----------------------------------------

// On Android/iOS the browser GIS popup can't run inside the app's WebView, so
// Drive auth goes through @capgo/capacitor-social-login's Google provider
// instead (Android: Credential Manager under the hood). See ANDROID.md for the
// plugin setup + the Web/Android Google Cloud OAuth clients it requires (this
// plugin needs BOTH: a Web client passed as webClientId, and a separate
// Android client matched to the app's package name + signing SHA-1 - mixing
// them up is the #1 cause of native sign-in failures per the plugin's docs).
let _nativeEmail = null;
let _nativeInitialized = false;
// The WEB OAuth client ID from Google Cloud Console (same project as the
// Android client). Required by the plugin as `webClientId` even on Android.
const NATIVE_WEB_CLIENT_ID = CLIENT_ID;

async function ensureNativeInit() {
  if (!_nativeInitialized) {
    await SocialLogin.initialize({ google: { webClientId: NATIVE_WEB_CLIENT_ID } });
    _nativeInitialized = true;
  }
}

/** Turn a plugin login result into our { access_token, expires_at } shape. */
function tokenFromNativeResponse(response) {
  const accessToken = response?.accessToken?.token;
  if (response?.responseType !== "online" || !accessToken) {
    throw new DriveAuthError("Google sign-in did not return an access token.");
  }
  _nativeEmail = response.profile?.email || _nativeEmail;
  const expiresAt = response.accessToken.expires
    ? Date.parse(response.accessToken.expires)
    : NaN;
  // Native access tokens last ~1h; assume 50 min if no expiry was reported.
  return { access_token: accessToken, expires_at: expiresAt || Date.now() + 50 * 60 * 1000 };
}

async function nativeLogin(options) {
  let response;
  try {
    ({ result: response } = await SocialLogin.login({ provider: "google", options }));
  } catch (e) {
    if (e?.code === "USER_CANCELLED") throw new DriveAuthError("Sign-in was cancelled.");
    throw new DriveAuthError(e?.message || "Native Google sign-in failed.");
  }
  return tokenFromNativeResponse(response);
}

/**
 * Get a native access token.
 *
 * Google Play Services holds the OAuth refresh token internally, so a fresh
 * access token can be minted WITHOUT any UI - even for a background sync. We try
 * that silent path first (`refresh()` + an auto-select login that returns the
 * refreshed token) regardless of `allowInteractive`. Only if the silent path
 * fails do we differ: a user-triggered call (`allowInteractive`) may show the
 * full account chooser; a background call throws DriveAuthError quietly.
 */
async function getNativeToken({ allowInteractive = false } = {}) {
  await ensureNativeInit();

  try {
    // Ask Play Services to refresh the access token from its stored refresh
    // token (silent). Best-effort: the auto-select login below also force-
    // refreshes, so a missing/failed refresh() isn't fatal.
    try {
      await SocialLogin.refresh({ provider: "google", options: { scopes: [SCOPE] } });
    } catch {
      // ignore - fall through to the auto-select login
    }
    // Retrieve the (now fresh) token. For a single previously-authorized account
    // Credential Manager returns it with no UI, so this stays silent.
    return await nativeLogin({
      scopes: [SCOPE],
      forceRefreshToken: true,
      style: "bottom",
      filterByAuthorizedAccounts: true,
      autoSelectEnabled: true,
    });
  } catch (e) {
    if (e instanceof DriveAuthError && /cancel/i.test(e.message)) throw e;
    if (!allowInteractive) {
      // Background: never show a chooser - fail quietly so the caller can nudge
      // a reconnect instead.
      throw e instanceof DriveAuthError
        ? e
        : new DriveAuthError("Drive silent refresh failed - reconnect from Settings.");
    }
    // User-triggered: fall back to a full account chooser.
    return nativeLogin({ scopes: [SCOPE], style: "standard" });
  }
}

/**
 * Resolve a valid access token. On native, uses the Google Sign-In plugin. On
 * web, tries a silent GIS refresh first and falls back to an interactive popup
 * only when `allowInteractive` is true (a user click, not a background sync).
 */
export async function getToken({ allowInteractive = false, forceRefresh = false } = {}) {
  // forceRefresh skips the cache/persisted token and mints a brand-new one -
  // used by the 401 retry path when the current token was rejected mid-request.
  if (!forceRefresh) {
    if (hasValidToken()) return _token;
    // Reuse a token saved on a previous run before asking Google for a new one.
    const restored = await hydrateToken();
    if (restored) return restored;
  }
  if (Capacitor.isNativePlatform()) {
    _token = await getNativeToken({ allowInteractive });
    await persistToken(_token);
    return _token;
  }
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

/** Attach the bearer token to a request's headers. */
function withAuth(opts, token) {
  return {
    ...opts,
    headers: { ...(opts.headers || {}), Authorization: `Bearer ${token.access_token}` },
  };
}

/**
 * fetch() a Drive endpoint with the current access token. If Google rejects the
 * token mid-request (401 - it expired/was revoked between our expiry estimate
 * and the call), mint a FRESH token (silent on native via Play Services) and
 * RETRY THE EXACT SAME request once - rather than failing the whole sync and
 * forcing a full restart. Any other status is returned to the caller as-is.
 */
async function authedFetch(url, opts = {}, { allowInteractive = false } = {}) {
  const token = await getToken({ allowInteractive });
  let res = await fetch(url, withAuth(opts, token));
  if (res.status === 401) {
    _token = null; // the token we used is dead - drop it
    const fresh = await getToken({ allowInteractive, forceRefresh: true });
    res = await fetch(url, withAuth(opts, fresh));
  }
  return res;
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
  if (Capacitor.isNativePlatform()) {
    _token = await getNativeToken({ allowInteractive: true }); // native account picker
    await persistToken(_token);
    await updateSettings({
      gdriveConnected: true,
      gdriveUserEmail: _nativeEmail || null,
    });
    return { email: _nativeEmail };
  }
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
  if (Capacitor.isNativePlatform()) {
    try {
      await SocialLogin.logout({ provider: "google" });
    } catch {
      // ignore - already signed out
    }
    _nativeInitialized = false; // re-initialize on the next connect
  } else if (_token?.access_token) {
    try {
      // Best-effort revoke - ignore errors (token may already be expired).
      window.google?.accounts?.oauth2?.revoke?.(_token.access_token, () => {});
    } catch {
      // ignore
    }
  }
  _token = null;
  _tokenClient = null;
  _nativeEmail = null;
  _hydrated = false;
  await updateSettings({
    gdriveConnected: false,
    gdriveFileId: null,
    gdriveUserEmail: null,
    gdriveToken: null,
    lastSyncedAt: null,
  });
}

/** Fetch the authenticated user's basic profile (email) via the Drive API. */
async function fetchUserInfo() {
  try {
    const res = await authedFetch(`${DRIVE_API}/about?fields=user`, {}, { allowInteractive: false });
    if (!res.ok) return null;
    const data = await res.json();
    return { email: data.user?.emailAddress || null };
  } catch {
    return null;
  }
}

// ---- ETag helpers ---------------------------------------------------------

// Google Drive returns an item's etag two different-looking ways depending on
// the endpoint: the file resource's JSON `etag` FIELD (from `fields=...,etag`
// on create/patch) has NO surrounding quotes, but the raw HTTP `ETag` RESPONSE
// HEADER (all we get from a content-fetching `alt=media` download) DOES carry
// literal quote characters per HTTP spec. We store/compare the bare form
// everywhere internally, and only wrap it in quotes when actually sending it
// as an If-Match/If-None-Match header - mixing the two formats is what caused
// intermittent "Drive upload failed: 400" (a malformed conditional header).
export function bareEtag(raw) {
  if (!raw) return raw;
  return raw.replace(/^"|"$/g, "");
}
export function quotedEtag(bare) {
  if (!bare) return bare;
  return bare.startsWith('"') ? bare : `"${bare}"`;
}

// ---- File helpers -------------------------------------------------------

/** Resolve the Drive file ID, using the cached value or a LIST search. */
async function resolveFileId({ allowInteractive = false } = {}) {
  const s = await readSettings();
  if (s.gdriveFileId) return s.gdriveFileId;

  const res = await authedFetch(
    `${DRIVE_API}/files?spaces=appDataFolder&q=name%3D'${FILE_NAME}'&fields=files(id%2Cname)&pageSize=1`,
    {},
    { allowInteractive }
  );
  if (!res.ok) throw new Error(`Drive LIST failed: ${res.status} - ${await safeErrorText(res)}`);
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
export async function download(cachedEtag = null, { allowInteractive = false } = {}) {
  const fileId = await resolveFileId({ allowInteractive });

  if (!fileId) {
    // No file in Drive yet - this is the first sync.
    return { snapshot: null, etag: null, notModified: false };
  }

  const headers = {};
  if (cachedEtag) headers["If-None-Match"] = quotedEtag(cachedEtag);

  const res = await authedFetch(
    `${DRIVE_API}/files/${fileId}?alt=media`,
    { headers },
    { allowInteractive }
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

  if (!res.ok) throw new Error(`Drive download failed: ${res.status} - ${await safeErrorText(res)}`);

  const etag = bareEtag(res.headers.get("ETag") || res.headers.get("etag") || null);
  let snapshot;
  try {
    snapshot = await res.json();
  } catch {
    throw new Error("Drive file is corrupted or not valid JSON");
  }
  return { snapshot, etag, notModified: false };
}

// ---- Delete -------------------------------------------------------------

/**
 * Permanently delete the sync file from Drive's appDataFolder. Returns true if
 * a file existed and was removed, false if there was nothing there. Local data
 * is untouched - this only removes the Drive copy.
 */
export async function deleteRemoteFile({ allowInteractive = false } = {}) {
  const fileId = await resolveFileId({ allowInteractive });
  if (!fileId) return false;

  const res = await authedFetch(
    `${DRIVE_API}/files/${fileId}`,
    { method: "DELETE" },
    { allowInteractive }
  );
  // 204 = deleted, 404 = already gone - both mean "no file remains".
  if (!res.ok && res.status !== 404) {
    throw new Error(`Drive delete failed: ${res.status} - ${await safeErrorText(res)}`);
  }
  await updateSettings({ gdriveFileId: null });
  return true;
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
export async function upload(snapshot, etag, { retryOnConflict = true, allowInteractive = false } = {}) {
  const fileId = await resolveFileId({ allowInteractive });
  const body = JSON.stringify(snapshot);

  if (!fileId) {
    // Create: multipart upload (metadata + JSON body).
    return _create(body, { allowInteractive });
  } else {
    // Update: PATCH with If-Match etag guard.
    return _patch(fileId, body, etag, retryOnConflict, { allowInteractive });
  }
}

/** Create a new file in appDataFolder via multipart upload. */
async function _create(body, { allowInteractive = false } = {}) {
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

  const res = await authedFetch(
    // Drive API v3's File resource has no JSON "etag" field (that was a v2
    // concept - v3 exposes concurrency control only via the raw HTTP ETag
    // response header). Requesting `fields=id,etag` asks for a field that
    // doesn't exist; Google's create endpoint tolerated it, but the media
    // PATCH endpoint rejects it outright with 400 "Invalid field selection
    // etag" - which was the actual cause of every post-create sync failing.
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: multipart,
    },
    { allowInteractive }
  );

  if (!res.ok) throw new Error(`Drive create failed: ${res.status} - ${await safeErrorText(res)}`);
  const data = await res.json();
  if (data.id) await updateSettings({ gdriveFileId: data.id });
  return bareEtag(res.headers.get("ETag") || res.headers.get("etag"));
}

/** Read a failed response's body for the real reason Google rejected the
 *  request - `!res.ok` alone only tells us the status code, and Google always
 *  includes a JSON `error.message`/`error.errors[].reason` explaining why. */
async function safeErrorText(res) {
  try {
    const text = await res.text();
    return text?.slice(0, 500) || "(empty body)";
  } catch {
    return "(could not read response body)";
  }
}

/** PATCH an existing file. On 412 conflict, optionally re-download, re-merge, retry. */
async function _patch(fileId, body, etag, retryOnConflict, { allowInteractive = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (etag) headers["If-Match"] = quotedEtag(etag);

  const res = await authedFetch(
    // No "etag" JSON field on v3 File resources - see the note on _create().
    `${DRIVE_UPLOAD_API}/files/${fileId}?uploadType=media&fields=id`,
    { method: "PATCH", headers, body },
    { allowInteractive }
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
    return _patch(fileId, newBody, newEtag, false /* no second retry */, { allowInteractive });
  }

  if (res.status === 404) {
    // File was deleted; clear cached ID so the next upload creates it fresh.
    await updateSettings({ gdriveFileId: null });
    throw new Error("Drive file not found - it was deleted externally. Sync again to recreate it.");
  }

  if (!res.ok) throw new Error(`Drive upload failed: ${res.status} - ${await safeErrorText(res)}`);

  return bareEtag(res.headers.get("ETag") || res.headers.get("etag"));
}
