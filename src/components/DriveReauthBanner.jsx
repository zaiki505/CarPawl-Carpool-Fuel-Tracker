import React, { useEffect, useState } from "react";
import { useSyncStatus, syncNow } from "../lib/syncEngine.js";
import { connect, DriveAuthError } from "../lib/drive.js";
import { useApp } from "../app/AppContext.jsx";
import { useSettings } from "../db/hooks.js";
import { CloudOff, RefreshCw, X } from "./ui/Icons.jsx";

/* Homepage warning shown when a background Drive sync failed because the
   sign-in lapsed. Background syncs stay silent (no popups); this dismissable
   banner is the visible nudge to reconnect instead of failing invisibly. */
export function DriveReauthBanner() {
  const status = useSyncStatus();
  const settings = useSettings();
  const { toast } = useApp();
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  const connected = Boolean(settings?.gdriveConnected);
  const needsReauth = connected && Boolean(status?.needsReauth);

  // Re-arm the banner whenever the problem clears, so a later lapse shows again.
  useEffect(() => {
    if (!needsReauth) setDismissed(false);
  }, [needsReauth]);

  if (!needsReauth || dismissed) return null;

  async function onReconnect() {
    setBusy(true);
    try {
      // A lapsed session can't be fixed silently - run the real sign-in (the
      // account picker, same as Connect), then sync. Success flips needsReauth
      // false and this banner hides.
      await connect();
      await syncNow({ allowInteractive: true });
    } catch (e) {
      // Cancelled the picker / sign-in failed - keep the banner, tell them why.
      if (!(e instanceof DriveAuthError && /cancel/i.test(e.message || ""))) {
        toast(e?.message || "Couldn't reconnect Google Drive", "error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="reauth-banner" role="alert">
      <CloudOff size={18} className="reauth-banner__icon" />
      <div className="reauth-banner__text">
        <strong>Google Drive sync paused</strong>
        <span>Your sign-in expired - reconnect to resume syncing across devices.</span>
      </div>
      <button
        className="reauth-banner__action"
        type="button"
        onClick={onReconnect}
        disabled={busy}
      >
        <RefreshCw size={14} className={busy ? "spin" : ""} /> Reconnect
      </button>
      <button
        className="reauth-banner__close"
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}
