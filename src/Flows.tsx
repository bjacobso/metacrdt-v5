import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import EntityPicker from "./EntityPicker";

function shortId(s: string): string {
  return s.includes(":") ? s.split(":")[1] : s;
}
function fmt(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

const STATUS_KIND: Record<string, string> = {
  running: "kind-correction",
  waiting: "kind-retract",
  completed: "kind-assert",
  expired: "kind-tombstone",
  cancelled: "kind-tombstone",
};

const I9_FIELDS = [
  { name: "ssn", label: "SSN", type: "string" as const, required: true },
  {
    name: "citizenship",
    label: "Citizenship",
    type: "select" as const,
    options: ["citizen", "permanent_resident", "authorized_alien"],
    required: true,
  },
];

function StepGraph({ steps }: { steps: { id: string; type: string }[] }) {
  return (
    <div className="dag">
      {steps.map((s, i) => (
        <span key={s.id}>
          <span className={`dagstep dag-${s.type}`}>
            {s.id}
            <small>{s.type}</small>
          </span>
          {i < steps.length - 1 ? <span className="dagarrow">→</span> : null}
        </span>
      ))}
    </div>
  );
}

export default function Flows() {
  const [subject, setSubject] = useState("worker:maria");
  const [filter, setFilter] = useState(""); // empty = all subjects
  const flows = useQuery(api.flows.listFlows, filter ? { subject: filter } : {});
  const defs = useQuery(api.flows.listFlowDefs, {});

  const issueAll = useMutation(api.flows.issueAllOpen);
  const submitForm = useMutation(api.compliance.submitForm);
  const cancelFlow = useMutation(api.flows.cancelFlow);
  const setupDemoFlow = useMutation(api.flows.setupDemoFlow);
  const defineForm = useMutation(api.forms.defineForm);
  const startFlow = useMutation(api.flows.startFlow);

  async function startOnboarding() {
    await setupDemoFlow({});
    await defineForm({ form: "i9", title: "Form I-9", fields: I9_FIELDS });
    await startFlow({
      flowDefName: "onboarding",
      subject,
      context: { employer: "employer:acme" },
    });
  }

  return (
    <div className="flows">
      <section className="panel">
        <h2>Start a flow</h2>
        <div className="row">
          <EntityPicker type="Worker" value={subject} onChange={setSubject} placeholder="subject (worker)" />
          <button onClick={() => issueAll({ subject })}>Issue collect flows for open obligations</button>
          <button onClick={startOnboarding}>Start onboarding DAG</button>
        </div>
        <p className="hint">
          <strong>collect</strong> = issue → park (<em>waiting</em>) → resume on the
          matching submission fact → complete. A <strong>DAG</strong> chains steps;
          parking steps resume via the event path, scheduler ticks, or an action callback.
        </p>
      </section>

      <section className="panel">
        <h2>Flow definitions <span className="hint">{defs ? `(${defs.length})` : ""}</span></h2>
        {defs === undefined ? (
          <p className="hint">Loading…</p>
        ) : defs.length === 0 ? (
          <p className="hint">None yet — click “Start onboarding DAG” to install one.</p>
        ) : (
          defs.map((d) => (
            <div key={d._id} className="derived">
              <div className="derived-head">
                <code>{d.name}</code>
                {d.title ? <span className="hint"> · {d.title}</span> : null}
                <button
                  className="satisfy"
                  onClick={() =>
                    startFlow({
                      flowDefName: d.name,
                      subject,
                      context: { employer: "employer:acme" },
                    })
                  }
                >
                  Start for {shortId(subject)}
                </button>
              </div>
              <StepGraph steps={d.steps} />
            </div>
          ))
        )}
      </section>

      <section className="panel">
        <div className="tableHead">
          <h2>Runs</h2>
          <span className="hint">{flows ? `${flows.length}` : "…"}</span>
        </div>
        <div className="row">
          <EntityPicker value={filter} onChange={setFilter} placeholder="filter by subject (blank = all)" />
          {filter && <button className="ghost" onClick={() => setFilter("")}>Show all</button>}
        </div>
        {flows === undefined ? (
          <p className="hint">Loading…</p>
        ) : flows.length === 0 ? (
          <p className="hint">No flows{filter ? ` for ${shortId(filter)}` : " yet"}.</p>
        ) : (
          flows.map((f) => (
            <div key={f._id} className="derived">
              <div className="derived-head">
                <span className={`kind ${STATUS_KIND[f.status] ?? "kind-correction"}`}>
                  {f.status}
                </span>
                <strong>{shortId(f.subject)}</strong>
                {f.flowDefName ? (
                  <span className="hint">
                    · <code>{f.flowDefName}</code> · step: {f.currentStepId ?? f.step}
                  </span>
                ) : (
                  <span className="hint">
                    · <code>{f.form}</code> for {shortId(f.scope ?? "")} · step: {f.step}
                  </span>
                )}
                {f.status === "waiting" && f.form && f.scope && (
                  <span className="flow-actions">
                    <button
                      className="satisfy"
                      onClick={() => submitForm({ worker: f.subject, form: f.form!, scope: f.scope! })}
                    >
                      Submit
                    </button>
                    <button className="ghost" onClick={() => cancelFlow({ runId: f._id })}>
                      Cancel
                    </button>
                  </span>
                )}
              </div>
              {f.status === "waiting" && f.token && (
                <div className="collect-link">
                  <span className="hint">collection link:</span>{" "}
                  <a href={`/collect?token=${f.token}`} target="_blank" rel="noreferrer">
                    /collect?token={f.token.slice(0, 8)}…
                  </a>
                </div>
              )}
              <ol className="flowtimeline">
                {[...f.events].reverse().map((e, i) => (
                  <li key={i}>
                    <span className="hint">{fmt(e.ts)}</span>{" "}
                    <span
                      className={`kind kind-${
                        e.kind === "completed" || e.kind === "submitted"
                          ? "assert"
                          : e.kind === "expired" || e.kind === "cancelled"
                            ? "tombstone"
                            : "correction"
                      }`}
                    >
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
