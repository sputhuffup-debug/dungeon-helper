import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // the pack test loads and validates the whole example pack (and its map engine); that runs slowly when turbo runs every suite at once
    testTimeout: 30_000,
  },
});
