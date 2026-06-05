import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import EntityPicker from "./EntityPicker";

function shortId(s: string): string {
  return s.includes(":") ? s.split(":")[1] : s;
}

export default function Compliance() {
  const [worker, setWorker] = useState("worker:maria");
  const [busy, setBusy] = useState(false);
  const compliance = useQuery(api.compliance.workerCompliance, { worker });
  const setupRules = useMutation(api.compliance.setupComplianceRules);
  const seed = useMutation(api.compliance.seedStaffingDemo);
  const submitForm = useMutation(api.compliance.submitForm);

  async function bootstrap() {
    setBusy(true);
    try {
      await setupRules({});
      await seed({});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="compliance">
      <section className="panel">
        <h2>Worker compliance</h2>
        <div className="row">
          <EntityPicker type="Worker" value={worker} onChange={setWorker} placeholder="worker id" />
          <button onClick={bootstrap} disabled={busy}>
            {busy ? "…" : "Seed demo + rules"}
          </button>
        </div>
        <p className="hint">
          Obligations are derived facts: a requirement is keyed by its <em>scope</em>
          entity, so one submission satisfies every placement sharing that scope
          (reuse). Tasks are <code>requirement ∧ ¬submitted</code> via negation.
        </p>
      </section>

      <section className="panel">
        <div className="tableHead">
          <h2>Open obligations</h2>
          <span className="hint">
            {compliance ? `${compliance.open.length} open / ${compliance.required.length} required` : "…"}
          </span>
        </div>
        {compliance === undefined ? (
          <p className="hint">Loading…</p>
        ) : compliance.open.length === 0 ? (
          <p className="hint">✓ All obligations satisfied for <code>{worker}</code>.</p>
        ) : (
          compliance.open.map((o, i) => (
            <div key={i} className="derived">
              <div className="derived-head">
                <span className="kind kind-tombstone">open</span>
                <code>{o.form}</code> for <strong>{shortId(o.scope)}</strong>
                <button
                  className="satisfy"
                  onClick={() => submitForm({ worker, form: o.form, scope: o.scope })}
                >
                  Submit {o.form}
                </button>
              </div>
              <div className="because">
                <span className="hint">because:</span>
                <ul>
                  {o.because.map((b, j) => (
                    <li key={j}>
                      <code>{b.e}</code> <code>{b.a}</code> = {JSON.stringify(b.v)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))
        )}
      </section>

      <section className="panel">
        <h2>Required forms <span className="hint">(by scope)</span></h2>
        {compliance === undefined ? (
          <p className="hint">…</p>
        ) : compliance.required.length === 0 ? (
          <p className="hint">No requirements — seed the demo above.</p>
        ) : (
          <table>
            <tbody>
              {compliance.required.map((r, i) => {
                const satisfied = !compliance.open.some(
                  (o) => o.form === r.form && o.scope === r.scope,
                );
                return (
                  <tr key={i}>
                    <td className="attr">{r.form}</td>
                    <td>{shortId(r.scope)}</td>
                    <td className={satisfied ? "ok" : "hint"}>
                      {satisfied ? "✓ satisfied" : "open"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
