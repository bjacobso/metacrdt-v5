import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

function shortId(s: string): string {
  return s.includes(":") ? s.split(":")[1] : s;
}
function fmt(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

const STATUS_KIND: Record<string, string> = {
  waiting: "kind-retract",
  completed: "kind-assert",
  expired: "kind-tombstone",
  cancelled: "kind-tombstone",
};

export default function Flows() {
  const [subject, setSubject] = useState("worker:maria");
  const flows = useQuery(api.flows.listFlows, { subject });
  const issueAll = useMutation(api.flows.issueAllOpen);
  const submitForm = useMutation(api.compliance.submitForm);
  const cancelFlow = useMutation(api.flows.cancelFlow);

  return (
    <div className="flows">
      <section className="panel">
        <h2>Collect flows</h2>
        <div className="row">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="subject id" />
          <button onClick={() => issueAll({ subject })}>Issue flows for open obligations</button>
        </div>
        <p className="hint">
          A durable <code>collect</code> step: issue → park (<em>waiting</em>) → resume
          when the matching submission fact arrives → complete. Reminder/escalation
          are scheduler timer ticks (~10s/30s here). All reactive — watch runs advance live.
        </p>
      </section>

      <section className="panel">
        <div className="tableHead">
          <h2>Runs</h2>
          <span className="hint">{flows ? `${flows.length}` : "…"}</span>
        </div>
        {flows === undefined ? (
          <p className="hint">Loading…</p>
        ) : flows.length === 0 ? (
          <p className="hint">No flows yet — issue some above.</p>
        ) : (
          flows.map((f) => (
            <div key={f._id} className="derived">
              <div className="derived-head">
                <span className={`kind ${STATUS_KIND[f.status] ?? "kind-correction"}`}>
                  {f.status}
                </span>
                <code>{f.form}</code> for <strong>{shortId(f.scope)}</strong>
                <span className="hint">· step: {f.step}</span>
                {f.status === "waiting" && (
                  <span className="flow-actions">
                    <button
                      className="satisfy"
                      onClick={() => submitForm({ worker: subject, form: f.form, scope: f.scope })}
                    >
                      Submit
                    </button>
                    <button className="ghost" onClick={() => cancelFlow({ runId: f._id })}>
                      Cancel
                    </button>
                  </span>
                )}
              </div>
              <ol className="flowtimeline">
                {[...f.events].reverse().map((e, i) => (
                  <li key={i}>
                    <span className="hint">{fmt(e.ts)}</span>{" "}
                    <span className={`kind kind-${e.kind === "completed" || e.kind === "submitted" ? "assert" : e.kind === "expired" || e.kind === "cancelled" ? "tombstone" : "correction"}`}>
                      {e.kind}
                    </span>
                    {e.message ? <span className="hint"> {e.message}</span> : null}
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
