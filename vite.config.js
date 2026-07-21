import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

// Single source of truth for the web build's version. Without this the version
// lived in package.json AND a hand-copied constant in Settings.jsx, which drift
// apart the moment one is bumped and the other isn't.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
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
      includeAssets: ["favicon.png", "icons/*.png"],
      workbox: {
        // Precache everything the built app shell needs, including self-hosted
        // font woff2 files, so nothing depends on the network at runtime.
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "CarPawl - Carpool Fuel Tracker",
        short_name: "CarPawl",
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
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icons/icon-maskable-512.png",
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
});
