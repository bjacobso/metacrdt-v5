import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ArrowLeft } from "lucide-react";
import { Button, Card, CardHeader, Chip, Mono, shortId } from "../ui";
import { useState } from "react";

function val(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

export default function ComponentEntity() {
  const { id: raw } = useParams();
  const id = decodeURIComponent(raw ?? "");
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const setWorkerStatus = useMutation(api.metacrdtComponent.setOwnedWorkerStatus);
  const entity = useQuery(api.metacrdtComponent.getOwnedCurrentEntity, {
    e: id,
  });
  const events = useQuery(api.metacrdtComponent.listOwnedEvents, {
    e: id,
    limit: 20,
  });
  const types =
    entity?.attributes.find((attr) => attr.a === "type")?.values.map(String) ?? [];
  const name =
    entity?.attributes.find((attr) => attr.a === "name")?.values[0] ?? undefined;
  const status =
    entity?.attributes.find((attr) => attr.a === "worker.status")?.values[0] ??
    undefined;
  const isWorker = types.includes("Worker");

  async function setStatus(status: "active" | "terminated") {
    setBusy(`status:${status}`);
    try {
      await setWorkerStatus({ e: id, status });
    } finally {
      setBusy(null);
    }
  }

  if (entity === undefined || events === undefined) {
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

      {isWorker && (
        <Card>
          <CardHeader title="Component actions" hint="host wrapper writes" />
          <div className="flex flex-wrap items-center justify-between gap-3 p-5 text-[13px]">
            <div>
              <div className="font-medium text-ink">Worker status</div>
              <div className="text-muted">
                current:{" "}
                <span className="font-medium text-ink">
                  {status === undefined ? "unknown" : val(status)}
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="reuse"
                disabled={busy !== null || status === "active"}
                onClick={() => setStatus("active")}
              >
                Reactivate
              </Button>
              <Button
                variant="collect"
                disabled={busy !== null || status === "terminated"}
                onClick={() => setStatus("terminated")}
              >
                Terminate
              </Button>
            </div>
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
