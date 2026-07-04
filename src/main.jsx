import React from "react";
import ReactDOM from "react-dom/client";

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

applyStoredTheme();
installUiPop();

ensureSettings().then(setFormatConfig);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
