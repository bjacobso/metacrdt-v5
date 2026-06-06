import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Card, Button, Chip, Mono, shortId } from "../ui";

export default function Entities() {
  const navigate = useNavigate();
  const types = useQuery(api.entities.listEntityTypes, {});
  const [type, setType] = useState<string | null>(null);
  const [showSystem, setShowSystem] = useState(false);
  const setupStaffing = useMutation(api.appconfig.setupStaffing);
  const [busy, setBusy] = useState(false);

  const entities = useQuery(
    api.entities.listEntities,
    type ? { type, origin: "all" } : "skip",
  );

  const userTypes = (types ?? []).filter((t) => t.origin !== "system");
  const systemTypes = (types ?? []).filter((t) => t.origin === "system");

  useEffect(() => {
    if (type === null && userTypes.length > 0) {
      setType((userTypes.find((t) => t.count > 0) ?? userTypes[0]).type);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types]);

  const empty = types && types.length === 0;

  async function bootstrap() {
    setBusy(true);
    try {
      await setupStaffing({});
    } finally {
      setBusy(false);
    }
  }

  function TypeButton({
    t,
  }: {
    t: { type: string; count: number; origin: string };
  }) {
    const active = t.type === type;
    return (
      <button
        onClick={() => setType(t.type)}
        className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] ${
          active ? "bg-brand text-white" : "text-ink hover:bg-line-soft"
        }`}
      >
        <span className="flex items-center gap-1.5">
          {t.type}
          {t.origin === "configured" && (
            <span
              className={`text-[10px] ${active ? "text-white/60" : "text-blue-ink"}`}
            >
              cfg
            </span>
          )}
        </span>
        <span className={`tnum text-[12px] ${active ? "text-white/70" : "text-muted"}`}>
          {t.count}
        </span>
      </button>
    );
  }

  return (
    <div className="flex gap-6">
      <aside className="w-56 shrink-0">
        <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Your data
        </p>
        {types === undefined ? (
          <p className="px-2.5 text-[13px] text-muted">Loading…</p>
        ) : userTypes.length === 0 ? (
          <p className="px-2.5 text-[13px] text-muted">No entity types yet.</p>
        ) : (
          <div className="space-y-0.5">
            {userTypes.map((t) => (
              <TypeButton key={t.type} t={t} />
            ))}
          </div>
        )}

        <button
          onClick={() => setShowSystem((v) => !v)}
          className="mt-4 flex items-center gap-1 px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted hover:text-ink"
        >
          {showSystem ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
          System entities
        </button>
        {showSystem && (
          <div className="space-y-0.5">
            {systemTypes.map((t) => (
              <TypeButton key={t.type} t={t} />
            ))}
          </div>
        )}
      </aside>

      <div className="min-w-0 flex-1">
        {empty ? (
          <Card className="p-6">
            <h2 className="text-lg font-semibold text-ink">No data yet</h2>
            <p className="mt-1 max-w-prose text-[14px] text-muted">
              Install the staffing blueprint (config-as-code) to define the entity
              types, forms, flows, compliance rules, and actions — then seed a demo.
            </p>
            <div className="mt-4">
              <Button variant="primary" onClick={bootstrap} disabled={busy}>
                {busy ? "Installing…" : "Set up staffing demo"}
              </Button>
            </div>
          </Card>
        ) : type === null ? (
          <p className="text-[13px] text-muted">Pick a type.</p>
        ) : (
          <Card>
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
              <h2 className="text-[15px] font-semibold text-ink">{type}</h2>
              <span className="text-xs text-muted">
                {entities ? `${entities.length}` : "…"}
              </span>
            </div>
            {entities === undefined ? (
              <p className="px-5 py-4 text-[13px] text-muted">Loading…</p>
            ) : entities.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted">
                No entities of this type.
              </p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {entities.map((e) => (
                  <li key={e.id}>
                    <button
                      onClick={() => navigate(`/e/${encodeURIComponent(e.id)}`)}
                      className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-line-soft"
                    >
                      <span className="flex items-center gap-3">
                        <span className="text-[14px] font-medium text-ink">
                          {e.name ?? shortId(e.id)}
                        </span>
                        <Mono>{e.id}</Mono>
                        {e.origin === "system" && <Chip tone="system">system</Chip>}
                      </span>
                      <ChevronRight className="h-4 w-4 text-faint" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
