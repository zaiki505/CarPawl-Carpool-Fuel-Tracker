import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// CarPawl is a fully offline-capable, installable PWA. Workbox (via
// vite-plugin-pwa) precaches the app shell + every static asset so the app
// loads and runs with no network after the first install. There is no backend
// to fall back to - all data lives in IndexedDB on-device.
export default defineConfig({
  // Force a single React instance. Without this, Vite's dep pre-bundling can
  // give dexie-react-hooks / recharts their own React copy, which triggers
  // "Invalid hook call" at runtime.
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
      includeAssets: ["favicon.svg", "icons/*.png"],
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
    environment: "node",
    include: ["src/**/*.test.js"],
  },
});
