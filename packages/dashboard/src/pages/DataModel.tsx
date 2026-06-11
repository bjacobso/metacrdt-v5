import { FormEvent, useMemo, useState } from "react";
import {
  useClientMutation,
  useClientQuery,
  useWriteGuard,
} from "@metacrdt/client";
import { ChevronDown, ChevronRight, Clock, Zap } from "lucide-react";
import EntityPicker from "../EntityPicker";
import { Card, CardHeader, Button, Chip, Input, Mono } from "../ui";

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

function DatalogConsole() {
  const [text, setText] = useState(DEFAULT_QUERY);
  const [args, setArgs] = useState<{ where: unknown[]; select: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const result = useClientQuery("datalog.datalog", args ?? "skip");

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

function AssertConsole() {
  const assertFact = useClientMutation("facts.assertFact");
  const [e, setE] = useState("worker:maria");
  const [a, setA] = useState("worker.status");
  const [value, setValue] = useState("active");
  const [busy, setBusy] = useState(false);
  const guardWrite = useWriteGuard();

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      await guardWrite("Assert raw fact", () =>
        assertFact({ e, a, value: coerce(value) }),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2 p-5">
      <EntityPicker value={e} onChange={setE} placeholder="entity" className="w-48" />
      <Input value={a} onChange={(x) => setA(x.target.value)} placeholder="attribute" className="w-44" />
      <Input value={value} onChange={(x) => setValue(x.target.value)} placeholder="value (JSON or text)" className="w-48" />
      <Button type="submit" variant="primary" disabled={busy}>
        {busy ? "…" : "Assert"}
      </Button>
    </form>
  );
}

export default function DataModel() {
  const procs = useClientQuery("system.listSystemProcesses", {});
  const sysEntities = useClientQuery("entities.listEntities", { origin: "system" });
  const actions = useClientQuery("actions.listActions", {});
  const configHistory = useClientQuery("configHistory.history", { limit: 8 });
  const manifest = useClientQuery("configHistory.currentManifest", {});
  const manifestByKind = manifest as
    | Record<string, readonly unknown[]>
    | undefined;
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  const actionChanges = useMemo(() => {
    const out = new Map<
      string,
      NonNullable<typeof configHistory>[number]
    >();
    for (const tx of configHistory ?? []) {
      const changed = new Set(
        [...tx.added, ...tx.removed]
          .filter((item) => item.kind === "action")
          .map((item) => item.value),
      );
      for (const ev of tx.events) {
        if (ev.e.startsWith("action:")) {
          changed.add(ev.e.slice("action:".length));
        }
      }
      for (const name of changed) {
        if (!out.has(name)) out.set(name, tx);
      }
    }
    return out;
  }, [configHistory]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Config history"
          hint="applyConfig manifest diff"
          right={
            manifestByKind ? (
              <span className="text-xs text-muted">
                {Object.values(manifestByKind).reduce(
                  (n, values) => n + values.length,
                  0,
                )} owned artifacts
              </span>
            ) : (
              <span className="text-xs text-muted">…</span>
            )
          }
        />
        {manifestByKind && (
          <div className="flex flex-wrap gap-2 border-b border-line-soft px-5 py-3">
            {Object.entries(manifestByKind).map(([kind, values]) => (
              <Chip key={kind} tone={values.length > 0 ? "configured" : "system"}>
                {kind}: {values.length}
              </Chip>
            ))}
          </div>
        )}
        {configHistory === undefined ? (
          <p className="px-5 py-4 text-[13px] text-muted">Loading…</p>
        ) : configHistory.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted">
            No config-authored transactions yet.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {configHistory.map((tx) => (
              <li key={tx.txId} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <button
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted hover:bg-line-soft hover:text-ink"
                    onClick={() =>
                      setExpandedTx(expandedTx === tx.txId ? null : tx.txId)
                    }
                    aria-label={
                      expandedTx === tx.txId
                        ? "Hide config transaction events"
                        : "Show config transaction events"
                    }
                  >
                    {expandedTx === tx.txId ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                  <span className="font-medium text-ink">
                    {tx.reason ?? "config transaction"}
                  </span>
                  <Mono>{new Date(tx.txTime).toLocaleString()}</Mono>
                  {tx.changedKinds.map((kind) => (
                    <Chip key={kind} tone="configured">
                      {kind}
                    </Chip>
                  ))}
                  {tx.totalManifestChanges === 0 && (
                    <Chip tone="system">idempotent</Chip>
                  )}
                  <span className="ml-auto text-[12px] text-muted">
                    {tx.totalManifestChanges} manifest changes · {tx.events.length} events
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {tx.added.map((item) => (
                    <Chip key={`add:${item.kind}:${item.value}`} tone="configured">
                      + {item.kind}:{item.value}
                    </Chip>
                  ))}
                  {tx.removed.map((item) => (
                    <Chip key={`rm:${item.kind}:${item.value}`} tone="system">
                      - {item.kind}:{item.value}
                    </Chip>
                  ))}
                  {tx.added.length === 0 && tx.removed.length === 0 && (
                    <span className="text-[12px] text-muted">no manifest diff</span>
                  )}
                </div>
                {expandedTx === tx.txId && (
                  <div className="mt-3 rounded-ds border border-line bg-canvas">
                    <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2 text-[12px] text-muted">
                      <span>event counts</span>
                      {Object.entries(tx.eventCounts).map(([kind, count]) => (
                        <Chip key={kind} tone={kind === "assert" ? "data" : "system"}>
                          {kind}: {String(count)}
                        </Chip>
                      ))}
                    </div>
                    <div className="max-h-56 overflow-auto">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-left text-[10px] uppercase tracking-wide text-muted">
                            <th className="px-3 py-2 font-semibold">kind</th>
                            <th className="px-2 py-2 font-semibold">entity</th>
                            <th className="px-2 py-2 font-semibold">attribute</th>
                            <th className="px-3 py-2 font-semibold">value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line-soft">
                          {tx.events.map((ev, i) => (
                            <tr key={`${ev.e}:${ev.a}:${ev.kind}:${i}`}>
                              <td className="px-3 py-1.5">
                                <Chip tone={ev.kind === "assert" ? "data" : "system"}>
                                  {ev.kind}
                                </Chip>
                              </td>
                              <td className="px-2 py-1.5">
                                <Mono>{ev.e}</Mono>
                              </td>
                              <td className="px-2 py-1.5 text-muted">{ev.a}</td>
                              <td className="max-w-[28rem] truncate px-3 py-1.5 font-mono text-[11px] text-ink-2">
                                {showValue(ev.v)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

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
                <th className="px-2 pb-2 pt-3 font-semibold">last config</th>
                <th className="px-5 pb-2 pt-3 font-semibold">asserts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {actions.map((a) => {
                const changed = actionChanges.get(a.name);
                return (
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
                    <td className="px-2 py-2.5 text-[12px] text-muted">
                      {changed ? (
                        <span className="flex flex-col gap-0.5">
                          <span>{new Date(changed.txTime).toLocaleDateString()}</span>
                          <span className="text-[11px]">
                            {changed.totalManifestChanges === 0
                              ? "idempotent"
                              : `${changed.totalManifestChanges} manifest changes`}
                          </span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-2.5 text-[12px] text-muted">
                      {Object.entries(a.asserts)
                        .map(([k, v]) => `${k} = ${showValue(v)}`)
                        .join(", ")}
                    </td>
                  </tr>
                );
              })}
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
        <AssertConsole />
        <div className="border-t border-line-soft" />
        <DatalogConsole />
      </Card>
    </div>
  );
}
