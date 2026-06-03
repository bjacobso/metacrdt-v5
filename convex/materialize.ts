import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { runWhere } from "./lib/engine";

/**
 * Reacts to a fact change: find enabled rules that depend on the changed
 * attribute, mark their prior derived output stale, and enqueue / run a
 * recomputation depending on each rule's materialization mode.
 */
export const processFactChange = internalMutation({
  args: {
    e: v.string(),
    a: v.string(),
    factId: v.id("facts"),
    txTime: v.number(),
  },
  handler: async (ctx, args) => {
    const enabled = await ctx.db
      .query("rules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    const affected = enabled.filter((r) =>
      r.dependsOnAttributes.includes(args.a),
    );

    for (const rule of affected) {
      // Mark this rule's existing derived facts stale.
      const derived = await ctx.db
        .query("derivedFacts")
        .withIndex("by_rule", (q) => q.eq("ruleId", rule._id))
        .collect();
      for (const d of derived) {
        if (!d.stale) await ctx.db.patch("derivedFacts", d._id, { stale: true });
      }

      await ctx.db.insert("ruleInvalidations", {
        ruleId: rule._id,
        e: args.e,
        causedByFactId: args.factId,
        txTime: args.txTime,
      });

      if (rule.materialization !== "manual") {
        await ctx.scheduler.runAfter(0, internal.materialize.recomputeRule, {
          ruleId: rule._id,
        });
      }
    }
  },
});

/**
 * Recompute a rule's derived facts from scratch against current state, then
 * clear processed invalidations. Idempotent: clears the rule's prior derived
 * facts and re-emits.
 */
export const recomputeRule = internalMutation({
  args: { ruleId: v.id("rules") },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get("rules", args.ruleId);
    if (!rule || !rule.enabled) return;

    const now = Date.now();
    const coord = { txTime: now, validTime: now };

    // Evaluate the rule body to bindings.
    const bindings = await runWhere(ctx, rule.where as unknown[][], coord);

    // Clear prior output for this rule.
    const prior = await ctx.db
      .query("derivedFacts")
      .withIndex("by_rule", (q) => q.eq("ruleId", args.ruleId))
      .collect();
    for (const d of prior) {
      await ctx.db.delete("derivedFacts", d._id);
    }

    // Emit fresh derived facts. emit.e / emit.v may reference variables.
    for (const b of bindings) {
      const e = resolveTerm(rule.emit.e, b);
      const value = resolveTerm(rule.emit.v, b);
      if (e === undefined) continue;
      await ctx.db.insert("derivedFacts", {
        ruleId: rule._id,
        e: String(e),
        a: rule.emit.a,
        v: value,
        sourceFactIds: [],
        derivedAt: now,
        validFrom: now,
        txWatermark: now,
        stale: false,
      });
    }

    // Clear processed invalidations for this rule.
    const invalidations = await ctx.db
      .query("ruleInvalidations")
      .withIndex("by_rule_processed", (q) =>
        q.eq("ruleId", args.ruleId).eq("processedAt", undefined),
      )
      .collect();
    for (const inv of invalidations) {
      await ctx.db.patch("ruleInvalidations", inv._id, { processedAt: now });
    }
  },
});

/** Resolve an emit term: `?var` reads from the binding, else it's a constant. */
function resolveTerm(term: unknown, binding: Record<string, unknown>): unknown {
  if (typeof term === "string" && term.startsWith("?")) {
    return binding[term.slice(1)];
  }
  return term;
}
