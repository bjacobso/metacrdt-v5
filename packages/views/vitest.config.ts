import { defineConfig } from "vitest/config";

// Pure package: no Convex runtime, no DOM. Tests cover the ViewSpec runtime,
// the generated Schema contract, the IR snapshots, and generated-source drift.
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
