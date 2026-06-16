import { FunctionImpl, GroupImpl } from "@confect/server";
import { fromEvents, visibleAsserts, type Event } from "@metacrdt/core";
import {
  protocolEventFromRows,
  type ConvexTransactionRow,
  type ProtocolFactEventRow,
} from "@metacrdt/convex";
import { Effect, Layer } from "effect";

import api from "./_generated/api";
import { DatabaseReader } from "./_generated/services";
import {
  InvalidPlacement,
  TenantAccessDenied,
  UnsupportedRequirement,
  UnknownWorker,
  type DryRunComplianceResult,
} from "./compliance.spec";
import type { FactEvents } from "./tables/FactEvents";
import type { Rules } from "./tables/Rules";
import type { Tenants } from "./tables/Tenants";
import type { Transactions } from "./tables/Transactions";
import { Auth } from "./_generated/services";

type FactEventDoc = typeof FactEvents.Doc.Type;
type RuleDoc = typeof Rules.Doc.Type;
type TenantDoc = typeof Tenants.Doc.Type;
type TransactionDoc = typeof Transactions.Doc.Type;
type DryRunResult = typeof DryRunComplianceResult.Type;

type PlacementInput = {
  employer?: string;
  client?: string;
  job?: string;
  venue?: string;
};

type PlacementContext = {
  id: string;
  source: "existing" | "hypothetical";
  attrs: Record<string, string>;
};

type Requirement = {
  form: string;
  scopeAttr: string;
  guard?: { attr: string; value: unknown };
};

type CurrentAssert = {
  e: string;
  a: string;
  v: unknown;
  eventId: string;
};

function isPattern(x: unknown): x is [unknown, unknown, unknown] {
  return Array.isArray(x) && x.length === 3;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function txForCore(tx: TransactionDoc): ConvexTransactionRow {
  return {
    _creationTime: tx._creationTime,
    actorId: tx.actorId,
    actorType: tx.actorType,
    txTime: tx.txTime,
    ...(tx.reason === undefined ? {} : { reason: tx.reason }),
  };
}

function rowForCore(row: FactEventDoc): ProtocolFactEventRow {
  return {
    txTime: row.txTime,
    kind: row.kind,
    e: row.e,
    a: row.a,
    v: row.v,
    ...(row.eventId === undefined ? {} : { eventId: row.eventId }),
    ...(row.hlc === undefined ? {} : { hlc: row.hlc }),
    ...(row.replicaId === undefined ? {} : { replicaId: row.replicaId }),
    ...(row.seq === undefined ? {} : { seq: row.seq }),
    ...(row.targetEventId === undefined ? {} : { targetEventId: row.targetEventId }),
    ...(row.causalRefs === undefined ? {} : { causalRefs: row.causalRefs }),
    ...(row.validFrom === undefined ? {} : { validFrom: row.validFrom }),
    ...(row.validTo === undefined ? {} : { validTo: row.validTo }),
    ...(row.reason === undefined ? {} : { reason: row.reason }),
  };
}

function legacyEventId(row: FactEventDoc): string {
  return `legacy:${row._id}`;
}

function legacyEventFromRow(
  row: FactEventDoc,
  tx: TransactionDoc,
  legacyTargetByFactId: Map<string, string>,
): Event | null {
  if (row.kind === "correction") return null;
  const base = {
    id: legacyEventId(row),
    kind: row.kind,
    actor: tx.actorId,
    actorType: tx.actorType === "user" ? ("human" as const) : tx.actorType,
    hlc: {
      pt: row.txTime,
      l: Math.max(0, Math.floor(row._creationTime * 1000)),
      r: "convex:legacy",
    },
    ...(row.reason === undefined && tx.reason === undefined
      ? {}
      : { reason: row.reason ?? tx.reason }),
    causalRefs: [...(row.causalRefs ?? [])],
  };
  if (row.kind === "assert") {
    return {
      ...base,
      kind: "assert",
      e: row.e,
      a: row.a,
      v: row.v as Event["v"],
      validFrom: row.validFrom ?? row.txTime,
      validTo: row.validTo ?? null,
    };
  }
  const target =
    row.targetEventId ??
    (row.factId === undefined
      ? undefined
      : legacyTargetByFactId.get(String(row.factId)));
  if (target === undefined) return null;
  return {
    ...base,
    kind: row.kind,
    target,
  };
}

function typedError(
  err: unknown,
):
  | UnknownWorker
  | InvalidPlacement
  | UnsupportedRequirement
  | TenantAccessDenied {
  if (
    err instanceof UnknownWorker ||
    err instanceof InvalidPlacement ||
    err instanceof UnsupportedRequirement ||
    err instanceof TenantAccessDenied
  ) {
    return err;
  }
  return new UnsupportedRequirement({
    rule: "(decode-or-read)",
    reason: err instanceof Error ? err.message : String(err),
  });
}

function parseRequirement(rule: RuleDoc): Requirement | UnsupportedRequirement {
  if (!rule.name.startsWith("require.")) {
    return new UnsupportedRequirement({
      rule: rule.name,
      reason: "not a requirement rule",
    });
  }
  const form = rule.name.slice("require.".length);
  if (rule.where === undefined || rule.emit === undefined) {
    return new UnsupportedRequirement({
      rule: rule.name,
      reason: "missing where or emit",
    });
  }
  if (
    rule.emit.e !== "?w" ||
    rule.emit.a !== `requires.${form}` ||
    rule.emit.v !== "?s"
  ) {
    return new UnsupportedRequirement({
      rule: rule.name,
      reason: "emit shape is not a compliance requirement",
    });
  }

  const patterns = rule.where.filter(isPattern);
  const hasPlacementType = patterns.some(
    ([e, a, v]) => e === "?p" && a === "type" && v === "Placement",
  );
  const hasWorker = patterns.some(
    ([e, a, v]) => e === "?p" && a === "worker" && v === "?w",
  );
  if (!hasPlacementType || !hasWorker) {
    return new UnsupportedRequirement({
      rule: rule.name,
      reason: "missing Placement type or worker clause",
    });
  }

  const scopes = patterns.filter(
    ([e, a, v]) =>
      e === "?p" &&
      typeof a === "string" &&
      a !== "type" &&
      a !== "worker" &&
      v === "?s",
  );
  if (scopes.length !== 1 || typeof scopes[0]?.[1] !== "string") {
    return new UnsupportedRequirement({
      rule: rule.name,
      reason: "expected exactly one placement scope clause",
    });
  }

  const guards = patterns.filter(
    ([e, a, v]) =>
      e === "?s" &&
      typeof a === "string" &&
      !(typeof v === "string" && v.startsWith("?")),
  );
  if (guards.length > 1) {
    return new UnsupportedRequirement({
      rule: rule.name,
      reason: "multiple guards are not yet supported",
    });
  }

  const guard =
    guards.length === 1 && typeof guards[0]?.[1] === "string"
      ? { attr: guards[0][1], value: guards[0][2] }
      : undefined;

  return {
    form,
    scopeAttr: scopes[0][1],
    ...(guard === undefined ? {} : { guard }),
  };
}

function placementFromRows(
  id: string,
  rows: ReadonlyArray<CurrentAssert>,
): PlacementContext {
  const attrs: Record<string, string> = {};
  for (const r of rows) {
    if (typeof r.v === "string") attrs[r.a] = r.v;
  }
  return { id, source: "existing", attrs };
}

function hypotheticalPlacement(input: PlacementInput): PlacementContext {
  const attrs: Record<string, string> = {};
  for (const k of ["employer", "client", "job", "venue"] as const) {
    const value = input[k];
    if (value !== undefined && value !== "") attrs[k] = value;
  }
  return { id: "placement:dry-run", source: "hypothetical", attrs };
}

const dryRunWorkerCompliance = FunctionImpl.make(
  api,
  "compliance",
  "dryRunWorkerCompliance",
  ({ worker, placement, tenantSlug }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const tenant =
        tenantSlug === undefined
          ? undefined
          : yield* Effect.gen(function* () {
              const auth = yield* Auth;
              const identity = yield* auth.getUserIdentity;
              const tenantDoc = yield* reader
                .table("tenants")
                .get("by_slug", tenantSlug);
              yield* reader
                .table("tenantMemberships")
                .get(
                  "by_tenant_and_principal",
                  tenantDoc._id,
                  identity.tokenIdentifier,
                );
              return tenantDoc;
            }).pipe(
              Effect.catchAll(() =>
                Effect.fail(new TenantAccessDenied({ tenantSlug })),
              ),
            );
      const tenantId = tenant?._id;
      const currentAsserts = (e: string, a?: string, limit = 2000) =>
        Effect.gen(function* () {
          const rows: ReadonlyArray<FactEventDoc> =
            a === undefined
              ? tenantId === undefined
                ? yield* reader
                    .table("factEvents")
                    .index("by_e", (q) => q.eq("e", e))
                    .take(limit)
                : yield* reader
                    .table("factEvents")
                    .index("by_tenant_and_e", (q) =>
                      q.eq("tenantId", tenantId).eq("e", e),
                    )
                    .take(limit)
              : tenantId === undefined
                ? yield* reader
                    .table("factEvents")
                    .index("by_e_a_tx", (q) => q.eq("e", e).eq("a", a))
                    .take(limit)
                : yield* reader
                    .table("factEvents")
                    .index("by_tenant_and_e_a_tx", (q) =>
                      q.eq("tenantId", tenantId).eq("e", e).eq("a", a),
                    )
                    .take(limit);
          const coordTime = Math.max(
            Date.now(),
            ...rows.map((row) => row.txTime),
          );

          const legacyTargetByFactId = new Map<string, string>();
          for (const row of rows) {
            if (row.kind === "assert" && row.factId !== undefined) {
              legacyTargetByFactId.set(
                String(row.factId),
                row.eventId ?? legacyEventId(row),
              );
            }
          }

          const events: Event[] = [];
          for (const row of rows) {
            const tx = yield* reader.table("transactions").get(row.txId);
            const protocol = protocolEventFromRows(rowForCore(row), txForCore(tx));
            const ev = protocol ?? legacyEventFromRow(row, tx, legacyTargetByFactId);
            if (ev !== null) events.push(ev);
          }

          const log = fromEvents(events);
          const keys =
            a === undefined
              ? [...new Set(events.flatMap((ev) =>
                  ev.kind === "assert" && ev.e === e && ev.a !== undefined
                    ? [ev.a]
                    : [],
                ))].map((attr) => [e, attr] as const)
              : ([[e, a]] as const);

          const out: CurrentAssert[] = [];
          for (const [entity, attr] of keys) {
            for (const ev of visibleAsserts(
              entity,
              attr,
              { txTime: coordTime, validTime: coordTime },
              log,
            )) {
              out.push({ e: ev.e!, a: ev.a!, v: ev.v, eventId: ev.id });
            }
          }
          return out;
        });

      const workerRows = yield* currentAsserts(worker);
      if (workerRows.length === 0) {
        return yield* Effect.fail(new UnknownWorker({ worker }));
      }

      const placements: PlacementContext[] = [];
      const workerAssertRows =
        tenantId === undefined
          ? yield* reader
              .table("factEvents")
              .index("by_a_tx", (q) => q.eq("a", "worker"))
              .take(1000)
          : yield* reader
              .table("factEvents")
              .index("by_tenant_and_a_tx", (q) =>
                q.eq("tenantId", tenantId).eq("a", "worker"),
              )
              .take(1000);
      const placementCandidates = [
        ...new Set(workerAssertRows.filter((r) => sameValue(r.v, worker)).map((r) => r.e)),
      ].sort();
      const placementIds: string[] = [];
      for (const id of placementCandidates) {
        const rows = yield* currentAsserts(id, "worker");
        if (rows.some((row) => sameValue(row.v, worker))) placementIds.push(id);
      }
      for (const id of placementIds) {
        const rows = yield* currentAsserts(id);
        placements.push(placementFromRows(id, rows));
      }

      if (placement !== undefined) {
        const hyp = hypotheticalPlacement(placement);
        if (Object.keys(hyp.attrs).length === 0) {
          return yield* Effect.fail(
            new InvalidPlacement({
              reason: "hypothetical placement must include at least one scope",
            }),
          );
        }
        placements.push(hyp);
      }

      const ruleRows =
        tenantId === undefined
          ? yield* reader
              .table("rules")
              .index("by_enabled", (q) => q.eq("enabled", true))
              .take(1000)
          : yield* reader
              .table("rules")
              .index("by_tenant_and_enabled", (q) =>
                q.eq("tenantId", tenantId).eq("enabled", true),
              )
              .take(1000);

      const requirements: Requirement[] = [];
      for (const rule of ruleRows) {
        if (!rule.name.startsWith("require.")) continue;
        const parsed = parseRequirement(rule);
        if (parsed instanceof UnsupportedRequirement) {
          return yield* Effect.fail(parsed);
        }
        requirements.push(parsed);
      }
      requirements.sort((a, b) => a.form.localeCompare(b.form));

      const entityRows = new Map<string, ReadonlyArray<CurrentAssert>>();
      const rowsForEntity = (e: string) =>
        Effect.gen(function* () {
          const cached = entityRows.get(e);
          if (cached !== undefined) return cached;
          const rows = yield* currentAsserts(e);
          entityRows.set(e, rows);
          return rows;
        });

      const hasValue = (e: string, a: string, v: unknown) =>
        Effect.gen(function* () {
          const rows = yield* rowsForEntity(e);
          return rows.some((row) => row.a === a && sameValue(row.v, v));
        });

      const hasSubmission = (form: string, scope: string) =>
        Effect.gen(function* () {
          const rows = yield* currentAsserts(worker, `submitted.${form}`);
          return rows.some((row) => sameValue(row.v, scope));
        });

      const items = new Map<string, DryRunResult["items"][number]>();
      for (const req of requirements) {
        for (const p of placements) {
          const scope = p.attrs[req.scopeAttr];
          if (scope === undefined) continue;
          if (req.guard !== undefined) {
            const ok = yield* hasValue(scope, req.guard.attr, req.guard.value);
            if (!ok) continue;
          }
          const decision = (yield* hasSubmission(req.form, scope))
            ? "reuse"
            : "collect";
          const key = `${req.form}\u0000${scope}`;
          const existing = items.get(key);
          const placementsForItem = [...(existing?.placements ?? []), p.id].sort();
          const source =
            existing?.source === "hypothetical" || p.source === "hypothetical"
              ? "hypothetical"
              : "existing";
          items.set(key, {
            form: req.form,
            scope,
            decision,
            source,
            placements: [...new Set(placementsForItem)],
            reason:
              decision === "reuse"
                ? `current submitted.${req.form} fact matches this scope`
                : `no current submitted.${req.form} fact matches this scope`,
          });
        }
      }

      const ordered = [...items.values()].sort((a, b) =>
        `${a.form}\u0000${a.scope}\u0000${a.decision}`.localeCompare(
          `${b.form}\u0000${b.scope}\u0000${b.decision}`,
        ),
      );
      const reuse = ordered.filter((i) => i.decision === "reuse").length;
      const collect = ordered.filter((i) => i.decision === "collect").length;
      return {
        worker,
        items: ordered,
        summary: { reuse, collect, total: ordered.length },
      };
    }).pipe(Effect.mapError(typedError)),
);

export const compliance = GroupImpl.make(api, "compliance").pipe(
  Layer.provide(dryRunWorkerCompliance),
);
