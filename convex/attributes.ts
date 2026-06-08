import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { isVisible } from "./lib/visibility";
import {
  allMetaAttributeFacts,
  attributeDefinitionFacts,
  attrId,
  typeId,
  attrNameOf,
  META,
  entityTypeDefinitionFacts,
  shapeAttributeDefinition,
} from "./lib/meta";
import { assertInTx, createTransaction, retractInTx } from "./facts";
import { requireWritePrincipal } from "./lib/writeAuth";

// Schema-as-facts: attribute definitions, entity-type definitions, and
// type→attribute membership are all bitemporal triples. Nothing here writes to
// a dedicated schema table — it all goes through the same fact log as data.

const valueTypeValidator = v.union(
  v.literal("string"),
  v.literal("number"),
  v.literal("boolean"),
  v.literal("entityRef"),
  v.literal("date"),
  v.literal("json"),
);

async function currentRows(ctx: QueryCtx | MutationCtx, e: string) {
  return await ctx.db
    .query("currentFacts")
    .withIndex("by_e", (q) => q.eq("e", e))
    .collect();
}

async function visibleRowsAsOf(
  ctx: QueryCtx,
  e: string,
  coord: { txTime: number; validTime: number },
): Promise<Doc<"facts">[]> {
  const rows = await ctx.db
    .query("facts")
    .withIndex("by_e", (q) => q.eq("e", e))
    .take(2000);
  return rows.filter((r) => isVisible(r, coord));
}

// --- mutations --------------------------------------------------------------

/**
 * Define (or redefine) an attribute as schema facts about `attr:<name>`.
 * Redefining asserts new values; cardinality/valueType are cardinality-one, so
 * their prior values are superseded in transaction time — the change is fully
 * recorded in history.
 */
export const defineAttribute = mutation({
  args: {
    name: v.string(),
    valueType: valueTypeValidator,
    cardinality: v.union(v.literal("one"), v.literal("many")),
    unique: v.optional(v.boolean()),
    indexed: v.optional(v.boolean()),
    materialized: v.optional(v.boolean()),
    inverseAttribute: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWritePrincipal(ctx);
    const now = Date.now();
    const txId = await createTransaction(ctx, {
      reason: `define attribute ${args.name}`,
      now,
    });
    const e = attrId(args.name);

    for (const { a, value } of attributeDefinitionFacts(args)) {
      await assertInTx(ctx, txId, now, { e, a, value });
    }
    return { attributeEntity: e, txId };
  },
});

/** Retire an attribute definition by retracting its current schema facts. */
export const retireAttribute = mutation({
  args: { name: v.string(), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireWritePrincipal(ctx);
    const now = Date.now();
    const txId = await createTransaction(ctx, {
      reason: args.reason ?? `retire attribute ${args.name}`,
      now,
    });
    const e = attrId(args.name);
    const rows = await currentRows(ctx, e);
    for (const row of rows) {
      await retractInTx(ctx, txId, now, row.factId, "attribute retired");
    }
    return { attributeEntity: e, retracted: rows.length };
  },
});

/**
 * Define (or extend) an entity type as schema facts about `type:<Name>`, with
 * `hasAttribute` edges to its attributes (themselves `attr:<name>` entities).
 */
export const defineType = mutation({
  args: {
    name: v.string(),
    attributes: v.optional(v.array(v.string())),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireWritePrincipal(ctx);
    const now = Date.now();
    const txId = await createTransaction(ctx, {
      reason: `define type ${args.name}`,
      now,
    });
    const e = typeId(args.name);
    for (const fact of entityTypeDefinitionFacts(args)) {
      await assertInTx(ctx, txId, now, fact);
    }
    return { typeEntity: e, txId };
  },
});

/** Install the meta-attributes as self-describing schema facts. */
export const bootstrapSchema = mutation({
  args: {},
  handler: async (ctx) => {
    await requireWritePrincipal(ctx);
    const now = Date.now();
    const txId = await createTransaction(ctx, {
      reason: "bootstrap meta-schema",
      now,
    });
    const facts = allMetaAttributeFacts();
    for (const fact of facts) {
      await assertInTx(ctx, txId, now, fact);
    }
    return { installed: new Set(facts.map((f) => f.e)).size };
  },
});

// --- queries ----------------------------------------------------------------

function shapeAttribute(name: string, rows: { a: string; v: unknown }[]) {
  return shapeAttributeDefinition(name, rows);
}

/** Current definition of an attribute, reconstructed from facts. */
export const getAttribute = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const rows = await currentRows(ctx, attrId(args.name));
    if (rows.length === 0) return null;
    return shapeAttribute(args.name, rows);
  },
});

/** Definition of an attribute as of a bitemporal coordinate. */
export const attributeAsOf = query({
  args: {
    name: v.string(),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const rows = await visibleRowsAsOf(ctx, attrId(args.name), coord);
    if (rows.length === 0) return { name: args.name, coord, exists: false };
    return {
      ...shapeAttribute(args.name, rows),
      coord,
      exists: true,
    };
  },
});

/** All currently-defined attributes. */
export const listAttributes = query({
  args: {},
  handler: async (ctx) => {
    const defs = await ctx.db
      .query("currentFacts")
      .withIndex("by_a_v", (q) =>
        q.eq("a", "type").eq("v", META.attributeType),
      )
      .take(1000);
    const out = [];
    for (const d of defs) {
      const rows = await currentRows(ctx, d.e);
      out.push(shapeAttribute(attrNameOf(d.e), rows));
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/**
 * Timeline of schema changes to an attribute (every assert/retract/tombstone on
 * its definition facts), newest first — answers "when was this added / removed
 * / redefined, and to what".
 */
export const attributeLifecycle = query({
  args: { name: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("factEvents")
      .withIndex("by_e", (q) => q.eq("e", attrId(args.name)))
      .order("desc")
      .take(Math.min(args.limit ?? 100, 500));
    return events.map((e) => ({
      kind: e.kind,
      attribute: e.a,
      value: e.v,
      txTime: e.txTime,
    }));
  },
});

/**
 * The declared shape of an entity type as of a bitemporal coordinate — the set
 * of attribute names reachable via `hasAttribute` at that point in time, plus
 * each attribute's schema facts where available. `attributes` stays as the
 * compatibility list; `columns` is the richer generated-UI surface.
 */
export const typeSchemaAsOf = query({
  args: {
    type: v.string(),
    txTime: v.optional(v.number()),
    validTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const coord = {
      txTime: args.txTime ?? Date.now(),
      validTime: args.validTime ?? Date.now(),
    };
    const rows = await visibleRowsAsOf(ctx, typeId(args.type), coord);
    const attributes = rows
      .filter((r) => r.a === "hasAttribute")
      .map((r) => attrNameOf(String(r.v)))
      .sort();
    const columns = [];
    for (const name of attributes) {
      const attrRows = await visibleRowsAsOf(ctx, attrId(name), coord);
      columns.push({
        ...shapeAttribute(name, attrRows),
        declared: attrRows.length > 0,
      });
    }
    return { type: args.type, coord, attributes, columns };
  },
});
