import React, { useEffect, useState } from "react";
import { checkForUpdate } from "../lib/updateCheck.js";
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
      <a
        className="update-banner__action"
        href={update.apkUrl}
        target="_blank"
        rel="noreferrer"
      >
        <Download size={14} /> Update
      </a>
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
