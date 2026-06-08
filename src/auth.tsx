import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { useConvexAuth } from "convex/react";
import { X } from "lucide-react";
import { Button } from "./ui";

type AuthDialog = {
  title: string;
  description: string;
};

type AuthUi = {
  openAuthDialog: (dialog?: Partial<AuthDialog>) => void;
};

const AuthUiContext = createContext<AuthUi | null>(null);

const DEFAULT_DIALOG: AuthDialog = {
  title: "Sign in required",
  description:
    "This workspace already enforces authenticated writes on the server. Choose and configure a provider before using protected write controls.",
};

export function AuthUiProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<AuthDialog | null>(null);
  const value = useMemo<AuthUi>(
    () => ({
      openAuthDialog: (next) => setDialog({ ...DEFAULT_DIALOG, ...next }),
    }),
    [],
  );

  return (
    <AuthUiContext.Provider value={value}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-brand/40 px-4 backdrop-blur-sm"
          onMouseDown={() => setDialog(null)}
        >
          <div
            className="w-full max-w-lg rounded-ds border border-line bg-surface shadow-pop"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-line-soft px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">
                  {dialog.title}
                </h2>
                <p className="mt-1 text-[13px] text-muted">{dialog.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="rounded-md p-1 text-muted hover:bg-line-soft hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4 text-[13px] text-muted">
              <p>
                The backend derives writers from{" "}
                <code className="font-mono text-ink">ctx.auth.getUserIdentity()</code>
                . This frontend is now auth-aware, but no hosted provider is wired in
                yet.
              </p>
              <p>
                Production setup still needs a provider decision
                (Convex Auth, Clerk, WorkOS, Auth0, or custom OIDC), a matching{" "}
                <code className="font-mono text-ink">convex/auth.config.ts</code>,
                and a provider-specific React wrapper that returns Convex JWTs.
              </p>
            </div>
            <div className="flex justify-end border-t border-line-soft px-5 py-3.5">
              <Button variant="primary" onClick={() => setDialog(null)}>
                Got it
              </Button>
            </div>
          </div>
        </div>
      )}
    </AuthUiContext.Provider>
  );
}

export function useAuthUi() {
  const ctx = useContext(AuthUiContext);
  if (ctx === null) throw new Error("Missing AuthUiProvider");
  return ctx;
}

export function useAuthStatus() {
  return useConvexAuth();
}

export function isNotAuthenticatedError(err: unknown): boolean {
  const text =
    err instanceof Error
      ? `${err.name}: ${err.message}`
      : typeof err === "string"
        ? err
        : JSON.stringify(err);
  return text.toLowerCase().includes("not authenticated");
}

export function useWriteGate() {
  const auth = useAuthStatus();
  const { openAuthDialog } = useAuthUi();
  const canWrite = auth.isAuthenticated;

  async function guardWrite<T>(
    label: string,
    fn: () => Promise<T>,
  ): Promise<T | undefined> {
    if (auth.isLoading) return undefined;
    if (!auth.isAuthenticated) {
      openAuthDialog({
        description: `${label} is a protected write. Sign in with a configured provider before running it.`,
      });
      return undefined;
    }
    try {
      return await fn();
    } catch (err) {
      if (isNotAuthenticatedError(err)) {
        openAuthDialog({
          description: `${label} was rejected by the server because this session is not authenticated.`,
        });
        return undefined;
      }
      throw err;
    }
  }

  return { ...auth, canWrite, guardWrite, openAuthDialog };
}
