import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Builds the demo frontend into ./dist, which the static-hosting CLI uploads to
// Convex storage and serves from the deployment's .convex.site origin.
export default defineConfig({
  plugins: [react()],
});
