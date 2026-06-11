import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { getConvexUrl } from "@convex-dev/static-hosting";
import App from "./App";
import { AuthUiProvider } from "./auth";
import { authClient } from "./lib/auth-client";
import "./index.css";

// When served from .convex.site, getConvexUrl() derives the .convex.cloud URL
// from the hostname. Locally (vite dev) we use the baked-in VITE_CONVEX_URL.
const convexUrl = import.meta.env.VITE_CONVEX_URL ?? getConvexUrl();
const convex = new ConvexReactClient(convexUrl);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <AuthUiProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthUiProvider>
    </ConvexBetterAuthProvider>
  </React.StrictMode>,
);
