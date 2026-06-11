import { httpRouter } from "convex/server";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { authComponent, createAuth } from "./auth";
import { components } from "./_generated/api";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

// Serve the built frontend from Convex storage at the deployment's
// `.convex.site` origin. spaFallback serves index.html for unmatched routes so
// client-side routing works.
registerStaticRoutes(http, components.selfHosting, {
  spaFallback: true,
});

export default http;
