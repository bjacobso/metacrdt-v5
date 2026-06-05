import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function shortId(s: string): string {
  return s.includes(":") ? s.split(":")[1] : s;
}
function val(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

const STATUS_KIND: Record<string, string> = {
  running: "kind-correction",
  waiting: "kind-retract",
  completed: "kind-assert",
  expired: "kind-tombstone",
  cancelled: "kind-tombstone",
};

/**
 * The SaaS object page: one entity, with everything computed from its type +
 * config — current state, the flows you can run on it, the actions you can take,
 * its open obligations, and its flow runs. Nothing here is per-entity wiring.
 */
export default function EntityDetail({
  id,
  onOpen,
}: {
  id: string;
  onOpen?: (id: string) => void;
}) {
  const detail = useQuery(api.entities.entityDetail, { e: id });
  const startFlow = useMutation(api.flows.startFlow);
  const runAction = useMutation(api.actions.runAction);
  const submitForm = useMutation(api.compliance.submitForm);
  const cancelFlow = useMutation(api.flows.cancelFlow);
  const [employer, setEmployer] = useState("employer:acme");
  const [busy, setBusy] = useState<string | null>(null);

  if (detail === undefined) return <p className="hint">Loading…</p>;

  const attrs = Object.entries(detail.attributes).filter(([a]) => a !== "type");

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="detail">
      <section className="panel">
        <div className="detail-head">
          <div>
            <h2>{detail.name ?? shortId(id)}</h2>
            <p className="hint">
              <code>{id}</code>
            </p>
          </div>
          <div className="chips">
            {detail.types.map((t) => (
              <span key={t} className="chip">
                {t}
              </span>
            ))}
            <span className={`chip origin-${detail.origin}`}>{detail.origin}</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>State</h2>
        {attrs.length === 0 ? (
          <p className="hint">No current facts.</p>
        ) : (
          <table>
            <tbody>
              {attrs.map(([a, vals]) => (
                <tr key={a}>
                  <td className="attr">{a}</td>
                  <td>{(vals as unknown[]).map(val).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {detail.flows.length > 0 && (
        <section className="panel">
          <h2>Run a flow</h2>
          <div className="row">
            <label className="hint">
              context.employer&nbsp;
              <input value={employer} onChange={(e) => setEmployer(e.target.value)} />
            </label>
          </div>
          <div className="cards">
            {detail.flows.map((f) => (
              <div key={f.name} className="actioncard">
                <div className="actioncard-title">
                  <strong>{f.title ?? f.name}</strong>
                  <span className="hint">
                    {f.steps.map((s) => s.type).join(" → ")}
                  </span>
                </div>
                <button
                  className="satisfy"
                  disabled={busy === `flow:${f.name}`}
                  onClick={() =>
                    run(`flow:${f.name}`, () =>
                      startFlow({
                        flowDefName: f.name,
                        subject: id,
                        context: { employer },
                      }),
                    )
                  }
                >
                  Run
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {detail.actions.length > 0 && (
        <section className="panel">
          <h2>Actions</h2>
          <div className="cards">
            {detail.actions.map((a) => (
              <div key={a.name} className="actioncard">
                <div className="actioncard-title">
                  <strong>{a.label ?? a.name}</strong>
                  <span className="hint">
                    {Object.entries(a.asserts)
                      .map(([k, v]) => `${k} = ${val(v)}`)
                      .join(", ")}
                  </span>
                </div>
                <button
                  disabled={busy === `action:${a.name}`}
                  onClick={() =>
                    run(`action:${a.name}`, () =>
                      runAction({ action: a.name, entity: id }),
                    )
                  }
                >
                  Run
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {detail.obligations.length > 0 && (
        <section className="panel">
          <h2>Obligations</h2>
          <table>
            <tbody>
              {detail.obligations
                .filter((o) => o.open)
                .map((o, i) => (
                  <tr key={i}>
                    <td className="attr">{o.form}</td>
                    <td>{shortId(o.scope)}</td>
                    <td>
                      <button
                        className="satisfy"
                        disabled={busy === `submit:${o.form}:${o.scope}`}
                        onClick={() =>
                          run(`submit:${o.form}:${o.scope}`, () =>
                            submitForm({ worker: id, form: o.form, scope: o.scope }),
                          )
                        }
                      >
                        Submit {o.form}
                      </button>
                    </td>
                  </tr>
                ))}
              {detail.obligations.every((o) => !o.open) && (
                <tr>
                  <td colSpan={3} className="ok">
                    ✓ All obligations satisfied.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      {detail.runs.length > 0 && (
        <section className="panel">
          <h2>Flow runs</h2>
          {detail.runs.map((r) => (
            <div key={r._id} className="derived">
              <div className="derived-head">
                <span className={`kind ${STATUS_KIND[r.status] ?? "kind-correction"}`}>
                  {r.status}
                </span>
                <code>{r.flowDefName}</code>
                <span className="hint"> · step: {r.step}</span>
                {r.status === "waiting" && r.form && r.scope && (
                  <span className="flow-actions">
                    <button
                      className="satisfy"
                      onClick={() =>
                        submitForm({ worker: id, form: r.form!, scope: r.scope! })
                      }
                    >
                      Submit
                    </button>
                    <button className="ghost" onClick={() => cancelFlow({ runId: r._id })}>
                      Cancel
                    </button>
                  </span>
                )}
              </div>
              {r.status === "waiting" && r.token && (
                <div className="collect-link">
                  <span className="hint">collection link:</span>{" "}
                  <a href={`/collect?token=${r.token}`} target="_blank" rel="noreferrer">
                    /collect?token={r.token.slice(0, 8)}…
                  </a>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Reference any related entity ids found in the state, for navigation. */}
      {onOpen && (
        <section className="panel">
          <h2>Linked entities</h2>
          <div className="chips">
            {[...new Set(
              attrs
                .flatMap(([, vals]) => vals as unknown[])
                .filter((v): v is string => typeof v === "string" && v.includes(":")),
            )].map((ref) => (
              <button key={ref} className="chip linkchip" onClick={() => onOpen(ref)}>
                {ref}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
