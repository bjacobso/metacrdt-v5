import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";

import api from "./_generated/api";
import { DatabaseReader } from "./_generated/services";
import {
  InvalidPlacement,
  UnsupportedRequirement,
  UnknownWorker,
  type DryRunComplianceResult,
} from "./compliance.spec";
import type { CurrentFacts } from "./tables/CurrentFacts";
import type { Rules } from "./tables/Rules";

type CurrentFactDoc = typeof CurrentFacts.Doc.Type;
type RuleDoc = typeof Rules.Doc.Type;
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

function isPattern(x: unknown): x is [unknown, unknown, unknown] {
  return Array.isArray(x) && x.length === 3;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function typedError(
  err: unknown,
): UnknownWorker | InvalidPlacement | UnsupportedRequirement {
  if (
    err instanceof UnknownWorker ||
    err instanceof InvalidPlacement ||
    err instanceof UnsupportedRequirement
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
  rows: ReadonlyArray<CurrentFactDoc>,
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
  ({ worker, placement }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;

      const workerRows = yield* reader
        .table("currentFacts")
        .index("by_e", (q) => q.eq("e", worker))
        .take(1000);
      if (workerRows.length === 0) {
        return yield* Effect.fail(new UnknownWorker({ worker }));
      }

      const placements: PlacementContext[] = [];
      const existingPlacementRows = yield* reader
        .table("currentFacts")
        .index("by_a_v", (q) => q.eq("a", "worker").eq("v", worker))
        .take(500);
      const placementIds = [...new Set(existingPlacementRows.map((r) => r.e))].sort();
      for (const id of placementIds) {
        const rows = yield* reader
          .table("currentFacts")
          .index("by_e", (q) => q.eq("e", id))
          .take(1000);
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

      const ruleRows = yield* reader
        .table("rules")
        .index("by_enabled", (q) => q.eq("enabled", true))
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

      const entityRows = new Map<string, ReadonlyArray<CurrentFactDoc>>();
      const rowsForEntity = (e: string) =>
        Effect.gen(function* () {
          const cached = entityRows.get(e);
          if (cached !== undefined) return cached;
          const rows = yield* reader
            .table("currentFacts")
            .index("by_e", (q) => q.eq("e", e))
            .take(1000);
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
          const rows = yield* reader
            .table("currentFacts")
            .index("by_e_a_v", (q) =>
              q.eq("e", worker).eq("a", `submitted.${form}`).eq("v", scope),
            )
            .take(1);
          return rows.length > 0;
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
