import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/__tests__/**/*.test.ts", "tests/**/*.test.ts"],
    testTimeout: 60_000,
  },
});
