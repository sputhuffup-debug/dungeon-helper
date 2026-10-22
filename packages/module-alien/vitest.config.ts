import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // map and duct tests generate dozens of site maps per test; that runs slowly when turbo runs every suite at once
    testTimeout: 30_000,
  },
});
