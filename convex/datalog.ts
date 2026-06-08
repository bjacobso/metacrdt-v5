import { query } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { fromEvents, visibleAsserts, type Event } from "@metacrdt/core";
import {
  protocolEventFromRows,
  type ConvexTransactionRow,
  type ProtocolFactEventRow,
} from "@metacrdt/convex";
import {
  LIMITS,
  aggregateBindings,
  describeClauses,
  paginateRows,
  project,
  runWhere,
  type PatternInput,
  type Triple,
  type TripleSource,
} from "./lib/engine";
import { valueKey } from "./lib/visibility";
import { canReadAttribute } from "./lib/readAuth";

// A clause is a [e, a, v] triple, a [term, op, term] comparison,
// { compute: [op, ...args], as?: term } deterministic computed predicate,
// { not: [e, a, v] } negation, or { or: [[...clauses], ...] } disjunction —
// so clauses are heterogeneous (array | object).
const whereValidator = v.array(v.any());

function txForCore(tx: Doc<"transactions">): ConvexTransactionRow {
  return {
    _creationTime: tx._creationTime,
    actorId: tx.actorId,
    actorType: tx.actorType,
    txTime: tx.txTime,
    reason: tx.reason,
  };
}

function rowForCore(row: Doc<"factEvents">): ProtocolFactEventRow {
  return {
    txTime: row.txTime,
    eventId: row.eventId,
    hlc: row.hlc,
    replicaId: row.replicaId,
    seq: row.seq,
    targetEventId: row.targetEventId,
    causalRefs: row.causalRefs,
    kind: row.kind,
    e: row.e,
    a: row.a,
    v: row.v,
    validFrom: row.validFrom,
    validTo: row.validTo,
    reason: row.reason,
  };
}

async function protocolEventsForRows(
  ctx: Parameters<TripleSource>[0],
  rows: Doc<"factEvents">[],
): Promise<Event[]> {
  const events: Event[] = [];
  for (const row of rows) {
    const tx = await ctx.db.get(row.txId);
    if (tx === null) continue;
    const ev = protocolEventFromRows(rowForCore(row), txForCore(tx));
    if (ev !== null) events.push(ev);
  }
  return events;
}

async function fetchCandidateFactEvents(
  ctx: Parameters<TripleSource>[0],
  input: PatternInput,
): Promise<Doc<"factEvents">[]> {
  const { eConst, aConst } = input;
  const n = LIMITS.maxClauseScan;
  if (eConst !== undefined && aConst !== undefined) {
    return await ctx.db
      .query("factEvents")
      .withIndex("by_e_a_tx", (q) =>
        q.eq("e", String(eConst)).eq("a", String(aConst)),
      )
      .take(n);
  }
  if (aConst !== undefined) {
    return await ctx.db
      .query("factEvents")
      .withIndex("by_a_tx", (q) => q.eq("a", String(aConst)))
      .take(n);
  }
  if (eConst !== undefined) {
    return await ctx.db
      .query("factEvents")
      .withIndex("by_e", (q) => q.eq("e", String(eConst)))
      .take(n);
  }
  throw new Error(
    "unbounded clause: each pattern must resolve its entity or attribute to a constant (directly or via an earlier join)",
  );
}

const eventLogTripleSource: TripleSource = async (
  ctx,
  input,
  coord,
  readFilter,
) => {
  const rows = await fetchCandidateFactEvents(ctx, input);
  const events = await protocolEventsForRows(ctx, rows);
  const log = fromEvents(events);
  const keys =
    input.eConst !== undefined && input.aConst !== undefined
      ? [[String(input.eConst), String(input.aConst)] as const]
      : [...new Set(events.flatMap((ev) =>
          ev.kind === "assert" && ev.e !== undefined && ev.a !== undefined
            ? [`${ev.e}\u0000${ev.a}`]
            : [],
        ))].map((k) => k.split("\u0000") as [string, string]);

  const out: Triple[] = [];
  for (const [e, a] of keys) {
    for (const ev of visibleAsserts(e, a, coord, log)) {
      if (
        input.vIsConst &&
        valueKey(ev.v) !== valueKey(input.vConst)
      ) {
        continue;
      }
      if (
        readFilter !== null &&
        !(await canReadAttribute(ctx, readFilter.principal, ev.e!, ev.a!))
      ) {
        continue;
      }
      out.push({ e: ev.e!, a: ev.a!, v: ev.v, prov: [] });
    }
  }
  return out;
};

/**
 * Bounded, non-recursive Datalog over facts ∪ materialized derived facts.
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
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
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
 * `factEvents`. This is a proof/read-model surface for the projection-retirement
 * path: it reuses the same solver but swaps the triple source from `facts` to the
 * append-only event log. Materialized `derivedFacts` are intentionally excluded
 * in this slice; the production `datalog` query remains facts ∪ derivedFacts.
 */
export const datalogFromEventLog = query({
  args: {
    where: whereValidator,
    select: v.array(v.string()),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
      source: eventLogTripleSource,
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
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
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
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
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
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const bindings = await runWhere(ctx, args.where, coord, {}, {
      enforceReadAuth: true,
    });
    return paginateRows(
      aggregateBindings(bindings, args.groupBy ?? [], args.aggregates),
      args.paginationOpts,
    );
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
