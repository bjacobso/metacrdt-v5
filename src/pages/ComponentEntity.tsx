import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ArrowLeft } from "lucide-react";
import { Button, Card, CardHeader, Chip, Input, Mono, shortId } from "../ui";

function val(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

export default function ComponentEntity() {
  const { id: raw } = useParams();
  const id = decodeURIComponent(raw ?? "");
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [actionArgs, setActionArgs] = useState<Record<string, Record<string, unknown>>>({});
  const [actionResults, setActionResults] = useState<
    Record<string, { collectUrl?: string; reused?: boolean }>
  >({});
  const [flowResult, setFlowResult] = useState<{
    flowDefName: string;
    status: string;
    currentStepId?: string;
    collect?: { collectUrl: string; reused: boolean };
    asserted: Array<{ eventId: string }>;
    events: Array<{ stepId: string; type: string; kind: string; message?: string }>;
  } | null>(null);
  const [issueResult, setIssueResult] = useState<{
    issued: number;
    reused: number;
    items: Array<{
      form: string;
      scope: string;
      token: string;
      collectUrl: string;
      reused: boolean;
    }>;
  } | null>(null);
  const [materializeResult, setMaterializeResult] = useState<{
    summary: {
      requires: number;
      tasks: number;
      asserted: number;
      retracted: number;
      kept: number;
    };
  } | null>(null);
  const runOwnedAction = useMutation(api.metacrdtComponent.runOwnedAction);
  const startOwnedFlow = useMutation(api.metacrdtComponent.startOwnedFlow);
  const issueOwnedOpenCollections = useMutation(
    api.metacrdtComponent.issueOwnedOpenCollections,
  );
  const materializeOwnedCompliance = useMutation(
    api.metacrdtComponent.materializeOwnedCompliance,
  );
  const entity = useQuery(api.metacrdtComponent.getOwnedCurrentEntity, {
    e: id,
  });
  const events = useQuery(api.metacrdtComponent.listOwnedEvents, {
    e: id,
    limit: 20,
  });
  const collections = useQuery(api.metacrdtComponent.listOwnedCollections, {
    subject: id,
    limit: 20,
  });
  const types =
    entity?.attributes.find((attr) => attr.a === "type")?.values.map(String) ?? [];
  const primaryType = types[0];
  const actions = useQuery(
    api.actions.actionsForType,
    primaryType ? { type: primaryType } : "skip",
  );
  const flows = useQuery(
    api.flows.flowsForType,
    primaryType ? { type: primaryType } : "skip",
  );
  const compliance = useQuery(
    api.metacrdtComponent.ownedCompliancePlan,
    primaryType === "Worker" ? { worker: id } : "skip",
  );
  const name =
    entity?.attributes.find((attr) => attr.a === "name")?.values[0] ?? undefined;

  function setActionArg(action: string, field: string, value: unknown) {
    setActionArgs((prev) => ({
      ...prev,
      [action]: {
        ...(prev[action] ?? {}),
        [field]: value,
      },
    }));
  }

  async function runConfiguredAction(action: NonNullable<typeof actions>[number]) {
    setBusy(`action:${action.name}`);
    try {
      const result = await runOwnedAction({
        action: action.name,
        entity: id,
        args: actionArgs[action.name] ?? {},
      });
      if (result.collect) {
        setActionResults((prev) => ({
          ...prev,
          [action.name]: {
            collectUrl: result.collect!.collectUrl,
            reused: result.collect!.reused,
          },
        }));
      }
    } finally {
      setBusy(null);
    }
  }

  async function runConfiguredFlow(flow: NonNullable<typeof flows>[number]) {
    setBusy(`flow:${flow.name}`);
    try {
      const result = await startOwnedFlow({
        flowDefName: flow.name,
        subject: id,
        context: { employer: "employer:acme" },
      });
      setFlowResult(result);
    } finally {
      setBusy(null);
    }
  }

  async function issueComplianceCollections() {
    setBusy("compliance");
    try {
      const result = await issueOwnedOpenCollections({ worker: id });
      setIssueResult(result);
    } finally {
      setBusy(null);
    }
  }

  async function materializeComplianceFacts() {
    setBusy("materialize-compliance");
    try {
      const result = await materializeOwnedCompliance({ worker: id });
      setMaterializeResult(result);
    } finally {
      setBusy(null);
    }
  }

  if (
    entity === undefined ||
    events === undefined ||
    collections === undefined ||
    (primaryType !== undefined && actions === undefined) ||
    (primaryType !== undefined && flows === undefined) ||
    (primaryType === "Worker" && compliance === undefined)
  ) {
    return <p className="text-[13px] text-muted">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <Card className="px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-ink">
              {name === undefined ? shortId(id) : val(name)}
            </h2>
            <Mono>{id}</Mono>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {types.map((t) => (
              <Chip key={t} tone="brand">
                {t}
              </Chip>
            ))}
            <Chip tone="configured">component-owned</Chip>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Component state" hint="@metacrdt/convex current fold" />
        {entity === null ? (
          <p className="px-5 py-4 text-[13px] text-muted">
            No component-owned current facts for this entity.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-line-soft">
              {entity.attributes.map((attr) => (
                <tr key={attr.a}>
                  <td className="w-1/3 px-5 py-2.5 font-medium text-ink-2">
                    {attr.a}
                  </td>
                  <td className="px-5 py-2.5 text-ink">
                    {attr.values.map(val).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {(actions ?? []).length > 0 && (
        <Card>
          <CardHeader title="Component actions" hint="configured host actions" />
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            {(actions ?? []).map((action) => (
              <div
                key={action.name}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-ds border border-line px-4 py-3 text-[13px]"
              >
                <div className="min-w-0">
                  <div className="font-medium text-ink">
                    {action.label ?? action.name}
                  </div>
                  <div className="truncate text-[12px] text-muted">
                    {Object.entries(action.asserts)
                      .map(([k, v]) => `${k} = ${val(v)}`)
                      .join(", ")}
                    {action.opensForm ? " · opens collection form" : ""}
                  </div>
                  {action.fields.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {action.fields.map((field) => {
                        const current =
                          actionArgs[action.name]?.[field.name] ??
                          field.defaultValue ??
                          "";
                        return (
                          <label
                            key={field.name}
                            className="text-[11px] font-medium uppercase text-muted"
                          >
                            {field.label ?? field.name}
                            {field.type === "select" ? (
                              <select
                                value={String(current)}
                                onChange={(ev) =>
                                  setActionArg(
                                    action.name,
                                    field.name,
                                    ev.target.value,
                                  )
                                }
                                className="mt-1 block w-40 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink"
                              >
                                <option value="">-</option>
                                {(field.options ?? []).map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : field.type === "boolean" ? (
                              <input
                                type="checkbox"
                                checked={Boolean(current)}
                                onChange={(ev) =>
                                  setActionArg(
                                    action.name,
                                    field.name,
                                    ev.target.checked,
                                  )
                                }
                                className="mt-2 block"
                              />
                            ) : (
                              <Input
                                value={String(current)}
                                type={field.type === "number" ? "number" : "text"}
                                onChange={(ev) =>
                                  setActionArg(
                                    action.name,
                                    field.name,
                                    field.type === "number"
                                      ? Number(ev.target.value)
                                      : ev.target.value,
                                  )
                                }
                                className="mt-1 w-40"
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <Button
                  disabled={busy === `action:${action.name}`}
                  onClick={() => runConfiguredAction(action)}
                >
                  Run
                </Button>
                {actionResults[action.name]?.collectUrl && (
                  <div className="col-span-2 rounded-md bg-orange-soft px-3 py-2 text-[12px] text-orange-ink">
                    collection link:{" "}
                    <a
                      className="font-medium underline"
                      href={actionResults[action.name].collectUrl}
                    >
                      {actionResults[action.name].collectUrl!.slice(0, 24)}…
                    </a>
                    {actionResults[action.name].reused ? " (reused)" : ""}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {(flows ?? []).length > 0 && (
        <Card>
          <CardHeader
            title="Component flows"
            hint="host flow definitions over component-owned state"
          />
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            {(flows ?? []).map((flow) => (
              <div
                key={flow.name}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-ds border border-line px-4 py-3 text-[13px]"
              >
                <div className="min-w-0">
                  <div className="font-medium text-ink">{flow.title ?? flow.name}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {flow.steps.map((step) => (
                      <Chip key={step.id} tone="system">
                        {step.type}
                      </Chip>
                    ))}
                  </div>
                </div>
                <Button
                  disabled={busy === `flow:${flow.name}`}
                  onClick={() => runConfiguredFlow(flow)}
                >
                  Run
                </Button>
              </div>
            ))}
          </div>
          {flowResult !== null && (
            <div className="border-t border-line-soft px-5 py-3 text-[12px] text-ink-2">
              <div className="flex flex-wrap items-center gap-2">
                <Chip
                  tone={
                    flowResult.status === "completed"
                      ? "data"
                      : flowResult.status === "waiting"
                        ? "configured"
                        : "system"
                  }
                >
                  {flowResult.status}
                </Chip>
                <span className="font-medium">{flowResult.flowDefName}</span>
                {flowResult.currentStepId && (
                  <>
                    <span className="text-muted">at</span>
                    <Mono>{flowResult.currentStepId}</Mono>
                  </>
                )}
                <span className="text-muted">
                  asserted {flowResult.asserted.length}
                </span>
              </div>
              {flowResult.collect && (
                <div className="mt-2 rounded-md bg-orange-soft px-3 py-2 text-orange-ink">
                  collection link:{" "}
                  <a className="font-medium underline" href={flowResult.collect.collectUrl}>
                    {flowResult.collect.collectUrl}
                  </a>
                  {flowResult.collect.reused ? " (reused)" : ""}
                </div>
              )}
              <ul className="mt-2 space-y-1 text-muted">
                {flowResult.events.map((event, i) => (
                  <li key={`${event.stepId}:${i}`}>
                    <Mono>{event.stepId}</Mono> {event.kind}
                    {event.message ? ` - ${event.message}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      {primaryType === "Worker" && compliance !== undefined && (
        <Card>
          <CardHeader
            title="Component compliance"
            hint="configured requirements over component-owned state"
            right={
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy === "materialize-compliance"}
                  onClick={materializeComplianceFacts}
                >
                  Materialize facts
                </Button>
                {compliance.summary.collect > 0 && (
                  <Button
                    disabled={busy === "compliance"}
                    onClick={issueComplianceCollections}
                  >
                    Issue open collections
                  </Button>
                )}
              </div>
            }
          />
          {compliance.items.length === 0 ? (
            <p className="px-5 py-4 text-[13px] text-muted">
              No configured requirements currently match this component-owned
              Worker.
            </p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line-soft text-left text-[11px] uppercase text-muted">
                  <th className="px-5 py-2 font-medium">Decision</th>
                  <th className="px-5 py-2 font-medium">Form</th>
                  <th className="px-5 py-2 font-medium">Scope</th>
                  <th className="px-5 py-2 font-medium">Placements</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {compliance.items.map((item) => (
                  <tr key={`${item.form}:${item.scope}`}>
                    <td className="px-5 py-2.5">
                      <Chip tone={item.decision === "reuse" ? "data" : "configured"}>
                        {item.decision}
                      </Chip>
                    </td>
                    <td className="px-5 py-2.5 font-medium text-ink">
                      {item.form}
                      <div className="mt-0.5 text-[12px] font-normal text-muted">
                        {item.reason}
                      </div>
                    </td>
                    <td className="px-5 py-2.5">
                      <Mono>{item.scope}</Mono>
                    </td>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        {item.placements.map((placement) => (
                          <Mono key={placement}>{shortId(placement)}</Mono>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {compliance.unsupported.length > 0 && (
            <div className="border-t border-line-soft px-5 py-3 text-[12px] text-muted">
              Unsupported requirement rules:{" "}
              {compliance.unsupported
                .map((rule) => `${rule.rule} (${rule.reason})`)
                .join(", ")}
            </div>
          )}
          {issueResult !== null && (
            <div className="border-t border-line-soft px-5 py-3 text-[12px] text-orange-ink">
              Issued {issueResult.issued}; reused {issueResult.reused}.{" "}
              {issueResult.items.map((item) => (
                <a
                  key={`${item.form}:${item.scope}`}
                  className="mr-2 font-medium underline"
                  href={item.collectUrl}
                >
                  {item.form}/{shortId(item.scope)}
                  {item.reused ? " reused" : ""}
                </a>
              ))}
            </div>
          )}
          {materializeResult !== null && (
            <div className="border-t border-line-soft px-5 py-3 text-[12px] text-blue-ink">
              Materialized {materializeResult.summary.requires} requirements and{" "}
              {materializeResult.summary.tasks} open tasks. Asserted{" "}
              {materializeResult.summary.asserted}, retracted{" "}
              {materializeResult.summary.retracted}, kept{" "}
              {materializeResult.summary.kept}.
            </div>
          )}
        </Card>
      )}

      <Card>
        <CardHeader
          title="Component collection runs"
          hint="component-owned capability rows"
        />
        {collections.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted">
            No component-owned collection runs for this entity.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {collections.map((run) => (
              <li key={run.runId} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <Chip tone={run.status === "waiting" ? "configured" : "data"}>
                    {run.status}
                  </Chip>
                  <span className="font-medium text-ink">{run.form}</span>
                  <span className="text-muted">for</span>
                  <Mono>{run.scope}</Mono>
                  <span className="ml-auto text-[12px] text-muted">
                    {new Date(run.updatedAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  <Mono>{run.runId}</Mono>
                  {run.status === "waiting" && run.tokenConsumedAt === undefined && (
                    <a
                      className="font-medium text-orange-ink underline"
                      href={`/collect?token=${run.token}`}
                    >
                      /collect?token={run.token.slice(0, 8)}…
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Component event log" hint="append-only protocol rows" />
        {events.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted">
            No component-owned events for this entity.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {events.map((event) => (
              <li key={event.rowId} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <Chip tone={event.kind === "assert" ? "data" : "system"}>
                    {event.kind}
                  </Chip>
                  <span className="font-medium text-ink">{event.a}</span>
                  <span className="text-muted">=</span>
                  <span className="text-ink">{val(event.v)}</span>
                  <span className="ml-auto text-[12px] text-muted">
                    {new Date(event.txTime).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">
                  <Mono>{event.eventId}</Mono>
                  {event.targetEventId && (
                    <>
                      <span>targets</span>
                      <Mono>{event.targetEventId}</Mono>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="text-[12px] text-muted">
        Host-owned entities still live under{" "}
        <Link className="font-medium text-blue-ink hover:underline" to="/entities">
          Entities
        </Link>
        . This route reads the packaged component's own state.
      </p>
    </div>
  );
}
