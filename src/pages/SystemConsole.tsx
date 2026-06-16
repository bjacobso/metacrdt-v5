import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Clock, Zap } from "lucide-react";
import EntityPicker from "../EntityPicker";
import { Card, CardHeader, Button, Chip, Input, Mono } from "../ui";
import { useWriteGate } from "../auth";
import { useTenant } from "../tenant";

function coerce(raw: string): unknown {
  const t = raw.trim();
  if (t === "") return "";
  try {
    return JSON.parse(t);
  } catch {
    return raw;
  }
}

function showValue(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

const DEFAULT_QUERY = JSON.stringify(
  {
    where: [
      ["?e", "type", "Worker"],
      ["?e", "name", "?name"],
      { compute: ["lower", "?name"], as: "?lowerName" },
      { compute: ["contains", "?lowerName", "maria"] },
      {
        or: [
          [["?e", "worker.status", "active"]],
          [["?e", "worker.status", "pending"]],
        ],
      },
      { not: ["?e", "worker.status", "terminated"] },
    ],
    select: ["?e", "?name"],
  },
  null,
  2,
);

function DatalogConsole({ tenantSlug }: { tenantSlug: string | null }) {
  const [text, setText] = useState(DEFAULT_QUERY);
  const [args, setArgs] = useState<{ where: unknown[]; select: string[] } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const result = useQuery(
    api.datalog.datalog,
    args && tenantSlug ? { ...args, tenantSlug } : "skip",
  );

  function runQuery() {
    try {
      const parsed = JSON.parse(text);
      setError(null);
      setArgs({ where: parsed.where, select: parsed.select });
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <div className="p-5">
      <textarea
        value={text}
        onChange={(x) => setText(x.target.value)}
        rows={7}
        className="w-full rounded-md border border-line bg-canvas p-3 font-mono text-[12px] text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-line"
      />
      <div className="mt-2">
        <Button variant="primary" onClick={runQuery}>
          Run query
        </Button>
      </div>
      {error && (
        <pre className="mt-2 rounded-md bg-red-soft p-2 text-[12px] text-red-ink">{error}</pre>
      )}
      {args && result !== undefined && (
        <pre className="mt-2 overflow-auto rounded-md bg-canvas p-3 font-mono text-[12px] text-ink-2">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}

function AssertConsole({ tenantSlug }: { tenantSlug: string | null }) {
  const assertFact = useMutation(api.facts.assertFact);
  const [e, setE] = useState("worker:maria");
  const [a, setA] = useState("worker.status");
  const [value, setValue] = useState("active");
  const [busy, setBusy] = useState(false);
  const { guardWrite } = useWriteGate();

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (!tenantSlug) return;
    setBusy(true);
    try {
      await guardWrite("Assert raw fact", () =>
        assertFact({ e, a, value: coerce(value), tenantSlug }),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2 p-5">
      <EntityPicker
        tenantSlug={tenantSlug}
        value={e}
        onChange={setE}
        placeholder="entity"
        className="w-48"
      />
      <Input value={a} onChange={(x) => setA(x.target.value)} placeholder="attribute" className="w-44" />
      <Input value={value} onChange={(x) => setValue(x.target.value)} placeholder="value (JSON or text)" className="w-48" />
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? "…" : "Assert"}
      </Button>
    </form>
  );
}

export default function SystemConsole() {
  const { selectedTenantSlug } = useTenant();
  const procs = useQuery(api.system.listSystemProcesses, {});
  const sysEntities = useQuery(
    api.entities.listEntities,
    selectedTenantSlug
      ? { tenantSlug: selectedTenantSlug, origin: "system" }
      : "skip",
  );
  const actions = useQuery(
    api.actions.listActions,
    selectedTenantSlug ? { tenantSlug: selectedTenantSlug } : "skip",
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="System processes" hint="intrinsic / autonomic" />
        <p className="px-5 pt-3 text-[13px] text-muted">
          These run on crons and the fact-change event path — not tenant-authored
          flows. They keep projections and obligations consistent.
        </p>
        <div className="grid grid-cols-1 gap-4 p-5 lg:grid-cols-2">
          {procs === undefined ? (
            <p className="text-[13px] text-muted">Loading…</p>
          ) : (
            procs.map((p) => (
              <div key={p.name} className="rounded-ds border border-line p-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{p.title}</span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      p.kind === "cron"
                        ? "bg-orange-soft text-orange-ink"
                        : "bg-blue-soft text-blue-ink"
                    }`}
                  >
                    {p.kind === "cron" ? (
                      <Clock className="h-3 w-3" />
                    ) : (
                      <Zap className="h-3 w-3" />
                    )}
                    {p.kind}
                  </span>
                  <span className="text-[12px] text-muted">{p.schedule}</span>
                </div>
                <p className="mt-1.5 text-[12px] text-muted">{p.description}</p>
                <p className="mt-1 text-[12px] text-muted">
                  trigger: <Mono>{p.trigger}</Mono>
                </p>
                <div className="mt-2 flex gap-5">
                  {p.stats.map((s) => (
                    <span key={s.label} className="text-[12px] text-muted">
                      <span className="tnum font-semibold text-ink">{s.value}</span>{" "}
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Action registry" />
        {actions === undefined ? (
          <p className="px-5 py-4 text-[13px] text-muted">Loading…</p>
        ) : actions.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted">No actions defined.</p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 pb-2 pt-3 font-semibold">action</th>
                <th className="px-2 pb-2 pt-3 font-semibold">applies to</th>
                <th className="px-2 pb-2 pt-3 font-semibold">inputs</th>
                <th className="px-2 pb-2 pt-3 font-semibold">opens</th>
                <th className="px-5 pb-2 pt-3 font-semibold">asserts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {actions.map((a) => (
                <tr key={a.name}>
                  <td className="px-5 py-2.5 font-medium text-ink">{a.label ?? a.name}</td>
                  <td className="px-2 py-2.5">
                    <Chip tone="brand">{a.appliesTo}</Chip>
                  </td>
                  <td className="px-2 py-2.5 text-[12px] text-muted">
                    {a.fields.length === 0
                      ? "—"
                      : a.fields.map((f) => `${f.name}:${f.type}`).join(", ")}
                  </td>
                  <td className="px-2 py-2.5 text-[12px] text-muted">
                    {a.opensForm
                      ? `${String(a.opensForm.form)} @ ${String(a.opensForm.scope)}`
                      : "—"}
                  </td>
                  <td className="px-5 py-2.5 text-[12px] text-muted">
                    {Object.entries(a.asserts)
                      .map(([k, v]) => `${k} = ${showValue(v)}`)
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="System entities"
          hint="schema-as-facts"
          right={<span className="text-xs text-muted">{sysEntities ? `${sysEntities.length}` : "…"}</span>}
        />
        {sysEntities === undefined ? (
          <p className="px-5 py-4 text-[13px] text-muted">Loading…</p>
        ) : (
          <ul className="max-h-72 divide-y divide-line-soft overflow-y-auto">
            {sysEntities.map((e) => (
              <li key={e.id} className="flex items-center justify-between px-5 py-2">
                <span className="flex items-center gap-3 text-[13px]">
                  <span className="text-ink">{e.name ?? e.id}</span>
                  <Mono>{e.id}</Mono>
                </span>
                <Chip tone="system">{e.type}</Chip>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Engine console" hint="advanced — assert + Datalog" />
        <AssertConsole tenantSlug={selectedTenantSlug} />
        <div className="border-t border-line-soft" />
        <DatalogConsole tenantSlug={selectedTenantSlug} />
      </Card>
    </div>
  );
}
