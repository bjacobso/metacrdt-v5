import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Root suite is the Convex backend (edge-runtime). The @metacrdt/* workspace
    // packages are pure and run under their own (node) vitest config.
    include: ["convex/**/*.test.ts"],
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
  },
});
