import { FormEvent, ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import {
  LayoutGrid,
  Boxes,
  ShieldCheck,
  Workflow,
  Database,
  History,
  Library,
  Plug,
  Search,
  CircleDot,
  Server,
  Plus,
  X,
  HelpCircle,
  LogIn,
  LogOut,
  FileText,
} from "lucide-react";
import CommandMenu from "./CommandMenu";
import GuidedTour, { tourDismissed } from "./GuidedTour";
import { Button, Input } from "./ui";
import { useWriteGate } from "./auth";
import { authClient } from "./lib/auth-client";

type Item = {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number;
  soon?: boolean;
};

function NavSection({ title, items }: { title: string; items: Item[] }) {
  return (
    <div className="px-3">
      <p className="px-2 pb-1.5 pt-4 text-[10px] font-semibold uppercase tracking-wider text-brand-muted">
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.to}>
            {it.soon ? (
              <span className="flex cursor-default items-center justify-between rounded-md px-2 py-1.5 text-[13px] text-brand-muted">
                <span className="flex items-center gap-2.5">
                  {it.icon}
                  {it.label}
                </span>
                <span className="text-[10px] uppercase tracking-wide opacity-70">
                  soon
                </span>
              </span>
            ) : (
              <NavLink
                to={it.to}
                end={it.to === "/"}
                className={({ isActive }) =>
                  `flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] transition-colors ${
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <span className="flex items-center gap-2.5">
                  {it.icon}
                  {it.label}
                </span>
                {it.badge !== undefined && it.badge > 0 && (
                  <span className="tnum rounded-full bg-white/10 px-1.5 text-[11px] text-white/80">
                    {it.badge}
                  </span>
                )}
              </NavLink>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const TITLES: Record<string, string> = {
  "/": "Overview",
  "/entities": "Entities",
  "/compliance": "Compliance",
  "/flows": "Flows",
  "/data-model": "Data model",
  "/transactions": "Transaction log",
};

const ICON = "h-[18px] w-[18px]";

function slug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [commandOpen, setCommandOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(() => !tourDismissed());
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("Ava Reed");
  const [newType, setNewType] = useState("Worker");
  const [newStatus, setNewStatus] = useState("active");
  const [newRole, setNewRole] = useState("driver");
  const [creating, setCreating] = useState(false);
  const [describeOpen, setDescribeOpen] = useState(false);
  const { isAuthenticated, isLoading, openAuthDialog, guardWrite } = useWriteGate();
  const createOwnedEntity = useMutation(api.metacrdtComponent.createOwnedEntity);
  const summary = useQuery(api.overview.summary, {});
  const compliance = useQuery(api.compliance.workerCompliance, {
    worker: "worker:maria",
  });
  const defs = useQuery(api.flows.listFlowDefs, {});
  const activity = useQuery(
    api.overview.recentActivity,
    describeOpen ? { limit: 5 } : "skip",
  );

  const title =
    TITLES[pathname] ??
    (pathname.startsWith("/component/e/")
      ? "Component entity"
      : pathname.startsWith("/e/")
        ? "Entity"
        : "Triple Store");

  async function createEntity(ev: FormEvent) {
    ev.preventDefault();
    const type = newType.trim() || "Entity";
    const name = newName.trim();
    const suffix = Date.now().toString(36);
    const e = `${type.toLowerCase()}:${slug(name || type) || "entity"}-${suffix}`;
    const attributes = [
      ...(newStatus.trim()
        ? [{ a: `${type.toLowerCase()}.status`, value: newStatus.trim() }]
        : []),
      ...(newRole.trim()
        ? [{ a: `${type.toLowerCase()}.role`, value: newRole.trim() }]
        : []),
    ];
    setCreating(true);
    try {
      const created = await guardWrite("Create component-owned entity", () =>
        createOwnedEntity({
          e,
          type,
          name: name || undefined,
          attributes,
        }),
      );
      if (created === undefined) return;
      setNewOpen(false);
      navigate(`/component/e/${encodeURIComponent(e)}`);
    } finally {
      setCreating(false);
    }
  }

  function openNewEntity() {
    if (!isAuthenticated) {
      openAuthDialog({
        description:
          "Creating a component-owned entity is a protected write. Sign in with a Better Auth demo account before creating data.",
      });
      return;
    }
    setNewOpen(true);
  }

  function AuthStatus() {
    const { data: session } = authClient.useSession();

    if (isLoading) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-muted">
          <CircleDot className="h-3.5 w-3.5" />
          Auth...
        </span>
      );
    }
    if (isAuthenticated) {
      const email = session?.user?.email ?? "Signed in";
      return (
        <div className="inline-flex items-center overflow-hidden rounded-full border border-green/30 bg-green-soft text-[12px] font-medium text-green">
          <span className="inline-flex max-w-48 items-center gap-1.5 truncate px-2.5 py-1">
            <CircleDot className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{email}</span>
          </span>
          <button
            type="button"
            onClick={() => void authClient.signOut()}
            className="border-l border-green/20 px-2 py-1 transition-colors hover:bg-green/10"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      );
    }
    return (
      <Button
        variant="ghost"
        onClick={() =>
          openAuthDialog({
            description:
              "Sign in or create a demo Better Auth account to run protected writes.",
          })
        }
      >
        <LogIn className="h-3.5 w-3.5" />
        Sign in
      </Button>
    );
  }

  const workspace: Item[] = [
    { to: "/", label: "Overview", icon: <LayoutGrid className={ICON} /> },
    { to: "/entities", label: "Entities", icon: <Boxes className={ICON} /> },
    {
      to: "/compliance",
      label: "Compliance",
      icon: <ShieldCheck className={ICON} />,
      badge: compliance?.open.length,
    },
    {
      to: "/flows",
      label: "Flows",
      icon: <Workflow className={ICON} />,
      badge: defs?.length,
    },
  ];
  const configure: Item[] = [
    { to: "/data-model", label: "Data model", icon: <Database className={ICON} /> },
    {
      to: "/transactions",
      label: "Transaction log",
      icon: <History className={ICON} />,
    },
  ];
  const modules: Item[] = [
    { to: "/library", label: "Library", icon: <Library className={ICON} />, soon: true },
    { to: "/integrations", label: "Integrations", icon: <Plug className={ICON} />, soon: true },
  ];

  const openObligations = compliance?.open.length ?? 0;
  const totalRequirements = compliance?.required.length ?? 0;
  const latestActivity = activity?.[0];

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col bg-brand text-white">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-bright font-mono text-brand">
            <span className="text-sm font-bold">M</span>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold">MetaCRDT</div>
            <div className="text-[11px] text-brand-muted">Research Preview</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto pb-4">
          <NavSection title="Workspace" items={workspace} />
          <NavSection title="Configure" items={configure} />
          <NavSection title="Modules" items={modules} />
        </nav>

        <div className="flex items-center gap-2.5 border-t border-white/10 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold">
            DW
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-medium">Dana Whitfield</div>
            <div className="text-[11px] text-brand-muted">Acme Staffing · Ops</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-surface px-6">
          <h1 className="text-[15px] font-semibold text-ink">{title}</h1>
          <button
            onClick={() => setCommandOpen(true)}
            className="mx-auto flex w-full max-w-md items-center gap-2 rounded-md border border-line bg-canvas px-3 py-1.5 text-left text-[13px] text-faint transition-colors hover:border-faint hover:bg-line-soft"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1">Search facts, entities, flows…</span>
            <kbd className="rounded border border-line bg-surface px-1 text-[11px] text-muted">
              ⌘K
            </kbd>
          </button>
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => setDescribeOpen(true)}>
              <FileText className="h-3.5 w-3.5" />
              Describe account
            </Button>
            <Button variant="ghost" onClick={() => setTourOpen(true)}>
              <HelpCircle className="h-3.5 w-3.5" />
              Tour
            </Button>
            <Button variant="primary" onClick={openNewEntity}>
              <Plus className="h-3.5 w-3.5" />
              New entity
            </Button>
            <AuthStatus />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-[12px] font-medium text-ink">
              <CircleDot className="h-3.5 w-3.5 text-green" />
              Live
            </span>
            <Server className="h-4 w-4 text-muted" />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
      <CommandMenu open={commandOpen} onClose={() => setCommandOpen(false)} />
      <GuidedTour open={tourOpen} onClose={() => setTourOpen(false)} />
      {describeOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-brand/40 px-4">
          <div className="w-full max-w-2xl rounded-ds border border-line bg-surface shadow-pop">
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">
                  Account description
                </h2>
                <p className="text-[12px] text-muted">Acme Staffing · datarooms</p>
              </div>
              <button
                type="button"
                onClick={() => setDescribeOpen(false)}
                className="rounded-md p-1 text-muted hover:bg-line-soft hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-[14px] leading-6 text-ink">
                Acme Staffing is running a MetaCRDT dataroom for worker
                onboarding and placement compliance. The account has{" "}
                <strong>{summary?.configuredTypes ?? "—"}</strong> configured
                types, <strong>{summary?.placements ?? "—"}</strong> active
                placements, and <strong>{summary?.reusedScopes ?? "—"}</strong>{" "}
                reused evidence scopes. For <strong>worker:maria</strong>,{" "}
                <strong>{Math.max(totalRequirements - openObligations, 0)}</strong>{" "}
                of <strong>{totalRequirements}</strong> required obligations are
                satisfied, with <strong>{openObligations}</strong> still open.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md border border-line bg-canvas px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted">
                    Types
                  </div>
                  <div className="tnum mt-1 text-xl font-semibold text-ink">
                    {summary?.configuredTypes ?? "—"}
                  </div>
                </div>
                <div className="rounded-md border border-line bg-canvas px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted">
                    Placements
                  </div>
                  <div className="tnum mt-1 text-xl font-semibold text-ink">
                    {summary?.placements ?? "—"}
                  </div>
                </div>
                <div className="rounded-md border border-line bg-canvas px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted">
                    Reuse
                  </div>
                  <div className="tnum mt-1 text-xl font-semibold text-green">
                    {summary?.reusedScopes ?? "—"}
                  </div>
                </div>
                <div className="rounded-md border border-line bg-canvas px-3 py-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted">
                    Open
                  </div>
                  <div className="tnum mt-1 text-xl font-semibold text-orange-ink">
                    {openObligations}
                  </div>
                </div>
              </div>
              <div className="rounded-md border border-line bg-canvas px-3 py-2 text-[13px] text-muted">
                Latest change:{" "}
                {activity === undefined ? (
                  "loading"
                ) : latestActivity === undefined ? (
                  "none"
                ) : (
                  <>
                    <span className="font-medium text-ink">
                      {latestActivity.reason ?? latestActivity.kind}
                    </span>{" "}
                    on <span className="font-mono">{latestActivity.e}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-line-soft px-5 py-3.5">
              <Button variant="ghost" onClick={() => setDescribeOpen(false)}>
                Close
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setDescribeOpen(false);
                  navigate("/transactions");
                }}
              >
                View log
              </Button>
            </div>
          </div>
        </div>
      )}
      {newOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-brand/40 px-4">
          <form
            onSubmit={createEntity}
            className="w-full max-w-md rounded-ds border border-line bg-surface shadow-pop"
          >
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">
                  New component entity
                </h2>
                <p className="text-[12px] text-muted">@metacrdt/convex state</p>
              </div>
              <button
                type="button"
                onClick={() => setNewOpen(false)}
                className="rounded-md p-1 text-muted hover:bg-line-soft hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 p-5">
              <label className="block text-[12px] font-medium text-ink-2">
                Type
                <Input
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  className="mt-1 w-full"
                />
              </label>
              <label className="block text-[12px] font-medium text-ink-2">
                Name
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="mt-1 w-full"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-[12px] font-medium text-ink-2">
                  Status
                  <Input
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                    className="mt-1 w-full"
                  />
                </label>
                <label className="block text-[12px] font-medium text-ink-2">
                  Role
                  <Input
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="mt-1 w-full"
                  />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-line-soft px-5 py-3.5">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setNewOpen(false)}
              >
                Cancel
              </Button>
              <Button variant="primary" type="submit" disabled={creating}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
