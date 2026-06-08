import { query } from "./_generated/server";
import { v } from "convex/values";
import {
  LIMITS,
  aggregateBindings,
  describeClauses,
  project,
  runWhere,
} from "./lib/engine";

// A clause is a [e, a, v] triple, a [term, op, term] comparison,
// { compute: [op, ...args], as?: term } deterministic computed predicate,
// { not: [e, a, v] } negation, or { or: [[...clauses], ...] } disjunction —
// so clauses are heterogeneous (array | object).
const whereValidator = v.array(v.any());

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

/** Classify a query's clauses without running it. Join order is dynamic. */
export const explainDatalog = query({
  args: { where: whereValidator },
  handler: async (ctx, args) => {
    return {
      limits: LIMITS,
      note: "Pattern join order is chosen dynamically by selectivity at run time; filters/projections (compare/compute/not) run as soon as their input variables are bound.",
      clauses: describeClauses(args.where),
    };
  },
});
