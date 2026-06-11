import { Link } from "react-router-dom";
import { useClientQuery } from "@metacrdt/client";
import {
  Boxes,
  MapPin,
  Recycle,
  CheckCircle2,
  FileText,
  GitBranch,
  PlusCircle,
  CircleSlash,
} from "lucide-react";
import { Card, CardHeader, Eyebrow, StatCard, Mono, shortId } from "../ui";

const KIND_ICON: Record<string, React.ReactNode> = {
  assert: <PlusCircle className="h-4 w-4 text-green" />,
  retract: <CircleSlash className="h-4 w-4 text-orange-ink" />,
  tombstone: <CircleSlash className="h-4 w-4 text-red-ink" />,
  correction: <GitBranch className="h-4 w-4 text-blue-ink" />,
};

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(ms).toLocaleDateString();
}

function valStr(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

export default function Overview() {
  const s = useClientQuery("overview.summary", {});
  const activity = useClientQuery("overview.recentActivity", { limit: 12 });

  const PILLARS = [
    "Fact Convergence",
    "Provenance",
    "Derived Coherence",
    "Agent Participation",
  ];

  return (
    <div className="space-y-6">
      {/* MetaCRDT research-preview hero */}
      <div className="rounded-ds border border-line bg-brand px-6 py-5 text-white">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold tracking-tight">MetaCRDT</span>
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/80">
            Research Preview
          </span>
        </div>
        <p className="mt-1.5 max-w-2xl text-[15px] text-white/80">
          A convergence substrate for structured coordination across distributed
          runtimes. This workspace is the{" "}
          <span className="font-medium text-white">datarooms</span> elaboration —
          compliance as a mergeable fact log.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PILLARS.map((p) => (
            <span
              key={p}
              className="rounded-full border border-white/15 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/80"
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      <div>
        <Eyebrow>Datarooms · Acme Staffing</Eyebrow>
        <h2 className="mt-1 text-3xl font-semibold tracking-tight text-ink">
          Overview
        </h2>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          One substrate for the whole account — types, forms, flows, obligations
          and audit are all <span className="font-medium text-ink">facts, and
          reactions over facts</span>.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Boxes className="h-4 w-4" />}
          label="Configurable types"
          value={s ? s.configuredTypes : "—"}
          caption="declared via config-as-code"
        />
        <StatCard
          icon={<MapPin className="h-4 w-4" />}
          label="Active placements"
          value={s ? s.placements : "—"}
          caption="worker × client × venue"
        />
        <StatCard
          icon={<Recycle className="h-4 w-4" />}
          label="Evidence reused"
          value={s ? s.reusedScopes : "—"}
          caption="scopes shared, not re-collected"
          tone="green"
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Obligations satisfied"
          value={s ? `${s.satisfiedPct}%` : "—"}
          caption={s ? `${s.required - s.open} of ${s.required} · ${s.open} open` : ""}
          tone="green"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Compliance at a glance"
            hint="obligations as derived facts"
            right={
              <Link
                to="/compliance"
                className="text-[13px] font-medium text-blue-ink hover:underline"
              >
                Open compliance →
              </Link>
            }
          />
          <div className="p-5">
            <ComplianceGlance />
          </div>
        </Card>

        <Card>
          <CardHeader title="Transaction log" hint="newest first" />
          <ul className="divide-y divide-line-soft">
            {activity === undefined ? (
              <li className="px-5 py-3 text-[13px] text-muted">Loading…</li>
            ) : activity.length === 0 ? (
              <li className="px-5 py-3 text-[13px] text-muted">No activity yet.</li>
            ) : (
              activity.map((a) => (
                <li key={a.txId} className="flex items-start gap-3 px-5 py-3">
                  <div className="mt-0.5">{KIND_ICON[a.kind] ?? <FileText className="h-4 w-4 text-muted" />}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-ink">
                      {a.reason ?? `${a.kind} ${a.a}`}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-muted">
                      <Mono>{shortId(a.e)}</Mono> · {a.a} = {valStr(a.v)}
                    </div>
                    <div className="mt-0.5 text-[11px] text-faint">
                      {a.actorId} · {timeAgo(a.txTime)}
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/** Compact obligations view for the demo worker. */
function ComplianceGlance() {
  const c = useClientQuery("compliance.workerCompliance", {
    worker: "worker:maria",
  });
  if (c === undefined) return <p className="text-[13px] text-muted">Loading…</p>;
  if (c.required.length === 0)
    return (
      <p className="text-[13px] text-muted">
        No requirements yet — seed the staffing blueprint from Compliance or Flows.
      </p>
    );
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
          <th className="pb-2 font-semibold">Form</th>
          <th className="pb-2 font-semibold">Scope</th>
          <th className="pb-2 font-semibold">Status</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line-soft">
        {c.required.map((r, i) => {
          const open = c.open.some((o) => o.form === r.form && o.scope === r.scope);
          return (
            <tr key={i}>
              <td className="py-2 font-medium text-ink">{r.form}</td>
              <td className="py-2 text-muted">
                <Mono>{shortId(r.scope)}</Mono>
              </td>
              <td className="py-2">
                {open ? (
                  <span className="inline-flex rounded-full bg-orange-soft px-2 py-0.5 text-[11px] font-semibold text-orange-ink">
                    collect
                  </span>
                ) : (
                  <span className="inline-flex rounded-full bg-green-soft px-2 py-0.5 text-[11px] font-semibold text-green">
                    ✓ satisfied
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
