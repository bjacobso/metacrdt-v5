import { query } from "./_generated/server";
import { v } from "convex/values";
import { LIMITS, describeClauses, project, runWhere } from "./lib/engine";

// A clause is a [e, a, v] triple, a [term, op, term] comparison, or a
// { not: [e, a, v] } negation — so clauses are heterogeneous (array | object).
const whereValidator = v.array(v.any());

/**
 * Bounded, non-recursive Datalog over facts ∪ materialized derived facts.
 * Supports fact patterns, comparison predicates (>, <, >=, <=, ==, !=), and
 * negation ({ not: [...] }).
 *
 *   datalog({
 *     where: [
 *       ["?e", "type", "Employee"],
 *       ["?e", "salary", "?s"],
 *       ["?s", ">", 100000],
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
    const bindings = await runWhere(ctx, args.where, coord);
    const rows = project(bindings, args.select);
    if (rows.length > LIMITS.maxResultRows) {
      throw new Error(
        `query produced ${rows.length} rows, exceeding maxResultRows=${LIMITS.maxResultRows}`,
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
      note: "Pattern join order is chosen dynamically by selectivity at run time; filters (compare/not) run as soon as their variables are bound.",
      clauses: describeClauses(args.where),
    };
  },
});
