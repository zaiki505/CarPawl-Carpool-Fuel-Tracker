import React from "react";
import ReactDOM from "react-dom/client";

// Self-hosted JetBrains Mono (offline-first - no Google Fonts CDN). Weights
// cover the source's usage: body 400/500, semibold 600, bold headings 700/800.
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "@fontsource/jetbrains-mono/800.css";
import "@fontsource/jetbrains-mono/400-italic.css";

// Zaiki design tokens (colors, surfaces, motion, component classes). We import
// them individually and provide our own typography.css so the CDN font @import
// in the bundle's typography.css is never pulled in.
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

applyStoredTheme();
installUiPop();
// Create the settings row once at boot (outside any live query, where writing
// is safe). Live queries only ever read it after this.
ensureSettings();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
