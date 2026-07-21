import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

// Single source of truth for the web build's version. Without this the version
// lived in package.json AND a hand-copied constant in Settings.jsx, which drift
// apart the moment one is bumped and the other isn't.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/* The installed PWA's name and icon come from the manifest, which is generated
   here at build time - so unlike the page title it cannot be corrected at
   runtime. It has to be resolved from the mode. Mirrors src/lib/channel.js:
   anything that isn't exactly "release" is beta. */
export default defineConfig(({ mode }) => {
  const isBeta = mode !== "release";
  const icon = (name) => (isBeta ? `icons/beta-${name}` : `icons/${name}`);

  return {
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "dexie", "dexie-react-hooks", "recharts"],
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Channel-scoped: a blanket "icons/*.png" force-includes the other
      // channel's set into the precache and quietly defeats globIgnores below.
      includeAssets: isBeta
        ? ["favicon.png", "favicon-beta.png", "icons/*.png"]
        : ["favicon.png", "icons/icon-*.png", "icons/apple-touch-icon.png"],
      workbox: {
        // Precache everything the built app shell needs, including self-hosted
        // font woff2 files, so nothing depends on the network at runtime.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        // public/ is copied wholesale, so without this an official build would
        // precache the beta icon set too - pushing ~200KB of images no official
        // user will ever see onto their device. Beta keeps both sets: its HTML
        // references the official icons until main.jsx swaps them.
        // Patterns are relative to the build dir, so no "**/" prefix - with it,
        // the nested icons/ pattern silently matches nothing.
        globIgnores: isBeta ? [] : ["icons/beta-*.png", "favicon-beta.png", "Carpawl-Beta-*.png"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: isBeta ? "CarPawl Beta - Carpool Fuel Tracker" : "CarPawl - Carpool Fuel Tracker",
        short_name: isBeta ? "CarPawl Beta" : "CarPawl",
        description:
          "Track your car's fuel spending and split carpool fuel bills - offline, on your device.",
        theme_color: "#141418",
        background_color: "#141418",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: icon("icon-192.png"),
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: icon("icon-512.png"),
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: icon("icon-maskable-512.png"),
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  test: {
    // Lib tests run in fast node env; component tests opt into happy-dom via a
    // `// @vitest-environment happy-dom` docblock at the top of the file.
    environment: "node",
    globals: true,
    include: ["src/**/*.test.{js,jsx}"],
    setupFiles: ["src/test/setup.js"],
  },
  };
});
