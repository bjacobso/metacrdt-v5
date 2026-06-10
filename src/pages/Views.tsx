import { Link } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button, Card, CardHeader, Mono } from "../ui";
import { useWriteGate } from "../auth";
import { useState } from "react";

export default function Views() {
  const views = useQuery(api.views.listViews, {});
  const setupStaffing = useMutation(api.appconfig.setupStaffing);
  const { guardWrite } = useWriteGate();
  const [busy, setBusy] = useState(false);

  async function bootstrap() {
    setBusy(true);
    try {
      await guardWrite("Set up staffing demo", () => setupStaffing({}));
    } finally {
      setBusy(false);
    }
  }

  if (views === undefined) {
    return <p className="text-[13px] text-muted">Loading views...</p>;
  }

  if (views.length === 0) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-ink">No views yet</h2>
        <p className="mt-1 max-w-prose text-[14px] text-muted">
          Install the staffing blueprint to define demo ViewSpecs alongside the
          entity types, forms, flows, compliance rules, and actions.
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={bootstrap} disabled={busy}>
            {busy ? "Installing..." : "Set up staffing demo"}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {views.map((view) => (
        <Link
          key={view.name}
          to={`/views/${encodeURIComponent(view.name)}`}
          className="block"
        >
          <Card className="h-full transition-colors hover:border-brand/40">
            <CardHeader title={view.label ?? view.name} />
            <div className="space-y-3 px-5 py-4">
              {view.description && (
                <p className="text-[13px] text-muted">{view.description}</p>
              )}
              <Mono>{view.name}</Mono>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}
