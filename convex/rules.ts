import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

/**
 * Define (or replace by name) a Datalog rule whose output is materialized into
 * derivedFacts. `emit.e` and `emit.v` may reference variables bound by `where`
 * (e.g. "?e"); `emit.a` is the derived attribute name.
 */
export const defineRule = mutation({
  args: {
    name: v.string(),
    where: v.array(v.any()),
    emit: v.object({ e: v.string(), a: v.string(), v: v.any() }),
    dependsOnAttributes: v.array(v.string()),
    materialization: v.optional(
      v.union(v.literal("sync"), v.literal("async"), v.literal("manual")),
    ),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("rules")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    const fields = {
      name: args.name,
      kind: "datalog" as const,
      where: args.where,
      emit: args.emit,
      dependsOnAttributes: args.dependsOnAttributes,
      materialization: args.materialization ?? "async",
      enabled: args.enabled ?? true,
      updatedAt: now,
    };

    let ruleId;
    if (existing) {
      await ctx.db.patch("rules", existing._id, fields);
      ruleId = existing._id;
    } else {
      ruleId = await ctx.db.insert("rules", { ...fields, createdAt: now });
    }

    // Materialize immediately so derived facts are available right away.
    await ctx.scheduler.runAfter(0, internal.materialize.recomputeRule, {
      ruleId,
    });
    return { ruleId };
  },
});

/**
 * Define (or replace by name) a transitive-closure rule. Materializes the
 * closure of `baseAttribute` (e.g. "reportsTo") into derived facts under
 * `closureAttribute` (e.g. "reportsTo+"), which Datalog can then query like any
 * other attribute. Recomputed asynchronously whenever the base attribute changes.
 */
export const defineTransitiveRule = mutation({
  args: {
    name: v.string(),
    baseAttribute: v.string(),
    closureAttribute: v.string(),
    maxDepth: v.optional(v.number()),
    reflexive: v.optional(v.boolean()),
    enabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("rules")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    const fields = {
      name: args.name,
      kind: "closure" as const,
      closure: {
        baseAttribute: args.baseAttribute,
        closureAttribute: args.closureAttribute,
        maxDepth: args.maxDepth ?? 16,
        reflexive: args.reflexive,
      },
      dependsOnAttributes: [args.baseAttribute],
      materialization: "async" as const,
      enabled: args.enabled ?? true,
      updatedAt: now,
    };

    let ruleId;
    if (existing) {
      await ctx.db.patch("rules", existing._id, fields);
      ruleId = existing._id;
    } else {
      ruleId = await ctx.db.insert("rules", { ...fields, createdAt: now });
    }

    await ctx.scheduler.runAfter(
      0,
      internal.materialize.recomputeTransitiveClosure,
      { ruleId },
    );
    return { ruleId };
  },
});

export const recomputeRule = mutation({
  args: { ruleId: v.id("rules") },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(0, internal.materialize.recomputeRule, {
      ruleId: args.ruleId,
    });
    return null;
  },
});

export const listRules = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("rules").take(200);
  },
});

/** Current derived facts for an entity (the materialized rule output). */
export const derivedForEntity = query({
  args: { e: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("derivedFacts")
      .withIndex("by_e_a", (q) => q.eq("e", args.e))
      .take(500);
    return rows.filter((r) => !r.stale);
  },
});
