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
} from "lucide-react";
import CommandMenu from "./CommandMenu";
import { Button, Input } from "./ui";

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
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("Ava Reed");
  const [newType, setNewType] = useState("Worker");
  const [newStatus, setNewStatus] = useState("active");
  const [newRole, setNewRole] = useState("driver");
  const [creating, setCreating] = useState(false);
  const createOwnedEntity = useMutation(api.metacrdtComponent.createOwnedEntity);
  const compliance = useQuery(api.compliance.workerCompliance, {
    worker: "worker:maria",
  });
  const defs = useQuery(api.flows.listFlowDefs, {});

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
      await createOwnedEntity({
        e,
        type,
        name: name || undefined,
        attributes,
      });
      setNewOpen(false);
      navigate(`/component/e/${encodeURIComponent(e)}`);
    } finally {
      setCreating(false);
    }
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
            <Button variant="primary" onClick={() => setNewOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New entity
            </Button>
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
