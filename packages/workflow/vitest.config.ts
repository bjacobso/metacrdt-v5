import { defineConfig } from "vitest/config";

// Pure package: no Convex runtime, no DOM.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
