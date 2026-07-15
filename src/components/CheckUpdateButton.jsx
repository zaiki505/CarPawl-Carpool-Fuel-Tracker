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

  // A newer release was found. Open the GitHub RELEASE PAGE (not the direct APK
  // asset): the in-app WebView can't follow GitHub's redirecting binary download
  // - it silently fails, and the biometric lock re-locking on background kills
  // it too (#3/#4). The release page opens in the system browser, where the user
  // taps the APK to download it reliably.
  if (update) {
    return (
      <button
        type="button"
        className="check-update check-update--found"
        onClick={() => window.open(update.releaseUrl, "_blank")}
      >
        <Download size={13} /> Get v{update.latestVersion} on GitHub
      </button>
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
