import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { assertInTx, createTransaction } from "./facts";

// Actions: the synchronous, one-transaction cousin of a Flow. Where a flow is a
// parked multi-step graph, an action is "assert these facts on this entity, now"
// — e.g. "Terminate worker" → worker.status = terminated. Like flows, an action
// is declared against an entity *type* (appliesTo), so the entity detail page can
// compute which actions apply to a given entity with no per-entity wiring.
//
// An action definition is itself schema-as-facts on action:<name>:
//   (action:<name>, type,      "Action")
//   (action:<name>, label,     "Terminate worker")
//   (action:<name>, appliesTo, "Worker")
//   (action:<name>, asserts,   { "worker.status": "terminated" })

function actionId(name: string): string {
  return `action:${name}`;
}

/** Define (or replace) an action definition. */
export const defineAction = mutation({
  args: {
    name: v.string(),
    label: v.optional(v.string()),
    appliesTo: v.string(),
    asserts: v.any(), // Record<attribute, value>
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const e = actionId(args.name);
    const txId = await createTransaction(ctx, {
      actorId: "config",
      reason: `define action ${args.name}`,
      now,
    });
    await assertInTx(ctx, txId, now, { e, a: "type", value: "Action" });
    await assertInTx(ctx, txId, now, { e, a: "appliesTo", value: args.appliesTo });
    await assertInTx(ctx, txId, now, { e, a: "asserts", value: args.asserts });
    if (args.label !== undefined)
      await assertInTx(ctx, txId, now, { e, a: "label", value: args.label });
    return { actionEntity: e };
  },
});

async function loadActionDef(ctx: QueryCtx, name: string) {
  const rows = await ctx.db
    .query("currentFacts")
    .withIndex("by_e", (q) => q.eq("e", actionId(name)))
    .collect();
  if (rows.length === 0) return null;
  const m: Record<string, unknown[]> = {};
  for (const r of rows) (m[r.a] ??= []).push(r.v);
  return {
    name,
    label: m["label"]?.[0] ? String(m["label"][0]) : undefined,
    appliesTo: m["appliesTo"]?.[0] ? String(m["appliesTo"][0]) : undefined,
    asserts: (m["asserts"]?.[0] ?? {}) as Record<string, unknown>,
  };
}

/** Run an action against a target entity: assert its facts in one transaction. */
export const runAction = mutation({
  args: { action: v.string(), entity: v.string(), actorId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const def = await loadActionDef(ctx, args.action);
    if (!def) throw new Error(`unknown action: ${args.action}`);
    const now = Date.now();
    const txId = await createTransaction(ctx, {
      actorId: args.actorId ?? "user",
      actorType: "user",
      reason: `action ${args.action} on ${args.entity}`,
      now,
    });
    let asserted = 0;
    for (const [a, value] of Object.entries(def.asserts)) {
      await assertInTx(ctx, txId, now, { e: args.entity, a, value });
      asserted++;
    }
    return { txId, asserted };
  },
});

/** Actions runnable on a given entity type. */
export const actionsForType = query({
  args: { type: v.string() },
  handler: async (ctx, args) => {
    const defs = await ctx.db
      .query("currentFacts")
      .withIndex("by_a_v", (q) => q.eq("a", "type").eq("v", "Action"))
      .take(200);
    const out = [];
    for (const d of defs) {
      const def = await loadActionDef(ctx, d.e.slice("action:".length));
      if (def && def.appliesTo === args.type) out.push(def);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

/** All action definitions (for the System view). */
export const listActions = query({
  args: {},
  handler: async (ctx) => {
    const defs = await ctx.db
      .query("currentFacts")
      .withIndex("by_a_v", (q) => q.eq("a", "type").eq("v", "Action"))
      .take(200);
    const out = [];
    for (const d of defs) {
      const def = await loadActionDef(ctx, d.e.slice("action:".length));
      if (def) out.push(def);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});
