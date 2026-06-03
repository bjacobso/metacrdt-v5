import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Register (or update by name) the typed schema for a predicate. Cardinality
 * is the one that matters operationally: `one` makes assertFact retract the
 * prior current fact for an (e, a) before asserting the new value; `many`
 * (the default when no attribute is registered) lets multiple values coexist.
 */
export const defineAttribute = mutation({
  args: {
    name: v.string(),
    valueType: v.union(
      v.literal("string"),
      v.literal("number"),
      v.literal("boolean"),
      v.literal("entityRef"),
      v.literal("date"),
      v.literal("json"),
    ),
    cardinality: v.union(v.literal("one"), v.literal("many")),
    unique: v.optional(v.boolean()),
    indexed: v.optional(v.boolean()),
    materialized: v.optional(v.boolean()),
    inverseAttribute: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("attributes")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();

    if (existing) {
      await ctx.db.patch("attributes", existing._id, args);
      return { attributeId: existing._id, created: false };
    }
    const attributeId = await ctx.db.insert("attributes", args);
    return { attributeId, created: true };
  },
});

export const getAttribute = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("attributes")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
  },
});

export const listAttributes = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("attributes").take(500);
  },
});
