/**
 * README screenshots: `pnpm screenshots` at the root (builds the app, then
 * runs this project). Kept out of `test:e2e`: the main config's testDir is
 * ./e2e, this one's is ./screenshots. One test per image, so a single shot
 * re-runs with `-g`, e.g. `pnpm --filter @campaign-forge/web screenshots -g creature-turn`.
 *
 * Output: docs/screenshots/ at the repo root, or `SCREENSHOTS_DIR`.
 */
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testDir: "./screenshots",
  // one worker: shots run in file order and the preview server is not contended
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 120_000,
  outputDir: "./test-results/screenshots",
  use: {
    ...base.use,
    launchOptions: {
      ...base.use?.launchOptions,
      // steadier rasterisation between runs
      args: ["--force-color-profile=srgb", "--disable-partial-raster", "--disable-skia-runtime-opts", "--disable-gpu-rasterization", "--disable-lcd-text"],
    },
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "UTC",
  },
});
