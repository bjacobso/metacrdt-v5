import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { ChevronRight, ChevronDown } from "lucide-react";
import { Card, Button, Mono, shortId } from "../ui";
import { useWriteGate } from "../auth";
import { useTenant } from "../tenant";
import { tenantDemoProfile } from "../tenantDemoProfile";
import { tenantPath } from "../navigationModel";
import { ViewRenderer, type ViewRenderContext } from "../views/ViewRenderer";
import {
  buildEntitiesViewSpec,
  flattenEntityRows,
  type RawEntityRow,
} from "../views/entitiesView";

function displayValue(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

export default function Entities() {
  const navigate = useNavigate();
  const { selectedTenant, selectedTenantSlug } = useTenant();
  const types = useQuery(
    api.entities.listEntityTypes,
    selectedTenantSlug ? { tenantSlug: selectedTenantSlug } : "skip",
  );
  const [type, setType] = useState<string | null>(null);
  const [showSystem, setShowSystem] = useState(false);
  const setupStaffing = useMutation(api.appconfig.setupStaffing);
  const setupLegal = useMutation(api.appconfig.setupLegal);
  const [busy, setBusy] = useState(false);
  const { guardWrite } = useWriteGate();
  const demoProfile = tenantDemoProfile(selectedTenant?.kind);

  const schema = useQuery(
    api.attributes.typeSchemaAsOf,
    type && selectedTenantSlug ? { type, tenantSlug: selectedTenantSlug } : "skip",
  );
  const entities = useQuery(
    api.entities.queryEntities,
    type && selectedTenantSlug
      ? { type, tenantSlug: selectedTenantSlug, pageSize: 50 }
      : "skip",
  );
  const componentEntities = useQuery(
    api.metacrdtComponent.listOwnedCurrentEntities,
    "skip",
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

  // Phase 3: the Entities list is now a ViewSpec rendered by the inline
  // ViewSpec->React renderer. The spec is built from the type's schema columns;
  // the edge flattens backend rows into the runtime scope (views never queries).
  const columnNames = (schema?.columns ?? []).map((c) => c.name);
  const entitiesSpec = type ? buildEntitiesViewSpec(type, columnNames) : null;
  const entitiesCtx: ViewRenderContext = {
    state: {},
    input: { type: type ?? "" },
    query: {
      entities: {
        page: entities ? flattenEntityRows(entities.page as RawEntityRow[], columnNames) : [],
      },
    },
    onRowActivate: (row) =>
      navigate(tenantPath(selectedTenantSlug, `/e/${encodeURIComponent(String(row["id"]))}`)),
  };

  async function bootstrap() {
    if (!selectedTenantSlug) return;
    setBusy(true);
    try {
      await guardWrite(`Set up ${demoProfile.setupLabel}`, () =>
        demoProfile.setupAction === "setupLegal"
          ? setupLegal({ tenantSlug: selectedTenantSlug })
          : setupStaffing({ tenantSlug: selectedTenantSlug }),
      );
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
              Install the {demoProfile.setupLabel} account configuration to define the entity
              types, forms, flows, requirements, and actions — then seed demo data.
            </p>
            <div className="mt-4">
              <Button variant="primary" onClick={bootstrap} disabled={busy}>
                {busy ? "Installing…" : `Set up ${demoProfile.setupLabel}`}
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
                {entities ? `${entities.total}` : "…"}
              </span>
            </div>
            {entities === undefined || !entitiesSpec ? (
              <p className="px-5 py-4 text-[13px] text-muted">Loading…</p>
            ) : (
              <ViewRenderer node={entitiesSpec.root} ctx={entitiesCtx} />
            )}
          </Card>
        )}
        {componentEntities !== undefined && componentEntities.length > 0 && (
          <Card className="mt-5">
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-3.5">
              <div>
                <h2 className="text-[15px] font-semibold text-ink">
                  Component-owned entities
                </h2>
                <p className="text-[12px] text-muted">
                  @metacrdt/convex current fold
                </p>
              </div>
              <span className="text-xs text-muted">
                {componentEntities.length}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-line-soft text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-5 py-2.5 font-semibold">entity</th>
                    <th className="px-3 py-2.5 font-semibold">type</th>
                    <th className="px-3 py-2.5 font-semibold">updated</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {componentEntities.map((e) => (
                    <tr
                      key={e.e}
                      onClick={() =>
                        navigate(
                          tenantPath(
                            selectedTenantSlug,
                            `/component/e/${encodeURIComponent(e.e)}`,
                          ),
                        )
                      }
                      className="cursor-pointer hover:bg-line-soft"
                    >
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink">
                            {displayValue(e.name ?? shortId(e.e))}
                          </span>
                          <Mono>{e.e}</Mono>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-ink-2">{e.type}</td>
                      <td className="px-3 py-3 text-muted">
                        {new Date(e.updatedAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <ChevronRight className="ml-auto h-4 w-4 text-faint" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
