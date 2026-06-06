import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import EntityPicker from "../EntityPicker";
import { Card, CardHeader, Button, Mono, shortId } from "../ui";

export default function Compliance() {
  const [worker, setWorker] = useState("worker:maria");
  const [busy, setBusy] = useState(false);
  const compliance = useQuery(api.compliance.workerCompliance, { worker });
  const setupStaffing = useMutation(api.appconfig.setupStaffing);
  const submitForm = useMutation(api.compliance.submitForm);

  async function bootstrap() {
    setBusy(true);
    try {
      await setupStaffing({});
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <EntityPicker
            type="Worker"
            value={worker}
            onChange={setWorker}
            placeholder="worker id"
            className="w-64"
          />
          <Button variant="primary" onClick={bootstrap} disabled={busy}>
            {busy ? "Installing…" : "Seed staffing blueprint"}
          </Button>
          <span className="ml-auto text-[13px] text-muted">
            {compliance
              ? `${compliance.open.length} open / ${compliance.required.length} required`
              : "…"}
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-[13px] text-muted">
          Obligations are derived facts: a requirement is keyed by its{" "}
          <span className="italic">scope</span> entity, so one submission satisfies
          every placement sharing that scope (reuse). Tasks are{" "}
          <Mono>requirement ∧ ¬submitted</Mono> via negation.
        </p>
      </Card>

      <Card>
        <CardHeader title="Open obligations" />
        {compliance === undefined ? (
          <p className="px-5 py-4 text-[13px] text-muted">Loading…</p>
        ) : compliance.open.length === 0 ? (
          <p className="px-5 py-4 text-[13px] font-medium text-green">
            ✓ All obligations satisfied for <Mono>{worker}</Mono>.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {compliance.open.map((o, i) => (
              <li key={i} className="px-5 py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full bg-orange-soft px-2 py-0.5 text-[11px] font-semibold uppercase text-orange-ink">
                    open
                  </span>
                  <Mono>{o.form}</Mono>
                  <span className="text-[13px] text-muted">
                    for <span className="font-medium text-ink">{shortId(o.scope)}</span>
                  </span>
                  <Button
                    variant="collect"
                    className="ml-auto"
                    onClick={() => submitForm({ worker, form: o.form, scope: o.scope })}
                  >
                    Submit {o.form}
                  </Button>
                </div>
                <div className="mt-2 pl-1 text-[12px] text-muted">
                  <span className="text-faint">because:</span>
                  <ul className="mt-1 space-y-0.5">
                    {o.because.map((b, j) => (
                      <li key={j}>
                        <Mono>{b.e}</Mono> <Mono>{b.a}</Mono> ={" "}
                        {JSON.stringify(b.v)}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Required forms" hint="by scope" />
        {compliance === undefined ? (
          <p className="px-5 py-4 text-[13px] text-muted">…</p>
        ) : compliance.required.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted">
            No requirements — seed the demo above.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-line-soft">
              {compliance.required.map((r, i) => {
                const satisfied = !compliance.open.some(
                  (o) => o.form === r.form && o.scope === r.scope,
                );
                return (
                  <tr key={i}>
                    <td className="px-5 py-2.5 font-medium text-ink">{r.form}</td>
                    <td className="px-5 py-2.5 text-muted">
                      <Mono>{shortId(r.scope)}</Mono>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {satisfied ? (
                        <span className="text-green">✓ satisfied</span>
                      ) : (
                        <span className="text-orange-ink">open</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
