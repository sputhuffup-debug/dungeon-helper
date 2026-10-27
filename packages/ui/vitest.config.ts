import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.{ts,tsx}"],
    css: false,
    // some suites load whole data packs; that runs slowly when turbo runs every suite at once
    testTimeout: 20_000,
  },
});
