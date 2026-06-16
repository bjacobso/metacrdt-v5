import { ReactNode, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import {
  Boxes,
  Database,
  FileText,
  History,
  LayoutGrid,
  Route,
  Search,
  Server,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { ROUTES, tenantPath } from "./navigationModel";
import { useTenant } from "./tenant";
import { Mono, shortId } from "./ui";

type Command = {
  id: string;
  label: string;
  hint: string;
  group: "Navigate" | "Entities" | "Types" | "Flows";
  icon: ReactNode;
  to: string;
  keywords?: string;
};

const ICON = "h-4 w-4";

const NAV_COMMANDS: Command[] = [
  {
    id: "nav:overview",
    label: "Overview",
    hint: "Workspace dashboard",
    group: "Navigate",
    icon: <LayoutGrid className={ICON} />,
    to: "/",
    keywords: "dashboard home",
  },
  {
    id: "nav:entities",
    label: "Entities",
    hint: "Browse typed data",
    group: "Navigate",
    icon: <Boxes className={ICON} />,
    to: "/entities",
    keywords: "data records objects",
  },
  {
    id: "nav:compliance",
    label: "Compliance",
    hint: "Obligations and dry-run planning",
    group: "Navigate",
    icon: <ShieldCheck className={ICON} />,
    to: "/compliance",
    keywords: "requirements obligations forms",
  },
  {
    id: "nav:flows",
    label: "Flows",
    hint: "Definitions and runs",
    group: "Navigate",
    icon: <Workflow className={ICON} />,
    to: "/flows",
    keywords: "workflow runs dag",
  },
  {
    id: "nav:account-config",
    label: "Account Config",
    hint: "Tenant configuration, plan, apply, and export",
    group: "Navigate",
    icon: <Database className={ICON} />,
    to: ROUTES.accountConfig,
    keywords: "schema config tenant yaml json forma deploy",
  },
  {
    id: "nav:system-console",
    label: "System Console",
    hint: "System processes and engine tools",
    group: "Navigate",
    icon: <Server className={ICON} />,
    to: ROUTES.systemConsole,
    keywords: "system engine datalog raw assertions",
  },
  {
    id: "nav:transactions",
    label: "Transaction log",
    hint: "Bitemporal event history",
    group: "Navigate",
    icon: <History className={ICON} />,
    to: ROUTES.transactions,
    keywords: "history time travel events",
  },
];

function commandText(c: Command): string {
  return `${c.label} ${c.hint} ${c.group} ${c.keywords ?? ""}`.toLowerCase();
}

export default function CommandMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { selectedTenantSlug } = useTenant();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const entities = useQuery(
    api.entities.listEntities,
    open && selectedTenantSlug
      ? { tenantSlug: selectedTenantSlug, origin: "all", limit: 200 }
      : "skip",
  );
  const types = useQuery(
    api.entities.listEntityTypes,
    open && selectedTenantSlug ? { tenantSlug: selectedTenantSlug } : "skip",
  );
  const flows = useQuery(
    api.flows.listFlowDefs,
    open && selectedTenantSlug ? { tenantSlug: selectedTenantSlug } : "skip",
  );

  useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const entityCommands: Command[] = (entities ?? []).map((e) => ({
      id: `entity:${e.id}`,
      label: e.name ?? shortId(e.id),
      hint: e.id,
      group: "Entities",
      icon: <FileText className={ICON} />,
      to: tenantPath(selectedTenantSlug, `/e/${encodeURIComponent(e.id)}`),
      keywords: `${e.type} ${e.origin}`,
    }));
    const typeCommands: Command[] = (types ?? []).map((t) => ({
      id: `type:${t.type}`,
      label: t.type,
      hint: `${t.count} entities · ${t.origin}`,
      group: "Types",
      icon: <Boxes className={ICON} />,
      to: tenantPath(selectedTenantSlug, ROUTES.entities),
      keywords: `${t.origin} schema data`,
    }));
    const flowCommands: Command[] = (flows ?? []).map((f) => ({
      id: `flow:${f.name}`,
      label: f.title ?? f.name,
      hint: f.name,
      group: "Flows",
      icon: <Route className={ICON} />,
      to: tenantPath(selectedTenantSlug, ROUTES.flows),
      keywords: `${f.subjectType ?? ""} ${f.origin} workflow dag`,
    }));
    return [
      ...NAV_COMMANDS.map((command) => ({
        ...command,
        to: tenantPath(selectedTenantSlug, command.to),
      })),
      ...entityCommands,
      ...typeCommands,
      ...flowCommands,
    ];
  }, [entities, flows, selectedTenantSlug, types]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle === "") return commands.slice(0, 18);
    return commands.filter((c) => commandText(c).includes(needle)).slice(0, 18);
  }, [commands, q]);

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  if (!open) return null;

  function run(c: Command) {
    navigate(c.to);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-brand/40 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="mx-auto mt-20 w-full max-w-2xl overflow-hidden rounded-ds border border-line bg-surface shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <Search className="h-4 w-4 text-muted" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, filtered.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter" && filtered[active]) {
                e.preventDefault();
                run(filtered[active]);
              }
            }}
            placeholder="Search entities, flows, and pages"
            className="h-8 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
          />
          <kbd className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[11px] text-muted">
            esc
          </kbd>
        </div>

        <div className="max-h-[28rem] overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-muted">
              No commands match <span className="font-medium text-ink">{q}</span>.
            </p>
          ) : (
            <ul>
              {filtered.map((c, i) => (
                <li key={c.id}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => run(c)}
                    className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] ${
                      i === active ? "bg-line-soft" : "hover:bg-line-soft"
                    }`}
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-canvas text-muted">
                      {c.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">
                        {c.label}
                      </span>
                      <span className="block truncate text-[12px] text-muted">
                        {c.group} · {c.hint}
                      </span>
                    </span>
                    {c.group === "Entities" && <Mono>{shortId(c.hint)}</Mono>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
