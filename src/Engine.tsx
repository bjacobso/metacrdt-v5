import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import EntityPicker from "./EntityPicker";
import EntitiesBrowser from "./EntitiesBrowser";

// The raw engine surface — assert arbitrary triples, run Datalog directly,
// inspect derived-fact provenance, and build ad-hoc queries. This is the
// low-level/advanced view beneath the product; it lives under the System tab.

function coerce(raw: string): unknown {
  const t = raw.trim();
  if (t === "") return "";
  try {
    return JSON.parse(t);
  } catch {
    return raw;
  }
}

function AssertPanel() {
  const assertFact = useMutation(api.facts.assertFact);
  const [e, setE] = useState("employee:123");
  const [a, setA] = useState("employee.status");
  const [value, setValue] = useState("active");
  const [busy, setBusy] = useState(false);

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    setBusy(true);
    try {
      await assertFact({ e, a, value: coerce(value) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <h2>Assert a fact</h2>
      <form onSubmit={onSubmit} className="row">
        <EntityPicker value={e} onChange={setE} placeholder="entity" />
        <input value={a} onChange={(x) => setA(x.target.value)} placeholder="attribute" />
        <input value={value} onChange={(x) => setValue(x.target.value)} placeholder="value (JSON or text)" />
        <button disabled={busy} type="submit">{busy ? "…" : "Assert"}</button>
      </form>
      <p className="hint">Value is parsed as JSON when possible — try <code>true</code>, <code>42</code>, or <code>"text"</code>.</p>
    </section>
  );
}

const DEFAULT_QUERY = JSON.stringify(
  {
    where: [
      ["?e", "type", "Worker"],
      { not: ["?e", "worker.status", "terminated"] },
    ],
    select: ["?e"],
  },
  null,
  2,
);

function DatalogPanel() {
  const [text, setText] = useState(DEFAULT_QUERY);
  const [args, setArgs] = useState<{ where: unknown[][]; select: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const result = useQuery(api.datalog.datalog, args ?? "skip");

  function run() {
    try {
      const parsed = JSON.parse(text);
      setError(null);
      setArgs({ where: parsed.where, select: parsed.select });
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <section className="panel">
      <h2>Datalog</h2>
      <textarea value={text} onChange={(x) => setText(x.target.value)} rows={8} />
      <div className="row">
        <button onClick={run}>Run query</button>
      </div>
      <p className="hint">
        Clauses: <code>[e, a, v]</code> patterns, comparisons, and{" "}
        <code>{"{ not: [e, a, v] }"}</code>. Materialized closure attributes are queryable too.
      </p>
      {error && <pre className="error">{error}</pre>}
      {args && result !== undefined && (
        <pre className="result">{JSON.stringify(result, null, 2)}</pre>
      )}
    </section>
  );
}

function ProvenancePanel() {
  const [e, setE] = useState("worker:maria");
  const explained = useQuery(api.rules.explainDerived, { e });

  return (
    <section className="panel">
      <h2>Derived facts & provenance</h2>
      <div className="row">
        <EntityPicker value={e} onChange={setE} placeholder="entity id" />
      </div>
      {explained === undefined ? (
        <p className="hint">Loading…</p>
      ) : explained.length === 0 ? (
        <p className="hint">No derived facts for <code>{e}</code>.</p>
      ) : (
        explained.map((d, i) => (
          <div key={i} className="derived">
            <div className="derived-head">
              <code>{d.a}</code> = <strong>{JSON.stringify(d.v)}</strong>
            </div>
            <div className="because">
              <span className="hint">because:</span>
              <ul>
                {d.because.map((b, j) => (
                  <li key={j}>
                    <code>{b.e}</code> <code>{b.a}</code> = {JSON.stringify(b.v)}
                    {b.actor ? <span className="hint"> — {b.actor}{b.reason ? `: ${b.reason}` : ""}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))
      )}
    </section>
  );
}

export default function Engine() {
  const [advanced, setAdvanced] = useState(false);
  return (
    <div className="engine">
      <AssertPanel />
      <DatalogPanel />
      <ProvenancePanel />
      <section className="panel">
        <h2>
          <button className="disclosure" onClick={() => setAdvanced((a) => !a)}>
            {advanced ? "▾" : "▸"} Query builder (entities-as-table)
          </button>
        </h2>
      </section>
      {advanced && <EntitiesBrowser />}
    </div>
  );
}
