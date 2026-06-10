import { createAuthClient } from "better-auth/react";
import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";

const convexSiteUrl =
  import.meta.env.VITE_CONVEX_SITE_URL ??
  (window.location.hostname.endsWith(".convex.site")
    ? window.location.origin
    : undefined);

if (convexSiteUrl === undefined) {
  throw new Error("Missing VITE_CONVEX_SITE_URL for Better Auth");
}

export const authClient = createAuthClient({
  baseURL: convexSiteUrl,
  plugins: [convexClient(), crossDomainClient() as never],
});
