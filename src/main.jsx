import React from "react";
import ReactDOM from "react-dom/client";
import { APP_NAME, IS_BETA } from "./lib/channel.js";

// index.html ships the neutral "CarPawl" name and the official icons. Only a
// beta build needs to change them, so an official build never flashes the wrong
// title or favicon while JS boots - the static HTML is already right for the
// case that matters. (The installed PWA's icon comes from the manifest, which
// is resolved at build time in vite.config.js - it can't be patched here.)
if (document.title !== APP_NAME) document.title = APP_NAME;
if (IS_BETA) {
  // Swap each link to its same-SIZE beta counterpart. Pointing them all at one
  // file would hand the browser a 64px image for the 192px slot.
  const betaIcon = {
    "/favicon.png": "/favicon-beta.png",
    "/icons/icon-192.png": "/icons/beta-icon-192.png",
    "/icons/apple-touch-icon.png": "/icons/beta-apple-touch-icon.png",
  };
  for (const link of document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')) {
    const next = betaIcon[link.getAttribute("href")];
    if (next) link.setAttribute("href", next);
  }
}

// Self-hosted JetBrains Mono
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/jetbrains-mono/800.css";
import "@fontsource/jetbrains-mono/400-italic.css";

import "../zaiki-design-system/project/tokens/colors.css";
import "../zaiki-design-system/project/tokens/surfaces.css";
import "../zaiki-design-system/project/tokens/motion.css";
import "../zaiki-design-system/project/tokens/components.css";
import "./styles/typography.css";
import "./styles/app.css";

import App from "./App.jsx";
import { installUiPop } from "./lib/uiPop.js";
import { applyStoredTheme } from "./lib/theme.js";
import { ensureSettings } from "./db/db.js";
import { setFormatConfig } from "./lib/format.js";
import { initAutoSync } from "./lib/syncEngine.js";
import { syncRefuelReminder, syncPaymentReminders } from "./lib/notifications.js";
import { generateDueRecurrences } from "./db/actions.js";

applyStoredTheme();
installUiPop();

// Ask the browser to keep the IndexedDB data durably instead of treating it as
// "best-effort", which browsers are allowed to evict or after inactivity
if (navigator.storage?.persist) {
  navigator.storage
    .persisted()
    .then((already) => (already ? true : navigator.storage.persist()))
    .then((persisted) => {
      if (!persisted) {
        console.warn(
          "CarPawl: storage is not persistent - the browser may evict local data. " +
            "Installing the app (Add to Home Screen) or granting storage permission makes it more durable."
        );
      }
    })
    .catch(() => {});
}

ensureSettings().then((s) => {
  setFormatConfig(s);
  initAutoSync();
  // Reschedule the smart refuel reminder + payment reminders on each launch
  // (native no-op on web).
  syncRefuelReminder(Boolean(s.refuelReminder));
  syncPaymentReminders(s);
  // Roll any recurring trips forward (schedule the next upcoming occurrence).
  generateDueRecurrences().catch(() => {});
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
