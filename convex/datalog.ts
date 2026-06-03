import { query } from "./_generated/server";
import { v } from "convex/values";
import { LIMITS, planWhere, project, runWhere } from "./lib/engine";

const whereValidator = v.array(v.array(v.any()));

/**
 * Bounded, non-recursive Datalog over the bitemporal fact log.
 *
 *   datalog({
 *     where: [
 *       ["?e", "type", "Employee"],
 *       ["?e", "employee.status", "active"],
 *       ["?e", "employee.manager", "?m"],
 *       ["?m", "user.email", "ben@example.com"],
 *     ],
 *     select: ["?e"],
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

/** Return the chosen execution plan without running it. */
export const explainDatalog = query({
  args: { where: whereValidator },
  handler: async (ctx, args) => {
    const plan = planWhere(args.where);
    return {
      limits: LIMITS,
      clauseOrder: plan.order,
      clauses: plan.order.map((i) => {
        const c = plan.clauses[i];
        const fmt = (t: { kind: string; name?: string; value?: unknown }) =>
          t.kind === "var" ? `?${t.name}` : JSON.stringify(t.value);
        return {
          index: i,
          e: fmt(c.e),
          a: fmt(c.a),
          v: fmt(c.v),
        };
      }),
    };
  },
});
