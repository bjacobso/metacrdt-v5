import { defineConfig } from "vitest/config";

// Browser-facing package, tested with explicit storage/channel fakes under Node.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
});
