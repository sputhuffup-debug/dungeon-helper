import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // several suites load and validate whole example packs; that runs slowly when turbo runs every suite at once
    testTimeout: 30_000,
  },
});
