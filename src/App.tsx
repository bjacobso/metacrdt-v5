import { FormEvent, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useDeploymentUpdates } from "@convex-dev/static-hosting/react";
import { api } from "../convex/_generated/api";
import EntitiesBrowser from "./EntitiesBrowser";
import TimeTravel from "./TimeTravel";

// Coerce a string from the value input into a Convex value: JSON if it parses
// (numbers, booleans, null, objects), otherwise the raw string.
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
        <input value={e} onChange={(x) => setE(x.target.value)} placeholder="entity" />
        <input value={a} onChange={(x) => setA(x.target.value)} placeholder="attribute" />
        <input value={value} onChange={(x) => setValue(x.target.value)} placeholder="value (JSON or text)" />
        <button disabled={busy} type="submit">{busy ? "…" : "Assert"}</button>
      </form>
      <p className="hint">Value is parsed as JSON when possible — try <code>true</code>, <code>42</code>, or <code>"text"</code>.</p>
    </section>
  );
}

function EntityPanel() {
  const [e, setE] = useState("employee:123");
  const entity = useQuery(api.facts.getEntity, { e });

  return (
    <section className="panel">
      <h2>Entity (live)</h2>
      <div className="row">
        <input value={e} onChange={(x) => setE(x.target.value)} placeholder="entity id" />
      </div>
      {entity === undefined ? (
        <p className="hint">Loading…</p>
      ) : Object.keys(entity.attributes).length === 0 ? (
        <p className="hint">No current facts for <code>{e}</code>.</p>
      ) : (
        <table>
          <tbody>
            {Object.entries(entity.attributes).map(([attr, vals]) => (
              <tr key={attr}>
                <td className="attr">{attr}</td>
                <td>{(vals as unknown[]).map((v) => JSON.stringify(v)).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

const DEFAULT_QUERY = JSON.stringify(
  {
    where: [
      ["?e", "type", "Employee"],
      ["?e", "employee.status", "active"],
      { not: ["?e", "status", "terminated"] },
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
        Clauses: <code>[e, a, v]</code> patterns, comparisons{" "}
        <code>["?s", "&gt;", 100000]</code> (&gt; &lt; &gt;= &lt;= == !=), and{" "}
        <code>{"{ not: [e, a, v] }"}</code>. Materialized closure attributes
        (e.g. <code>reportsTo+</code>) are queryable too.
      </p>
      {error && <pre className="error">{error}</pre>}
      {args && result !== undefined && (
        <pre className="result">{JSON.stringify(result, null, 2)}</pre>
      )}
    </section>
  );
}

function ProvenancePanel() {
  const [e, setE] = useState("wtest:1");
  const explained = useQuery(api.rules.explainDerived, { e });

  return (
    <section className="panel">
      <h2>Derived facts & provenance</h2>
      <div className="row">
        <input value={e} onChange={(x) => setE(x.target.value)} placeholder="entity id" />
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
      <p className="hint">
        Every derived fact links back to the source facts that justify it
        (rule matches and closure edge-paths), with the asserting transaction.
      </p>
    </section>
  );
}

export default function App() {
  // Demonstrates the component's reactive live-reload-on-deploy.
  const { updateAvailable, reload } = useDeploymentUpdates(
    api.staticHosting.getCurrentDeployment,
  );
  const [tab, setTab] = useState<"entities" | "timetravel" | "explorer">(
    "entities",
  );

  return (
    <main>
      {updateAvailable && (
        <div className="banner">
          A new version was deployed.
          <button onClick={reload}>Reload</button>
        </div>
      )}
      <h1>Triple Store Explorer</h1>
      <p className="sub">
        A bitemporal triple store + Datalog engine on Convex, served as static
        assets via <code>@convex-dev/static-hosting</code>.
      </p>
      <nav className="tabs">
        <button
          className={tab === "entities" ? "tab active" : "tab"}
          onClick={() => setTab("entities")}
        >
          Entities
        </button>
        <button
          className={tab === "timetravel" ? "tab active" : "tab"}
          onClick={() => setTab("timetravel")}
        >
          Time travel
        </button>
        <button
          className={tab === "explorer" ? "tab active" : "tab"}
          onClick={() => setTab("explorer")}
        >
          Explorer
        </button>
      </nav>
      {tab === "entities" ? (
        <EntitiesBrowser />
      ) : tab === "timetravel" ? (
        <TimeTravel />
      ) : (
        <>
          <AssertPanel />
          <EntityPanel />
          <DatalogPanel />
          <ProvenancePanel />
        </>
      )}
    </main>
  );
}
