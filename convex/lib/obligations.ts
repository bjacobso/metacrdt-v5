import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { LIMITS, solveWhere, type Binding } from "./engine";
import {
  eventLogTripleSource,
  eventLogTripleSourceForTenant,
} from "./eventLogTripleSource";

type Ctx = QueryCtx | MutationCtx;

export type Obligation = {
  e: string;
  form: string;
  scope: string;
  open: boolean;
  sourceFactIds: Id<"facts">[];
  sourceEventIds: string[];
};

function isComplianceRule(rule: Doc<"rules">): boolean {
  return rule.name.startsWith("require.") || rule.name.startsWith("task.");
}

function isObligationAttr(a: string): boolean {
  return a.startsWith("requires.") || a.startsWith("task.");
}

function resolveEmitTerm(term: unknown, binding: Binding): unknown {
  if (typeof term === "string" && term.startsWith("?")) {
    return binding[term.slice(1)];
  }
  return term;
}

function mergeIds<T extends string>(a: T[], b: T[]): T[] {
  if (b.length === 0) return a;
  const set = new Set<T>(a);
  for (const id of b) set.add(id);
  return [...set];
}

export async function enabledComplianceRules(
  ctx: Ctx,
  tenantId?: Id<"tenants">,
): Promise<Doc<"rules">[]> {
  const enabled = await ctx.db
    .query("rules")
    .withIndex("by_enabled", (q) => q.eq("enabled", true))
    .take(500);
  return enabled.filter(
    (rule) =>
      isComplianceRule(rule) &&
      (tenantId === undefined ? true : rule.tenantId === tenantId),
  );
}

/**
 * Resolve the currently-required compliance obligations directly from
 * protocol-shaped `factEvents`.
 *
 * This is intentionally read-only: the rule body is solved against the event-log
 * base fact source and each rule's `emit` shape is resolved in memory. It does
 * not read or write the materialized `derivedFacts` projection.
 */
export async function obligationsFromEventLog(
  ctx: Ctx,
  args: {
    rules?: Doc<"rules">[];
    tenantId?: Id<"tenants">;
    worker?: string;
    now?: number;
    limit?: number;
  } = {},
): Promise<Obligation[]> {
  const rules = args.rules ?? (await enabledComplianceRules(ctx, args.tenantId));
  const now = args.now ?? Date.now();
  const limit = args.limit ?? LIMITS.maxResultRows;
  const coord = { txTime: now, validTime: now };
  const byKey = new Map<string, Obligation>();
  const source =
    args.tenantId === undefined
      ? eventLogTripleSource
      : eventLogTripleSourceForTenant(args.tenantId);

  for (const rule of rules) {
    if (rule.emit === undefined || !isObligationAttr(rule.emit.a)) continue;
    const solved = await solveWhere(
      ctx,
      (rule.where ?? []) as unknown[],
      coord,
      {},
      { source },
    );
    for (const solution of solved) {
      const rawE = resolveEmitTerm(rule.emit.e, solution.binding);
      if (rawE === undefined || rawE === null) continue;
      const e = String(rawE);
      if (args.worker !== undefined && e !== args.worker) continue;
      const rawScope = resolveEmitTerm(rule.emit.v, solution.binding);
      if (rawScope === undefined || rawScope === null) continue;
      const scope = String(rawScope);
      const open = rule.emit.a.startsWith("task.");
      const form = rule.emit.a.replace(/^(requires|task)\./, "");
      const key = `${e}\u0000${form}\u0000${scope}\u0000${open ? "task" : "requires"}`;
      const existing = byKey.get(key);
      if (existing === undefined) {
        byKey.set(key, {
          e,
          form,
          scope,
          open,
          sourceFactIds: solution.sources,
          sourceEventIds: solution.eventSources ?? [],
        });
      } else {
        byKey.set(key, {
          ...existing,
          sourceFactIds: mergeIds(existing.sourceFactIds, solution.sources),
          sourceEventIds: mergeIds(existing.sourceEventIds, solution.eventSources ?? []),
        });
      }
      if (byKey.size >= limit) return [...byKey.values()];
    }
  }

  return [...byKey.values()].sort((a, b) =>
    `${a.e}\u0000${a.form}\u0000${a.scope}\u0000${a.open ? "1" : "0"}`.localeCompare(
      `${b.e}\u0000${b.form}\u0000${b.scope}\u0000${b.open ? "1" : "0"}`,
    ),
  );
}
