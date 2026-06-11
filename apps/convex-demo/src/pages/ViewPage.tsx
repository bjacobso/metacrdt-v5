import { useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { isRenderableViewSpec, type ViewSpec } from "@metacrdt/views/runtime";
import { Card, CardHeader, Mono } from "../ui";
import { ViewRenderer } from "@metacrdt/views-react";
import { useViewHost } from "../views/host/useViewHost";

function Toasts({
  toasts,
}: {
  toasts: readonly {
    id: number;
    message: string;
    description?: string;
    variant?: string;
  }[];
}) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`w-80 rounded-ds border px-4 py-3 shadow-pop ${
            toast.variant === "error"
              ? "border-red/20 bg-red-soft text-red-ink"
              : "border-line bg-surface text-ink"
          }`}
        >
          <div className="text-[13px] font-semibold">{toast.message}</div>
          {toast.description && (
            <div className="mt-1 text-[12px] opacity-80">{toast.description}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function RenderedView({ spec }: { spec: ViewSpec }) {
  const { ctx, loading, errors, toasts } = useViewHost(spec);
  return (
    <>
      {errors.length > 0 && (
        <div className="mb-4 space-y-2">
          {errors.map((error) => (
            <div
              key={error}
              className="rounded-md border border-orange/30 bg-orange-soft px-3 py-2 text-[12px] text-orange-ink"
            >
              {error}
            </div>
          ))}
        </div>
      )}
      {loading && (
        <p className="mb-3 text-[13px] text-muted">Loading live bindings...</p>
      )}
      <ViewRenderer node={spec.root} ctx={ctx} />
      <Toasts toasts={toasts} />
    </>
  );
}

export default function ViewPage() {
  const params = useParams();
  const name = params.name ?? "";
  const view = useQuery(api.views.getView, name ? { name } : "skip");

  if (!name) {
    return <p className="text-[13px] text-muted">Missing view name.</p>;
  }
  if (view === undefined) {
    return <p className="text-[13px] text-muted">Loading view...</p>;
  }
  if (view === null) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-ink">View not found</h2>
        <p className="mt-1 text-[13px] text-muted">
          No ontology view is defined as <Mono>{name}</Mono>.
        </p>
      </Card>
    );
  }
  if (!isRenderableViewSpec(view.spec)) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-ink">Invalid view spec</h2>
        <p className="mt-1 text-[13px] text-muted">
          <Mono>{name}</Mono> is stored, but it does not include a renderable root node.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title={view.label ?? view.name}
          hint={view.description}
          right={<Mono>{view.name}</Mono>}
        />
      </Card>
      <RenderedView spec={view.spec} />
    </div>
  );
}
