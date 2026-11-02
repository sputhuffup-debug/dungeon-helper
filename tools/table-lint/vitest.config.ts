import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // linting the whole Alien module with 50 seeds per procedure runs slowly when turbo runs every suite at once
    testTimeout: 30_000,
  },
});
