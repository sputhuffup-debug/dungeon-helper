import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const VENDOR = /node_modules[\\/](react|react-dom|scheduler|use-sync-external-store|@tanstack[\\/](react-router|router-core|history|store|react-store))[\\/]/;
const SDK = /packages[\\/]module-sdk[\\/]src[\\/]|node_modules[\\/](ajv|ajv-formats|fast-uri|fast-deep-equal|json-schema-traverse|json-logic-js)[\\/]/;
const ALIEN_AREAS = ["data", "tables", "maps", "rules"];

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Campaign Forge",
        short_name: "Forge",
        description: "A Game Master's workspace for tabletop RPG campaigns.",
        theme_color: "#0f1a1f",
        background_color: "#0f1a1f",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        // Every chunk is precached for offline play, built-in data packs included: each JSON file of a
        // pack (`PackSource`) becomes its own lazy chunk, so a large pack (a whole SRD) is split into
        // part files that each stay well under this limit (aim for 2 MB a part). A chunk over it would
        // silently miss the precache and fail offline. Imported packs live in IndexedDB, not here.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: "/index.html",
      },
    }),
  ],
  server: { port: 5173 },
  build: {
    target: "es2022",
    sourcemap: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // React and the router: what every page needs, in one cacheable chunk next to the entry.
            {
              name: "vendor",
              test: (id: string) => VENDOR.test(id) || id === "\0rolldown/runtime.js" || id === "\0vite/preload-helper.js",
            },
            // The game-module SDK (with ajv for the conformance check) loads with a campaign; on its
            // own chunk so the module chunks below cannot pull it in as a dependency.
            { name: "module-sdk", test: SDK },
            // The Alien module is one lazy import, loaded when an Alien campaign opens. Split by area so no
            // chunk passes the 500 kB warning; leaves first, so each area keeps only its own files.
            ...ALIEN_AREAS.map((area) => ({ name: `alien-${area}`, test: new RegExp(`packages[\\\\/]module-alien[\\\\/]src[\\\\/]${area}[\\\\/]`) })),
            { name: "alien", test: /packages[\\/]module-alien[\\/]src[\\/]/ },
          ],
        },
      },
    },
  },
  worker: { format: "es" },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
    // module-backed tests (templates, generators) run slowly when turbo runs every suite at once
    testTimeout: 20_000,
  },
});
