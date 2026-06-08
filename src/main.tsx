import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { getConvexUrl } from "@convex-dev/static-hosting";
import App from "./App";
import { AuthUiProvider } from "./auth";
import "./index.css";

// When served from .convex.site, getConvexUrl() derives the .convex.cloud URL
// from the hostname. Locally (vite dev) we use the baked-in VITE_CONVEX_URL.
const convexUrl = import.meta.env.VITE_CONVEX_URL ?? getConvexUrl();
const convex = new ConvexReactClient(convexUrl);

function useNoAuthProvider() {
  const fetchAccessToken = React.useCallback(async () => null, []);
  return React.useMemo(
    () => ({
      isLoading: false,
      isAuthenticated: false,
      fetchAccessToken,
    }),
    [fetchAccessToken],
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexProviderWithAuth client={convex} useAuth={useNoAuthProvider}>
      <AuthUiProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthUiProvider>
    </ConvexProviderWithAuth>
  </React.StrictMode>,
);
