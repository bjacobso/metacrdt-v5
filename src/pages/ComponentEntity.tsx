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
  const runOwnedAction = useMutation(api.metacrdtComponent.runOwnedAction);
  const entity = useQuery(api.metacrdtComponent.getOwnedCurrentEntity, {
    e: id,
  });
  const events = useQuery(api.metacrdtComponent.listOwnedEvents, {
    e: id,
    limit: 20,
  });
  const types =
    entity?.attributes.find((attr) => attr.a === "type")?.values.map(String) ?? [];
  const primaryType = types[0];
  const actions = useQuery(
    api.actions.actionsForType,
    primaryType ? { type: primaryType } : "skip",
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

  if (
    entity === undefined ||
    events === undefined ||
    (primaryType !== undefined && actions === undefined)
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
