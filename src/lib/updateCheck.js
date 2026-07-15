import { App as CapApp } from "@capacitor/app";
import { isNative } from "./platform.js";

/* Android update checker. The app is distributed as an APK on GitHub Releases
   (no Play Store), so we poll the latest release and compare its version tag to
   the installed one. Native-only; on web / offline / up-to-date it returns null
   and the caller shows nothing. */

const REPO = "zaiki505/CarPawl-Carpool-Fuel-Tracker";
const LATEST_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

/** Public links for the About section (#7). */
export const GITHUB_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `${GITHUB_URL}/releases`;

/**
 * Fetch the latest release notes to show in-app ("What's new"). Works on any
 * platform - it's just the changelog, not the version gate. Returns null on a
 * network / API failure so the caller can fall back to the GitHub link.
 * @returns {Promise<null | { version, name, notes, url }>}
 */
export async function fetchLatestRelease() {
  try {
    const res = await fetch(LATEST_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const rel = await res.json();
    return {
      version: String(rel.tag_name || rel.name || "").replace(/^v/i, ""),
      name: rel.name || rel.tag_name || "Latest release",
      notes: rel.body || "",
      url: rel.html_url || RELEASES_URL,
    };
  } catch {
    return null;
  }
}

/** "v1.2.3" | "1.2.3" -> [1,2,3]. */
function parseVer(v) {
  return String(v || "")
    .trim()
    .replace(/^v/i, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
}

/** True if version `a` is strictly newer than `b` (semver-ish, numeric parts). */
export function isNewerVersion(a, b) {
  const A = parseVer(a);
  const B = parseVer(b);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] || 0;
    const y = B[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

/**
 * Check GitHub Releases for a newer APK.
 * @returns {Promise<null | { latestVersion, currentVersion, apkUrl, releaseUrl, notes }>}
 *   null = web, offline, request failed, or already current.
 */
export async function checkForUpdate() {
  if (!isNative()) return null;

  let currentVersion = "0.0.0";
  try {
    const info = await CapApp.getInfo();
    currentVersion = info?.version || currentVersion;
  } catch {
    // ignore - fall back to 0.0.0 so any real release counts as newer
  }

  try {
    const res = await fetch(LATEST_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const rel = await res.json();
    const latestVersion = rel.tag_name || rel.name || "";
    if (!latestVersion || !isNewerVersion(latestVersion, currentVersion)) return null;
    const apkAsset = (rel.assets || []).find((a) => /\.apk$/i.test(a.name || ""));
    return {
      latestVersion: String(latestVersion).replace(/^v/i, ""),
      currentVersion,
      apkUrl: apkAsset?.browser_download_url || rel.html_url,
      releaseUrl: rel.html_url,
      notes: rel.body || "",
    };
  } catch {
    return null;
  }
}
