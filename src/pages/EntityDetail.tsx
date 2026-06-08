import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ArrowLeft, Play } from "lucide-react";
import {
  Card,
  CardHeader,
  Button,
  Chip,
  StatusBadge,
  Mono,
  Input,
  shortId,
} from "../ui";

function val(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

export default function EntityDetail() {
  const { id: raw } = useParams();
  const id = decodeURIComponent(raw ?? "");
  const navigate = useNavigate();
  const detail = useQuery(api.entities.entityDetail, { e: id });
  const primaryType = detail?.types[0];
  const schema = useQuery(
    api.attributes.typeSchemaAsOf,
    primaryType ? { type: primaryType } : "skip",
  );
  const startFlow = useMutation(api.flows.startFlow);
  const runAction = useMutation(api.actions.runAction);
  const submitForm = useMutation(api.compliance.submitForm);
  const cancelFlow = useMutation(api.flows.cancelFlow);
  const [employer, setEmployer] = useState("employer:acme");
  const [actionArgs, setActionArgs] = useState<Record<string, Record<string, unknown>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  }

  if (detail === undefined)
    return <p className="text-[13px] text-muted">Loading…</p>;

  const declared = (schema?.attributes ?? []).filter((a) => a !== "type");
  const attrNames = [
    ...declared,
    ...Object.keys(detail.attributes)
      .filter((a) => a !== "type" && !declared.includes(a))
      .sort(),
  ];
  const attrs = attrNames
    .map((a) => [a, detail.attributes[a] ?? []] as const)
    .filter(([, vals]) => vals.length > 0);
  const denied = detail.denied ?? [];
  const linked = [
    ...new Set(
      attrs
        .flatMap(([, vals]) => vals as unknown[])
        .filter((v): v is string => typeof v === "string" && v.includes(":")),
    ),
  ];
  const openObs = detail.obligations.filter((o) => o.open);

  function setActionArg(action: string, field: string, value: unknown) {
    setActionArgs((prev) => ({
      ...prev,
      [action]: {
        ...(prev[action] ?? {}),
        [field]: value,
      },
    }));
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
              {detail.name ?? shortId(id)}
            </h2>
            <Mono>{id}</Mono>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {detail.types.map((t) => (
              <Chip key={t} tone="brand">
                {t}
              </Chip>
            ))}
            <Chip tone={detail.origin === "data" ? "data" : "system"}>
              {detail.origin}
            </Chip>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="State" />
        {attrs.length === 0 && denied.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted">No current facts.</p>
        ) : (
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-line-soft">
              {attrs.map(([a, vals]) => (
                <tr key={a}>
                  <td className="w-1/3 px-5 py-2.5 font-medium text-ink-2">{a}</td>
                  <td className="px-5 py-2.5 text-ink">
                    {(vals as unknown[]).map(val).join(", ")}
                  </td>
                </tr>
              ))}
              {denied.map((d) => (
                <tr key={`denied:${d.a}`}>
                  <td className="w-1/3 px-5 py-2.5 font-medium text-ink-2">{d.a}</td>
                  <td className="px-5 py-2.5 text-red-ink">
                    Denied <span className="text-muted">({d.reason})</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {detail.flows.length > 0 && (
        <Card>
          <CardHeader
            title="Run a flow"
            right={
              <label className="flex items-center gap-2 text-[12px] text-muted">
                context.employer
                <Input
                  value={employer}
                  onChange={(e) => setEmployer(e.target.value)}
                  className="w-44 font-mono"
                />
              </label>
            }
          />
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            {detail.flows.map((f) => (
              <div
                key={f.name}
                className="flex items-center justify-between gap-3 rounded-ds border border-line px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-ink">{f.title ?? f.name}</div>
                  <div className="truncate text-[12px] text-muted">
                    {f.steps.map((s) => s.type).join(" → ")}
                  </div>
                </div>
                <Button
                  variant="primary"
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
                  <Play className="h-3.5 w-3.5" /> Run
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {detail.actions.length > 0 && (
        <Card>
          <CardHeader title="Actions" />
          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
            {detail.actions.map((a) => (
              <div
                key={a.name}
                className="flex items-center justify-between gap-3 rounded-ds border border-line px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="font-medium text-ink">{a.label ?? a.name}</div>
                  <div className="truncate text-[12px] text-muted">
                    {Object.entries(a.asserts)
                      .map(([k, v]) => `${k} = ${val(v)}`)
                      .join(", ")}
                  </div>
                  {a.fields.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {a.fields.map((field) => {
                        const current =
                          actionArgs[a.name]?.[field.name] ??
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
                                  setActionArg(a.name, field.name, ev.target.value)
                                }
                                className="mt-1 block w-40 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink"
                              >
                                <option value="">—</option>
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
                                  setActionArg(a.name, field.name, ev.target.checked)
                                }
                                className="mt-2 block"
                              />
                            ) : (
                              <Input
                                value={String(current)}
                                type={field.type === "number" ? "number" : "text"}
                                onChange={(ev) =>
                                  setActionArg(
                                    a.name,
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
                  disabled={busy === `action:${a.name}`}
                  onClick={() =>
                    run(`action:${a.name}`, () =>
                      runAction({
                        action: a.name,
                        entity: id,
                        args: actionArgs[a.name] ?? {},
                      }),
                    )
                  }
                >
                  Run
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <CardHeader
          title="Obligations"
          hint={`${openObs.length} open`}
        />
        {detail.obligations.length === 0 ? (
          <p className="px-5 py-4 text-[13px] text-muted">None.</p>
        ) : openObs.length === 0 ? (
          <p className="px-5 py-4 text-[13px] font-medium text-green">
            ✓ All obligations satisfied.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-line-soft">
              {openObs.map((o, i) => (
                <tr key={i}>
                  <td className="px-5 py-2.5 font-medium text-ink">{o.form}</td>
                  <td className="px-5 py-2.5 text-muted">
                    <Mono>{shortId(o.scope)}</Mono>
                  </td>
                  <td className="px-5 py-2.5 text-right">
                    <Button
                      variant="collect"
                      disabled={busy === `submit:${o.form}:${o.scope}`}
                      onClick={() =>
                        run(`submit:${o.form}:${o.scope}`, () =>
                          submitForm({ worker: id, form: o.form, scope: o.scope }),
                        )
                      }
                    >
                      Submit {o.form}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {detail.runs.length > 0 && (
        <Card>
          <CardHeader title="Flow runs" />
          <ul className="divide-y divide-line-soft">
            {detail.runs.map((r) => (
              <li key={r._id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <StatusBadge status={r.status} />
                  <Mono>{r.flowDefName}</Mono>
                  <span className="text-muted">· step: {r.step}</span>
                  {r.status === "waiting" && r.form && r.scope && (
                    <span className="ml-auto flex items-center gap-2">
                      <Button
                        variant="collect"
                        onClick={() =>
                          submitForm({ worker: id, form: r.form!, scope: r.scope! })
                        }
                      >
                        Submit
                      </Button>
                      <Button variant="ghost" onClick={() => cancelFlow({ runId: r._id })}>
                        Cancel
                      </Button>
                    </span>
                  )}
                </div>
                {r.status === "waiting" && r.token && (
                  <div className="mt-1 text-[12px] text-muted">
                    collection link:{" "}
                    <a
                      href={`/collect?token=${r.token}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-ink hover:underline"
                    >
                      /collect?token={r.token.slice(0, 8)}…
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {linked.length > 0 && (
        <Card>
          <CardHeader title="Linked entities" />
          <div className="flex flex-wrap gap-2 p-5">
            {linked.map((ref) => (
              <Link
                key={ref}
                to={`/e/${encodeURIComponent(ref)}`}
                className="rounded-full border border-line bg-surface px-2.5 py-1 font-mono text-[12px] text-ink-2 hover:bg-brand hover:text-white"
              >
                {ref}
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
