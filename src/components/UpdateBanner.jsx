import React, { useEffect, useState } from "react";
import { checkForUpdate } from "../lib/updateCheck.js";
import { notifyUpdateAvailable } from "../lib/notifications.js";
import { useSettings } from "../db/hooks.js";
import { updateSettings } from "../db/db.js";
import { Download, X } from "./ui/Icons.jsx";

/* Homepage banner (Android) shown when a newer APK is on GitHub Releases.
   Dismissable per-version: once you dismiss version X it stays hidden until an
   even newer version appears. Native-only - checkForUpdate() returns null on
   web, so this renders nothing there. */
export function UpdateBanner() {
  const settings = useSettings();
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    let alive = true;
    checkForUpdate().then((u) => alive && setUpdate(u));
    return () => {
      alive = false;
    };
  }, []);

  // Fire a local notification once per new version (in addition to this banner).
  useEffect(() => {
    if (!update || !settings) return;
    if (settings.notifiedUpdateVersion === update.latestVersion) return;
    notifyUpdateAvailable(update.latestVersion);
    updateSettings({ notifiedUpdateVersion: update.latestVersion });
  }, [update, settings]);

  if (!update) return null;
  if (settings?.dismissedUpdateVersion === update.latestVersion) return null;

  function dismiss() {
    // Device-local (see DEVICE_LOCAL_SETTINGS) so dismissing on one phone doesn't
    // hide it on another that hasn't updated yet.
    updateSettings({ dismissedUpdateVersion: update.latestVersion });
    setUpdate(null);
  }

  return (
    <div className="update-banner" role="alert">
      <Download size={18} className="update-banner__icon" />
      <div className="update-banner__text">
        <strong>Update available</strong>
        <span>
          CarPawl {update.latestVersion} is out - you have {update.currentVersion}.
        </span>
      </div>
      {/* Open the GitHub release PAGE, not the direct APK asset: the WebView
          can't follow the redirecting binary download (and the biometric lock
          re-locks on background), so it fails in-app; the release page opens in
          the system browser where the APK downloads fine (#3/#4). */}
      <button
        className="update-banner__action"
        type="button"
        onClick={() => window.open(update.releaseUrl, "_blank")}
      >
        <Download size={14} /> Update
      </button>
      <button
        className="update-banner__close"
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
