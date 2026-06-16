import { query } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  LIMITS,
  aggregateBindings,
  derivedRowsFromBindings,
  describeClauses,
  paginateRows,
  project,
  runWhere,
  solveWhere,
} from "./lib/engine";
import {
  eventLogBaseWithDerivedTripleSource,
  eventLogBaseWithDerivedTripleSourceForTenant,
  eventLogTripleSource,
  eventLogTripleSourceForTenant,
} from "./lib/eventLogTripleSource";
import { tenantOrLegacyRead } from "./lib/tenantAuth";

// A clause is a [e, a, v] triple, a [term, op, term] comparison,
// { compute: [op, ...args], as?: term } deterministic computed predicate,
// { not: [e, a, v] } negation, or { or: [[...clauses], ...] } disjunction —
// so clauses are heterogeneous (array | object).
const whereValidator = v.array(v.any());
const emitValidator = v.object({ e: v.string(), a: v.string(), v: v.any() });

async function tripleSource(
  ctx: Parameters<typeof runWhere>[0],
  tenantSlug: string | undefined,
  includeDerived: boolean,
) {
  const tenant = await tenantOrLegacyRead(ctx, tenantSlug);
  if (tenant === null) {
    return includeDerived
      ? eventLogBaseWithDerivedTripleSource
      : eventLogTripleSource;
  }
  return includeDerived
    ? eventLogBaseWithDerivedTripleSourceForTenant(tenant.tenantId)
    : eventLogTripleSourceForTenant(tenant.tenantId);
}

/**
 * Bounded, non-recursive Datalog over base facts folded from protocol-shaped
 * `factEvents` ∪ materialized derived facts.
 * Supports fact patterns, comparison predicates (>, <, >=, <=, ==, !=),
 * deterministic computed predicates
 * ({ compute: ["+", "?salary", "?bonus"], as: "?total" } or
 *  { compute: ["contains", "?lowerName", "maria"] }),
 * negation ({ not: [...] }), and bounded disjunction
 * ({ or: [[...clauses], [...clauses]] }).
 *
 *   datalog({
 *     where: [
 *       ["?e", "type", "Employee"],
 *       ["?e", "salary", "?s"],
 *       ["?e", "bonus", "?b"],
 *       { compute: ["+", "?s", "?b"], as: "?total" },
 *       ["?total", ">", 100000],
 *       {
 *         or: [
 *           [["?e", "worker.status", "active"]],
 *           [["?e", "worker.status", "pending"]],
 *         ],
 *       },
 *       { not: ["?e", "status", "terminated"] },
 *     ],
 *     select: ["?e", "?s"],
 *   })
 */
export const datalog = query({
  args: {
    where: whereValidator,
    select: v.array(v.string()),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: await tripleSource(ctx, args.tenantSlug, true),
    });
    const rows = project(bindings, args.select);
    if (rows.length > LIMITS.maxResultRows) {
      throw new Error(
        `query produced ${rows.length} rows, exceeding maxResultRows=${LIMITS.maxResultRows}`,
      );
    }
    return rows;
  },
});

/**
 * Bounded Datalog over base facts folded directly from protocol-shaped
 * `factEvents`. This proof/read-model surface intentionally excludes
 * materialized `derivedFacts`; production `datalog` uses the event-log-base +
 * derived source.
 */
export const datalogFromEventLog = query({
  args: {
    where: whereValidator,
    select: v.array(v.string()),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: await tripleSource(ctx, args.tenantSlug, false),
    });
    const rows = project(bindings, args.select);
    if (rows.length > LIMITS.maxResultRows) {
      throw new Error(
        `query produced ${rows.length} rows, exceeding maxResultRows=${LIMITS.maxResultRows}`,
      );
    }
    return rows;
  },
});

/**
 * Bounded Datalog over base facts folded from protocol `factEvents` plus the
 * existing materialized `derivedFacts` projection. This is the production source
 * shape kept as an explicit API for comparison and migration tests.
 */
export const datalogFromEventLogWithDerived = query({
  args: {
    where: whereValidator,
    select: v.array(v.string()),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: await tripleSource(ctx, args.tenantSlug, true),
    });
    const rows = project(bindings, args.select);
    if (rows.length > LIMITS.maxResultRows) {
      throw new Error(
        `query produced ${rows.length} rows, exceeding maxResultRows=${LIMITS.maxResultRows}`,
      );
    }
    return rows;
  },
});

/**
 * Paginated Datalog over projected result rows. This uses the same where/select
 * semantics as `datalog`, but returns a Convex-style page object over the
 * deterministic projected rows instead of requiring the whole result set in one
 * response. The cursor is an engine cursor, not a database cursor.
 */
export const datalogPage = query({
  args: {
    where: whereValidator,
    select: v.array(v.string()),
    paginationOpts: paginationOptsValidator,
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: await tripleSource(ctx, args.tenantSlug, true),
    });
    return paginateRows(project(bindings, args.select), args.paginationOpts);
  },
});

/** Paginated variant of `datalogFromEventLog` over deterministic projected rows. */
export const datalogPageFromEventLog = query({
  args: {
    where: whereValidator,
    select: v.array(v.string()),
    paginationOpts: paginationOptsValidator,
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: await tripleSource(ctx, args.tenantSlug, false),
    });
    return paginateRows(project(bindings, args.select), args.paginationOpts);
  },
});

/**
 * Paginated variant of `datalogFromEventLogWithDerived` over deterministic
 * projected rows. Base facts come from the protocol event log; derived facts
 * still come from materialized `derivedFacts`.
 */
export const datalogPageFromEventLogWithDerived = query({
  args: {
    where: whereValidator,
    select: v.array(v.string()),
    paginationOpts: paginationOptsValidator,
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: await tripleSource(ctx, args.tenantSlug, true),
    });
    return paginateRows(project(bindings, args.select), args.paginationOpts);
  },
});

/**
 * Aggregation over a Datalog body: solve the `where`, group by `groupBy`
 * variables, and compute aggregates per group.
 *
 *   aggregate({
 *     where: [["?e", "type", "Employee"], ["?e", "dept", "?d"], ["?e", "salary", "?s"]],
 *     groupBy: ["?d"],
 *     aggregates: [
 *       { op: "count", as: "headcount" },
 *       { op: "sum", var: "?s", as: "payroll" },
 *       { op: "avg", var: "?s", as: "avgSalary" },
 *     ],
 *   })
 */
export const aggregate = query({
  args: {
    where: whereValidator,
    groupBy: v.optional(v.array(v.string())),
    aggregates: v.array(
      v.object({
        op: v.union(
          v.literal("count"),
          v.literal("countDistinct"),
          v.literal("sum"),
          v.literal("avg"),
          v.literal("min"),
          v.literal("max"),
        ),
        var: v.optional(v.string()),
        as: v.string(),
      }),
    ),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: await tripleSource(ctx, args.tenantSlug, true),
    });
    const rows = aggregateBindings(bindings, args.groupBy ?? [], args.aggregates);
    if (rows.length > LIMITS.maxResultRows) {
      throw new Error(
        `aggregate produced ${rows.length} groups, exceeding maxResultRows=${LIMITS.maxResultRows}`,
      );
    }
    return rows;
  },
});

/** Aggregation variant of `datalogFromEventLog` over base protocol event facts. */
export const aggregateFromEventLog = query({
  args: {
    where: whereValidator,
    groupBy: v.optional(v.array(v.string())),
    aggregates: v.array(
      v.object({
        op: v.union(
          v.literal("count"),
          v.literal("countDistinct"),
          v.literal("sum"),
          v.literal("avg"),
          v.literal("min"),
          v.literal("max"),
        ),
        var: v.optional(v.string()),
        as: v.string(),
      }),
    ),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: await tripleSource(ctx, args.tenantSlug, false),
    });
    const rows = aggregateBindings(bindings, args.groupBy ?? [], args.aggregates);
    if (rows.length > LIMITS.maxResultRows) {
      throw new Error(
        `aggregate produced ${rows.length} groups, exceeding maxResultRows=${LIMITS.maxResultRows}`,
      );
    }
    return rows;
  },
});

/**
 * Aggregation variant of `datalogFromEventLogWithDerived`. Base facts come from
 * protocol events; derived facts still come from the `derivedFacts` projection.
 */
export const aggregateFromEventLogWithDerived = query({
  args: {
    where: whereValidator,
    groupBy: v.optional(v.array(v.string())),
    aggregates: v.array(
      v.object({
        op: v.union(
          v.literal("count"),
          v.literal("countDistinct"),
          v.literal("sum"),
          v.literal("avg"),
          v.literal("min"),
          v.literal("max"),
        ),
        var: v.optional(v.string()),
        as: v.string(),
      }),
    ),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: await tripleSource(ctx, args.tenantSlug, true),
    });
    const rows = aggregateBindings(bindings, args.groupBy ?? [], args.aggregates);
    if (rows.length > LIMITS.maxResultRows) {
      throw new Error(
        `aggregate produced ${rows.length} groups, exceeding maxResultRows=${LIMITS.maxResultRows}`,
      );
    }
    return rows;
  },
});

/** Paginated variant of `aggregate` over the deterministic group rows. */
export const aggregatePage = query({
  args: {
    where: whereValidator,
    groupBy: v.optional(v.array(v.string())),
    aggregates: v.array(
      v.object({
        op: v.union(
          v.literal("count"),
          v.literal("countDistinct"),
          v.literal("sum"),
          v.literal("avg"),
          v.literal("min"),
          v.literal("max"),
        ),
        var: v.optional(v.string()),
        as: v.string(),
      }),
    ),
    paginationOpts: paginationOptsValidator,
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: await tripleSource(ctx, args.tenantSlug, true),
    });
    return paginateRows(
      aggregateBindings(bindings, args.groupBy ?? [], args.aggregates),
      args.paginationOpts,
    );
  },
});

/** Paginated aggregation variant of `aggregateFromEventLogWithDerived`. */
export const aggregatePageFromEventLogWithDerived = query({
  args: {
    where: whereValidator,
    groupBy: v.optional(v.array(v.string())),
    aggregates: v.array(
      v.object({
        op: v.union(
          v.literal("count"),
          v.literal("countDistinct"),
          v.literal("sum"),
          v.literal("avg"),
          v.literal("min"),
          v.literal("max"),
        ),
        var: v.optional(v.string()),
        as: v.string(),
      }),
    ),
    paginationOpts: paginationOptsValidator,
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: await tripleSource(ctx, args.tenantSlug, true),
    });
    return paginateRows(
      aggregateBindings(bindings, args.groupBy ?? [], args.aggregates),
      args.paginationOpts,
    );
  },
});

/** Paginated aggregation variant of `aggregateFromEventLog`. */
export const aggregatePageFromEventLog = query({
  args: {
    where: whereValidator,
    groupBy: v.optional(v.array(v.string())),
    aggregates: v.array(
      v.object({
        op: v.union(
          v.literal("count"),
          v.literal("countDistinct"),
          v.literal("sum"),
          v.literal("avg"),
          v.literal("min"),
          v.literal("max"),
        ),
        var: v.optional(v.string()),
        as: v.string(),
      }),
    ),
    paginationOpts: paginationOptsValidator,
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: await tripleSource(ctx, args.tenantSlug, false),
    });
    return paginateRows(
      aggregateBindings(bindings, args.groupBy ?? [], args.aggregates),
      args.paginationOpts,
    );
  },
});

/**
 * Read-only rule-output proof over base facts folded directly from
 * protocol-shaped `factEvents`. This solves a rule body and resolves its `emit`
 * shape without writing `derivedFacts`; materialization still owns production
 * derived rows and provenance.
 */
export const deriveFromEventLog = query({
  args: {
    where: whereValidator,
    emit: emitValidator,
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const solved = await solveWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: await tripleSource(ctx, args.tenantSlug, false),
    });
    const rows = derivedRowsFromBindings(
      solved.map((s) => s.binding),
      args.emit,
    );
    if (rows.length > LIMITS.maxResultRows) {
      throw new Error(
        `rule derivation produced ${rows.length} rows, exceeding maxResultRows=${LIMITS.maxResultRows}`,
      );
    }
    return rows;
  },
});

/** Classify a query's clauses without running it. Join order is dynamic. */
export const explainDatalog = query({
  args: { where: whereValidator },
  handler: async (ctx, args) => {
    return {
      limits: LIMITS,
      note: "Pattern join order is chosen dynamically by selectivity at run time; filters/projections (compare/compute/not) run as soon as their input variables are bound. datalogPage/aggregatePage page deterministic projected rows with engine cursors.",
      clauses: describeClauses(args.where),
    };
  },
});
