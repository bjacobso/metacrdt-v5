import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import EntityPicker from "../EntityPicker";
import { Card, CardHeader, Button, Chip, StatusBadge, Mono, shortId } from "../ui";
import { useWriteGate } from "../auth";
import { useTenant } from "../tenant";
import { tenantDemoProfile } from "../tenantDemoProfile";

function fmt(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

const STEP_TONE: Record<string, string> = {
  collect: "bg-orange-soft text-orange-ink border-orange/30",
  branch: "bg-blue-soft text-blue-ink border-blue/30",
  action: "bg-blue-soft text-blue-ink border-blue/30",
  notify: "bg-line-soft text-ink-2 border-line",
  assert: "bg-green-soft text-green border-green/30",
  wait: "bg-line-soft text-muted border-line",
  done: "bg-green-soft text-green border-green/30",
};

function StepGraph({ steps }: { steps: { id: string; type: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => (
        <span key={s.id} className="flex items-center gap-1.5">
          <span
            className={`rounded-md border px-2 py-1 text-[12px] ${STEP_TONE[s.type] ?? "bg-line-soft border-line"}`}
          >
            {s.id}
            <span className="ml-1 text-[10px] opacity-70">{s.type}</span>
          </span>
          {i < steps.length - 1 && <span className="text-faint">→</span>}
        </span>
      ))}
    </div>
  );
}

export default function Flows() {
  const { selectedTenant, selectedTenantSlug } = useTenant();
  const demoProfile = tenantDemoProfile(selectedTenant?.kind);
  const isLegalTenant = demoProfile.kind === "legal";
  const installLabel = demoProfile.installLabel;
  const emptyDefsCopy = isLegalTenant
    ? "None yet - install legal workflows to define matter intake via config-as-code."
    : "None yet - install staffing blueprint to define some via config-as-code.";
  const [subject, setSubject] = useState(demoProfile.subject);
  const [filter, setFilter] = useState("");
  const flows = useQuery(
    api.flows.listFlows,
    selectedTenantSlug
      ? { tenantSlug: selectedTenantSlug, ...(filter ? { subject: filter } : {}) }
      : "skip",
  );
  const defs = useQuery(
    api.flows.listFlowDefs,
    selectedTenantSlug ? { tenantSlug: selectedTenantSlug } : "skip",
  );

  const issueAll = useMutation(api.flows.issueAllOpen);
  const submitForm = useMutation(api.compliance.submitForm);
  const cancelFlow = useMutation(api.flows.cancelFlow);
  const startFlow = useMutation(api.flows.startFlow);
  const setupStaffing = useMutation(api.appconfig.setupStaffing);
  const setupLegal = useMutation(api.appconfig.setupLegal);
  const [busy, setBusy] = useState(false);
  const { guardWrite } = useWriteGate();

  useEffect(() => {
    setSubject(demoProfile.subject);
  }, [demoProfile.subject]);

  async function installBlueprint() {
    if (!selectedTenantSlug) return;
    setBusy(true);
    try {
      await guardWrite(installLabel, () =>
        demoProfile.setupAction === "setupLegal"
          ? setupLegal({ tenantSlug: selectedTenantSlug })
          : setupStaffing({ tenantSlug: selectedTenantSlug }),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <EntityPicker
            type={demoProfile.entityType}
            tenantSlug={selectedTenantSlug}
            value={subject}
            onChange={setSubject}
            placeholder={`subject (${demoProfile.entityType.toLowerCase()})`}
            className="w-56"
          />
          {!isLegalTenant && (
            <Button
              onClick={() =>
                selectedTenantSlug
                  ? guardWrite("Issue collect flows", () =>
                      issueAll({ subject, tenantSlug: selectedTenantSlug }),
                    )
                  : undefined
              }
            >
              Issue collect flows for open obligations
            </Button>
          )}
          <Button
            variant="ghost"
            disabled={busy}
            onClick={installBlueprint}
          >
            {busy ? "Installing…" : installLabel}
          </Button>
        </div>
        <p className="mt-3 max-w-3xl text-[13px] text-muted">
          <span className="font-medium text-ink">Collect</span> steps issue and
          park until the matching submission fact arrives. DAG workflow steps can
          also branch, wait, notify, assert facts, or park for an action callback.
        </p>
      </Card>

      <Card>
        <CardHeader
          title="Flow definitions"
          hint={defs ? `${defs.length}` : ""}
        />
        {defs === undefined ? (
          <p className="px-5 py-4 text-[13px] text-muted">Loading…</p>
        ) : defs.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted">
            {emptyDefsCopy}
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {defs.map((d) => (
              <li key={d._id} className="px-5 py-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Mono>{d.name}</Mono>
                  {d.title && <span className="text-[13px] text-muted">· {d.title}</span>}
                  {d.subjectType && <Chip tone="brand">{d.subjectType}</Chip>}
                  <Chip tone="configured">{d.origin}</Chip>
                  <Button
                    className="ml-auto"
                    disabled={!selectedTenantSlug}
                    onClick={() => {
                      if (!selectedTenantSlug) return;
                      void guardWrite(`Start ${d.name}`, () =>
                        startFlow({
                          flowDefName: d.name,
                          subject,
                          context: demoProfile.flowStartContext,
                          tenantSlug: selectedTenantSlug,
                        }),
                      );
                    }}
                  >
                    Start for {shortId(subject)}
                  </Button>
                </div>
                <StepGraph steps={d.steps} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Runs"
          hint={flows ? `${flows.length}` : "…"}
          right={
            <div className="flex items-center gap-2">
              <EntityPicker
                tenantSlug={selectedTenantSlug}
                value={filter}
                onChange={setFilter}
                placeholder="filter by subject"
                className="w-48"
              />
              {filter && (
                <Button variant="ghost" onClick={() => setFilter("")}>
                  Show all
                </Button>
              )}
            </div>
          }
        />
        {flows === undefined ? (
          <p className="px-5 py-4 text-[13px] text-muted">Loading…</p>
        ) : flows.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted">
            No flows{filter ? ` for ${shortId(filter)}` : " yet"}.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {flows.map((f) => (
              <li key={f._id} className="px-5 py-4">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <StatusBadge status={f.status} />
                  <span className="font-medium text-ink">{shortId(f.subject)}</span>
                  {f.flowDefName ? (
                    <span className="text-muted">
                      · <Mono>{f.flowDefName}</Mono> · step: {f.currentStepId ?? f.step}
                    </span>
                  ) : (
                    <span className="text-muted">
                      · <Mono>{f.form}</Mono> for {shortId(f.scope ?? "")} · step:{" "}
                      {f.step}
                    </span>
                  )}
                  {f.status === "waiting" && f.form && f.scope && (
                    <span className="ml-auto flex items-center gap-2">
                      <Button
                        variant="collect"
                        disabled={!selectedTenantSlug}
                        onClick={() => {
                          if (!selectedTenantSlug) return;
                          void guardWrite(`Submit ${f.form}`, () =>
                            submitForm({
                              worker: f.subject,
                              form: f.form!,
                              scope: f.scope!,
                              tenantSlug: selectedTenantSlug,
                            }),
                          );
                        }}
                      >
                        Submit
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={!selectedTenantSlug}
                        onClick={() => {
                          if (!selectedTenantSlug) return;
                          void guardWrite("Cancel flow", () =>
                            cancelFlow({
                              runId: f._id,
                              tenantSlug: selectedTenantSlug,
                            }),
                          );
                        }}
                      >
                        Cancel
                      </Button>
                    </span>
                  )}
                </div>
                {f.status === "waiting" && f.token && (
                  <div className="mt-1.5 text-[12px] text-muted">
                    collection link:{" "}
                    <a
                      href={`/collect?token=${f.token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-ink hover:underline"
                    >
                      /collect?token={f.token.slice(0, 8)}…
                    </a>
                  </div>
                )}
                <ol className="mt-2 space-y-0.5 text-[12px]">
                  {[...f.events].reverse().map((e, i) => (
                    <li key={i} className="text-muted">
                      <span className="text-faint">{fmt(e.ts)}</span>{" "}
                      <span className="font-medium text-ink-2">{e.kind}</span>
                      {e.message ? ` ${e.message}` : ""}
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
