import React, { useState } from "react";
import { checkForUpdate } from "../lib/updateCheck.js";
import { isNative } from "../lib/platform.js";
import { RefreshCw, Download } from "./ui/Icons.jsx";

/* A manual "check for updates" button (Android only). The auto-check banner on
   the home page already nudges when a newer APK lands; this lets the user poll
   on demand from Settings. Renders nothing on web. */
export function CheckUpdateButton() {
  const [status, setStatus] = useState("idle"); // idle | checking | latest
  const [update, setUpdate] = useState(null);

  if (!isNative()) return null;

  async function check() {
    setStatus("checking");
    setUpdate(null);
    const u = await checkForUpdate();
    if (u) {
      setUpdate(u);
      setStatus("idle");
    } else {
      setStatus("latest");
    }
  }

  // A newer release was found - offer the APK download link directly.
  if (update) {
    return (
      <a
        className="check-update check-update--found"
        href={update.apkUrl}
        target="_blank"
        rel="noreferrer"
      >
        <Download size={13} /> Update to v{update.latestVersion}
      </a>
    );
  }

  return (
    <button
      className="check-update"
      type="button"
      onClick={check}
      disabled={status === "checking"}
    >
      <RefreshCw size={13} />
      {status === "checking"
        ? "Checking…"
        : status === "latest"
        ? "You're up to date"
        : "Check for updates"}
    </button>
  );
}
