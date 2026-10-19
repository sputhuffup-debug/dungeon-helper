import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // whole-campaign builds over many seeds run slowly when turbo runs every suite at once
    testTimeout: 20_000,
  },
});
