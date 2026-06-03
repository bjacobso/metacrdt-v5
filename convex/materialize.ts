import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { isEntityLocalRule, runWhere } from "./lib/engine";

/**
 * Reacts to a fact change: find enabled rules that depend on the changed
 * attribute and schedule recomputation. Entity-local rules recompute only for
 * the changed entity (incremental); cross-entity rules recompute in full. Each
 * scheduled change is recorded in ruleInvalidations and cleared once processed.
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
      await ctx.db.insert("ruleInvalidations", {
        ruleId: rule._id,
        e: args.e,
        causedByFactId: args.factId,
        txTime: args.txTime,
      });

      if (rule.materialization === "manual") continue;

      if (isEntityLocalRule(rule.where as unknown[][], rule.emit.e)) {
        // Incremental: only this entity's derived output can have changed.
        await markEntityDerivedStale(ctx, rule._id, args.e);
        await ctx.scheduler.runAfter(
          0,
          internal.materialize.recomputeRuleForEntity,
          { ruleId: rule._id, e: args.e },
        );
      } else {
        // Cross-entity join: a change anywhere can affect any output row.
        await markAllDerivedStale(ctx, rule._id);
        await ctx.scheduler.runAfter(0, internal.materialize.recomputeRule, {
          ruleId: rule._id,
        });
      }
    }
  },
});

/** Full recompute of a rule's derived facts against current state. */
export const recomputeRule = internalMutation({
  args: { ruleId: v.id("rules") },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get("rules", args.ruleId);
    if (!rule || !rule.enabled) return;

    const now = Date.now();
    const coord = { txTime: now, validTime: now };
    const bindings = await runWhere(ctx, rule.where as unknown[][], coord);

    // Clear all prior output for this rule, then re-emit.
    const prior = await ctx.db
      .query("derivedFacts")
      .withIndex("by_rule", (q) => q.eq("ruleId", args.ruleId))
      .collect();
    for (const d of prior) await ctx.db.delete("derivedFacts", d._id);

    for (const b of bindings) {
      await emitDerived(ctx, rule, b, now);
    }

    await clearInvalidations(ctx, args.ruleId, now);
  },
});

/**
 * Incremental recompute scoped to one entity. Only valid for entity-local
 * rules — seeds the rule's entity variable to `e` so the join touches only
 * facts about that entity, and replaces just that entity's derived output.
 */
export const recomputeRuleForEntity = internalMutation({
  args: { ruleId: v.id("rules"), e: v.string() },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get("rules", args.ruleId);
    if (!rule || !rule.enabled) return;
    const entityVar = rule.emit.e.startsWith("?")
      ? rule.emit.e.slice(1)
      : null;
    if (entityVar === null) {
      // Not entity-local after all; fall back to a full recompute.
      await ctx.scheduler.runAfter(0, internal.materialize.recomputeRule, {
        ruleId: args.ruleId,
      });
      return;
    }

    const now = Date.now();
    const coord = { txTime: now, validTime: now };
    const bindings = await runWhere(ctx, rule.where as unknown[][], coord, {
      [entityVar]: args.e,
    });

    // Replace just this entity's derived output for this rule.
    const prior = await ctx.db
      .query("derivedFacts")
      .withIndex("by_rule_e", (q) =>
        q.eq("ruleId", args.ruleId).eq("e", args.e),
      )
      .collect();
    for (const d of prior) await ctx.db.delete("derivedFacts", d._id);

    for (const b of bindings) {
      await emitDerived(ctx, rule, b, now);
    }

    await clearInvalidations(ctx, args.ruleId, now, args.e);
  },
});

// --- helpers ----------------------------------------------------------------

async function emitDerived(
  ctx: MutationCtx,
  rule: Doc<"rules">,
  binding: Record<string, unknown>,
  now: number,
): Promise<void> {
  const e = resolveTerm(rule.emit.e, binding);
  const value = resolveTerm(rule.emit.v, binding);
  if (e === undefined || e === null) return;
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

async function markEntityDerivedStale(
  ctx: MutationCtx,
  ruleId: Id<"rules">,
  e: string,
): Promise<void> {
  const rows = await ctx.db
    .query("derivedFacts")
    .withIndex("by_rule_e", (q) => q.eq("ruleId", ruleId).eq("e", e))
    .collect();
  for (const d of rows) {
    if (!d.stale) await ctx.db.patch("derivedFacts", d._id, { stale: true });
  }
}

async function markAllDerivedStale(
  ctx: MutationCtx,
  ruleId: Id<"rules">,
): Promise<void> {
  const rows = await ctx.db
    .query("derivedFacts")
    .withIndex("by_rule", (q) => q.eq("ruleId", ruleId))
    .collect();
  for (const d of rows) {
    if (!d.stale) await ctx.db.patch("derivedFacts", d._id, { stale: true });
  }
}

async function clearInvalidations(
  ctx: MutationCtx,
  ruleId: Id<"rules">,
  now: number,
  e?: string,
): Promise<void> {
  const pending = await ctx.db
    .query("ruleInvalidations")
    .withIndex("by_rule_processed", (q) =>
      q.eq("ruleId", ruleId).eq("processedAt", undefined),
    )
    .collect();
  for (const inv of pending) {
    if (e !== undefined && inv.e !== e) continue;
    await ctx.db.patch("ruleInvalidations", inv._id, { processedAt: now });
  }
}

/** Resolve an emit term: `?var` reads from the binding, else it's a constant. */
function resolveTerm(term: unknown, binding: Record<string, unknown>): unknown {
  if (typeof term === "string" && term.startsWith("?")) {
    return binding[term.slice(1)];
  }
  return term;
}
