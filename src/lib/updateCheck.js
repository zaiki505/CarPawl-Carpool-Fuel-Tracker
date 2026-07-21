import { App as CapApp } from "@capacitor/app";
import { isNative } from "./platform.js";
import { CHANNEL_REPO, IS_BETA } from "./channel.js";

/* Android update checker. The app is distributed as an APK on GitHub Releases
   (no Play Store), so we poll the newest release and compare its version tag to
   the installed one. Native-only; on web / offline / up-to-date it returns null
   and the caller shows nothing.

   Which repo depends on the build channel (see channel.js): a beta build tracks
   the beta repo, an official build tracks the public one. A beta never offers
   an official build and vice versa - they're separate apps on the device. */

const REPO = CHANNEL_REPO;
const API = `https://api.github.com/repos/${REPO}`;
/* /releases/latest deliberately EXCLUDES prereleases, which is right for the
   official channel and useless for beta (where every release is a prerelease).
   Beta reads the plain list instead - GitHub returns it newest-first - and skips
   drafts. */
const LATEST_URL = IS_BETA ? `${API}/releases?per_page=10` : `${API}/releases/latest`;

/** Public links for the About section (#7). */
export const GITHUB_URL = `https://github.com/${REPO}`;
export const RELEASES_URL = `${GITHUB_URL}/releases`;

/** Unwrap whichever shape the endpoint returned into one release object. */
function pickRelease(payload) {
  if (Array.isArray(payload)) return payload.find((r) => !r.draft) || null;
  return payload || null;
}

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
    const rel = pickRelease(await res.json());
    if (!rel) return null;
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

/** "v1.2.3-beta.1" -> { parts: [1,2,3], pre: ["beta", 1] }. `pre` is null when
 *  there's no prerelease suffix. Numeric identifiers are kept as numbers so
 *  beta.10 sorts above beta.9 rather than below it as a string would. */
function parseVer(v) {
  const s = String(v || "").trim().replace(/^v/i, "");
  const [core, ...rest] = s.split("-");
  const pre = rest.join("-");
  return {
    parts: core.split(".").map((n) => parseInt(n, 10) || 0),
    pre: pre
      ? pre.split(".").map((x) => (/^\d+$/.test(x) ? parseInt(x, 10) : x))
      : null,
  };
}

/**
 * True if version `a` is strictly newer than `b`, following semver precedence.
 * The prerelease rules matter here: 0.4.0-beta.1 must rank BELOW 0.4.0, or a
 * beta tester who installs the finished build gets told they're out of date
 * forever (the old numeric-only compare treated the two as equal).
 */
export function isNewerVersion(a, b) {
  const A = parseVer(a);
  const B = parseVer(b);
  for (let i = 0; i < Math.max(A.parts.length, B.parts.length); i++) {
    const x = A.parts[i] || 0;
    const y = B.parts[i] || 0;
    if (x !== y) return x > y;
  }
  // Same x.y.z. A finished release outranks any prerelease of that number.
  if (!A.pre && !B.pre) return false;
  if (!A.pre) return true;
  if (!B.pre) return false;
  // Both prereleases: compare identifiers left to right (semver spec 11.4).
  for (let i = 0; i < Math.max(A.pre.length, B.pre.length); i++) {
    const x = A.pre[i];
    const y = B.pre[i];
    if (x === undefined) return false; // a shorter set of identifiers ranks lower
    if (y === undefined) return true;
    if (x === y) continue;
    const xNum = typeof x === "number";
    const yNum = typeof y === "number";
    if (xNum && yNum) return x > y;
    if (xNum !== yNum) return !xNum; // numeric ranks lower than alphanumeric
    return String(x) > String(y);
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
    const rel = pickRelease(await res.json());
    if (!rel) return null;
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
