import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

// datetime-local string ("YYYY-MM-DDTHH:mm") → epoch ms, or undefined if empty.
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

export default function TimeTravel() {
  const [e, setE] = useState("emp:1");
  const [txStr, setTxStr] = useState("");
  const [vtStr, setVtStr] = useState("");
  const [includeRetracted, setIncludeRetracted] = useState(false);
  const [includeTombstoned, setIncludeTombstoned] = useState(false);

  const txTime = toMs(txStr);
  const validTime = toMs(vtStr);

  const asOf = useQuery(api.facts.entityFactsAsOf, {
    e,
    txTime,
    validTime,
    includeRetracted,
    includeTombstoned,
  });
  const timeline = useQuery(api.facts.entityTimeline, { e, limit: 50 });

  return (
    <div className="timetravel">
      <section className="panel">
        <h2>Coordinate</h2>
        <div className="row">
          <input value={e} onChange={(x) => setE(x.target.value)} placeholder="entity id" />
        </div>
        <div className="coords">
          <label>
            <span>Transaction time <span className="hint">(when we knew it)</span></span>
            <input type="datetime-local" value={txStr} onChange={(x) => setTxStr(x.target.value)} />
          </label>
          <label>
            <span>Valid time <span className="hint">(when it was true)</span></span>
            <input type="datetime-local" value={vtStr} onChange={(x) => setVtStr(x.target.value)} />
          </label>
        </div>
        <div className="row">
          <button onClick={() => { setTxStr(""); setVtStr(""); }}>Now</button>
          <label className="check"><input type="checkbox" checked={includeRetracted} onChange={(x) => setIncludeRetracted(x.target.checked)} /> retracted</label>
          <label className="check"><input type="checkbox" checked={includeTombstoned} onChange={(x) => setIncludeTombstoned(x.target.checked)} /> tombstoned</label>
        </div>
        <p className="hint">
          Resolved coordinate: tx={fmt(asOf?.coord.txTime)}, valid={fmt(asOf?.coord.validTime)}.
          Empty = now. Set tx-time to the past to see what was believed then.
        </p>
      </section>

      <section className="panel">
        <h2>State as of coordinate — with provenance</h2>
        {asOf === undefined ? (
          <p className="hint">Loading…</p>
        ) : asOf.facts.length === 0 ? (
          <p className="hint">No facts visible for <code>{e}</code> at this coordinate.</p>
        ) : (
          <div className="tableWrap">
            <table>
              <thead>
                <tr>
                  <th>attribute</th>
                  <th>value</th>
                  <th>valid</th>
                  <th>asserted by</th>
                </tr>
              </thead>
              <tbody>
                {asOf.facts.map((f, i) => (
                  <tr key={i} className={f.tombstonedAt ? "tomb" : f.retractedAt ? "retr" : ""}>
                    <td className="attr">{f.a}</td>
                    <td>{val(f.v)}</td>
                    <td className="hint">{fmt(f.validFrom)} → {f.validTo ? fmt(f.validTo) : "∞"}</td>
                    <td className="hint">{f.actor} @ {fmt(f.txTime)}{f.reason ? ` — ${f.reason}` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Timeline <span className="hint">(every event, newest first)</span></h2>
        {timeline === undefined ? (
          <p className="hint">Loading…</p>
        ) : timeline.length === 0 ? (
          <p className="hint">No history.</p>
        ) : (
          <ul className="timeline">
            {timeline.map((ev, i) => (
              <li key={i}>
                <span className={`kind kind-${ev.kind}`}>{ev.kind}</span>
                <code>{ev.a}</code> = {val(ev.v)}
                <span className="hint"> — {fmt(ev.txTime)} by {ev.actor}{ev.reason ? ` (${ev.reason})` : ""}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
