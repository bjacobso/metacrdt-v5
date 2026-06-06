import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import EntityPicker from "../EntityPicker";
import { Card, CardHeader, Button, Mono } from "../ui";

function toMs(s: string): number | undefined {
  if (!s) return undefined;
  const ms = Date.parse(s);
  return Number.isNaN(ms) ? undefined : ms;
}
function fmt(ms: number | undefined): string {
  return ms === undefined ? "—" : new Date(ms).toLocaleString();
}
function val(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

const KIND_TONE: Record<string, string> = {
  assert: "bg-green-soft text-green",
  retract: "bg-orange-soft text-orange-ink",
  tombstone: "bg-red-soft text-red-ink",
  correction: "bg-blue-soft text-blue-ink",
  untombstone: "bg-green-soft text-green",
};

export default function TransactionLog() {
  const [e, setE] = useState("worker:maria");
  const [txStr, setTxStr] = useState("");
  const [vtStr, setVtStr] = useState("");
  const [includeRetracted, setIncludeRetracted] = useState(false);
  const [includeTombstoned, setIncludeTombstoned] = useState(false);

  const asOf = useQuery(api.facts.entityFactsAsOf, {
    e,
    txTime: toMs(txStr),
    validTime: toMs(vtStr),
    includeRetracted,
    includeTombstoned,
  });
  const timeline = useQuery(api.facts.entityTimeline, { e, limit: 50 });

  return (
    <div className="space-y-6">
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <EntityPicker value={e} onChange={setE} placeholder="entity id" className="w-64" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-[13px]">
            <span className="text-ink-2">
              Transaction time{" "}
              <span className="text-faint">(when we knew it)</span>
            </span>
            <input
              type="datetime-local"
              value={txStr}
              onChange={(x) => setTxStr(x.target.value)}
              className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-1.5 text-[13px]"
            />
          </label>
          <label className="text-[13px]">
            <span className="text-ink-2">
              Valid time <span className="text-faint">(when it was true)</span>
            </span>
            <input
              type="datetime-local"
              value={vtStr}
              onChange={(x) => setVtStr(x.target.value)}
              className="mt-1 block w-full rounded-md border border-line bg-surface px-3 py-1.5 text-[13px]"
            />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[13px]">
          <Button variant="ghost" onClick={() => { setTxStr(""); setVtStr(""); }}>
            Now
          </Button>
          <label className="flex items-center gap-1.5 text-ink-2">
            <input type="checkbox" checked={includeRetracted} onChange={(x) => setIncludeRetracted(x.target.checked)} />
            retracted
          </label>
          <label className="flex items-center gap-1.5 text-ink-2">
            <input type="checkbox" checked={includeTombstoned} onChange={(x) => setIncludeTombstoned(x.target.checked)} />
            tombstoned
          </label>
        </div>
        <p className="mt-2 text-[12px] text-muted">
          Resolved coordinate: tx={fmt(asOf?.coord.txTime)}, valid={fmt(asOf?.coord.validTime)}. Empty = now.
        </p>
      </Card>

      <Card>
        <CardHeader title="State as of coordinate" hint="with provenance" />
        {asOf === undefined ? (
          <p className="px-5 py-4 text-[13px] text-muted">Loading…</p>
        ) : asOf.facts.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted">
            No facts visible for <Mono>{e}</Mono> at this coordinate.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-5 pb-2 pt-3 font-semibold">attribute</th>
                <th className="px-2 pb-2 pt-3 font-semibold">value</th>
                <th className="px-2 pb-2 pt-3 font-semibold">valid</th>
                <th className="px-5 pb-2 pt-3 font-semibold">asserted by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {asOf.facts.map((f, i) => (
                <tr
                  key={i}
                  className={f.tombstonedAt ? "opacity-50 line-through" : f.retractedAt ? "opacity-60" : ""}
                >
                  <td className="px-5 py-2 font-medium text-ink-2">{f.a}</td>
                  <td className="px-2 py-2 text-ink">{val(f.v)}</td>
                  <td className="px-2 py-2 text-[12px] text-muted">
                    {fmt(f.validFrom)} → {f.validTo ? fmt(f.validTo) : "∞"}
                  </td>
                  <td className="px-5 py-2 text-[12px] text-muted">
                    {f.actor} @ {fmt(f.txTime)}
                    {f.reason ? ` — ${f.reason}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <CardHeader title="Timeline" hint="every event, newest first" />
        {timeline === undefined ? (
          <p className="px-5 py-4 text-[13px] text-muted">Loading…</p>
        ) : timeline.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted">No history.</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {timeline.map((ev, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-[13px]">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ${KIND_TONE[ev.kind] ?? "bg-line-soft text-muted"}`}
                >
                  {ev.kind}
                </span>
                <Mono>{ev.a}</Mono>
                <span className="text-ink">= {val(ev.v)}</span>
                <span className="text-[12px] text-muted">
                  — {fmt(ev.txTime)} by {ev.actor}
                  {ev.reason ? ` (${ev.reason})` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
