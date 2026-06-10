import {
  createContext,
  FormEvent,
  ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { useConvexAuth } from "convex/react";
import { LogIn, UserPlus, X } from "lucide-react";
import { Button, Input } from "./ui";
import { authClient } from "./lib/auth-client";

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
    "This workspace enforces authenticated writes on the server. Sign in with a demo Better Auth account before using protected write controls.",
};

function authErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "Authentication failed. Check the email and password, then try again.";
}

export function AuthUiProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<AuthDialog | null>(null);
  const [email, setEmail] = useState("demo@example.com");
  const [password, setPassword] = useState("password1234");
  const [submitting, setSubmitting] = useState<"signIn" | "signUp" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const value = useMemo<AuthUi>(
    () => ({
      openAuthDialog: (next) => {
        setError(null);
        setDialog({ ...DEFAULT_DIALOG, ...next });
      },
    }),
    [],
  );

  async function submitAuth(mode: "signIn" | "signUp") {
    const normalizedEmail = email.trim();
    if (normalizedEmail.length === 0 || !normalizedEmail.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSubmitting(mode);
    setError(null);
    try {
      const result =
        mode === "signUp"
          ? await authClient.signUp.email({
              name: normalizedEmail.split("@")[0] || "Demo user",
              email: normalizedEmail,
              password,
            })
          : await authClient.signIn.email({
              email: normalizedEmail,
              password,
              rememberMe: true,
            });
      if (result.error) {
        setError(authErrorMessage(result.error));
        return;
      }
      setDialog(null);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSubmitting(null);
    }
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    await submitAuth("signIn");
  }

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
            <form onSubmit={onSubmit}>
              <div className="space-y-4 px-5 py-4 text-[13px] text-muted">
                <div className="rounded-md border border-blue/20 bg-blue-soft px-3 py-2 text-blue-ink">
                  Demo auth uses Better Auth email/password with email
                  verification disabled. The backend still derives identity from{" "}
                  <code className="font-mono">ctx.auth.getUserIdentity()</code>.
                </div>
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-ink">Email</span>
                  <Input
                    type="email"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    autoComplete="email"
                    className="w-full"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-medium text-ink">
                    Password
                  </span>
                  <Input
                    type="password"
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    autoComplete="current-password"
                    className="w-full"
                  />
                </label>
                {error && (
                  <div className="rounded-md border border-red/20 bg-red-soft px-3 py-2 text-red-ink">
                    {error}
                  </div>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-line-soft px-5 py-3.5">
                <Button
                  variant="outline"
                  disabled={submitting !== null}
                  onClick={() => void submitAuth("signUp")}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  {submitting === "signUp" ? "Creating..." : "Create demo account"}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={submitting !== null}
                >
                  <LogIn className="h-3.5 w-3.5" />
                  {submitting === "signIn" ? "Signing in..." : "Sign in"}
                </Button>
              </div>
            </form>
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
        description: `${label} is a protected write. Sign in with a Better Auth demo account before running it.`,
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
