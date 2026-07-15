import React, { useEffect, useRef, useState } from "react";
import { useSyncStatus } from "../lib/syncEngine.js";
import { useSettings } from "../db/hooks.js";
import { RefreshCw, Check, CloudOff, X } from "./ui/Icons.jsx";

/* A small floating status pill that appears while a Google Drive sync runs (#18).
   Rendered app-wide (BATCH_3 #3) so it shows on every tab, and can be switched
   off from the Drive-sync settings. Blur + slide + fade on the way in and out.
   Only reacts to real transitions (a sync that actually started this session),
   auto-dismisses shortly after a success, and stays for an error until closed. */
export function SyncStatusCard() {
  const { state, error } = useSyncStatus();
  const settings = useSettings();
  const enabled = settings?.syncStatusCard !== false;
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [content, setContent] = useState(null); // { kind, text }
  const prev = useRef(state);
  const hideTimer = useRef(null);
  const dismissedRef = useRef(false);

  function dismiss() {
    dismissedRef.current = true;
    clearTimeout(hideTimer.current);
    setLeaving(true);
    hideTimer.current = setTimeout(() => setVisible(false), 320); // match exit anim
  }

  useEffect(() => {
    const from = prev.current;
    prev.current = state;
    clearTimeout(hideTimer.current);

    if (state === "syncing") {
      dismissedRef.current = false;
      setContent({ kind: "syncing", text: "Syncing with Google Drive…" });
      setLeaving(false);
      setVisible(true);
    } else if (state === "done") {
      // Only celebrate a sync that actually ran this session (not a stale
      // "done" left over from boot), and not if the user just dismissed it.
      if (from !== "syncing" || dismissedRef.current) return;
      setContent({ kind: "done", text: "Synced with Google Drive" });
      setLeaving(false);
      setVisible(true);
      hideTimer.current = setTimeout(dismiss, 2200);
    } else if (state === "error") {
      if (from !== "syncing") return;
      setContent({ kind: "error", text: error || "Sync failed" });
      setLeaving(false);
      setVisible(true);
    }
    return () => clearTimeout(hideTimer.current);
  }, [state, error]);

  if (!enabled || !visible || !content) return null;

  const Icon =
    content.kind === "syncing" ? RefreshCw : content.kind === "done" ? Check : CloudOff;

  return (
    <div
      className={"sync-card sync-card--" + content.kind + (leaving ? " is-leaving" : "")}
      role="status"
    >
      <Icon size={15} className={content.kind === "syncing" ? "spin" : ""} />
      <span className="sync-card__text">{content.text}</span>
      <button className="sync-card__close" type="button" onClick={dismiss} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
