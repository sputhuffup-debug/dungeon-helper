import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // the Alien module's 200-seed procedure runs take a while when every suite runs at once
    testTimeout: 120_000,
  },
});
