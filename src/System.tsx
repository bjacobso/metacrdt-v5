import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import Engine from "./Engine";

/**
 * The intrinsic side of the platform: the reactive processes you don't
 * configure (the reconciler, materializers, the flow resumer), the system
 * entities that are the engine's own schema-as-facts, the action registry, and
 * the raw engine surface — all the machinery the product runs *for* you.
 */
export default function System() {
  const procs = useQuery(api.system.listSystemProcesses, {});
  const sysEntities = useQuery(api.entities.listEntities, { origin: "system" });
  const actions = useQuery(api.actions.listActions, {});
  const [showEngine, setShowEngine] = useState(false);

  return (
    <div className="system">
      <section className="panel">
        <h2>System processes <span className="hint">(intrinsic / autonomic)</span></h2>
        <p className="hint">
          These run on crons and the fact-change event path — not tenant-authored
          flows. You can’t start or edit them; they keep projections and
          obligations consistent.
        </p>
        <div className="cards">
          {procs === undefined ? (
            <p className="hint">Loading…</p>
          ) : (
            procs.map((p) => (
              <div key={p.name} className="proccard">
                <div className="derived-head">
                  <strong>{p.title}</strong>
                  <span className={`chip kind-${p.kind === "cron" ? "retract" : "correction"}`}>
                    {p.kind}
                  </span>
                  <span className="hint">{p.schedule}</span>
                </div>
                <p className="hint">{p.description}</p>
                <p className="hint">
                  trigger: <code>{p.trigger}</code>
                </p>
                <div className="statrow">
                  {p.stats.map((s) => (
                    <span key={s.label} className="stat">
                      <strong>{s.value}</strong> {s.label}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Action registry</h2>
        {actions === undefined ? (
          <p className="hint">Loading…</p>
        ) : actions.length === 0 ? (
          <p className="hint">No actions defined.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>action</th>
                <th>applies to</th>
                <th>asserts</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.name}>
                  <td className="attr">{a.label ?? a.name}</td>
                  <td>{a.appliesTo}</td>
                  <td className="hint">
                    {Object.entries(a.asserts)
                      .map(([k, v]) => `${k} = ${typeof v === "string" ? v : JSON.stringify(v)}`)
                      .join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <div className="tableHead">
          <h2>System entities <span className="hint">(schema-as-facts)</span></h2>
          <span className="hint">{sysEntities ? `${sysEntities.length}` : "…"}</span>
        </div>
        {sysEntities === undefined ? (
          <p className="hint">Loading…</p>
        ) : sysEntities.length === 0 ? (
          <p className="hint">None.</p>
        ) : (
          <table>
            <tbody>
              {sysEntities.map((e) => (
                <tr key={e.id}>
                  <td className="attr">{e.name ?? e.id}</td>
                  <td className="hint">{e.id}</td>
                  <td>
                    <span className="chip">{e.type}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>
          <button className="disclosure" onClick={() => setShowEngine((s) => !s)}>
            {showEngine ? "▾" : "▸"} Engine (advanced)
          </button>
        </h2>
        <p className="hint">
          Assert raw triples, run Datalog directly, and inspect provenance.
        </p>
      </section>
      {showEngine && <Engine />}
    </div>
  );
}
