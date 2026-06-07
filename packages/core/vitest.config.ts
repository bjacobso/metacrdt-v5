import { defineConfig } from "vitest/config";

// Pure package: default (node) environment, no edge-runtime, no Convex.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
