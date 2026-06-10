import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertInTx, createTransaction, retractInTx } from "./facts";
import { listViewDefs, loadViewDef, viewId } from "./lib/viewDefs";
import { requireWritePrincipal } from "./lib/writeAuth";
import { isRenderableViewSpec } from "@metacrdt/views/runtime";

type DesiredFact = { a: string; value: unknown };

function valueKey(value: unknown): string {
  return JSON.stringify(value);
}

function factKey(fact: DesiredFact): string {
  return `${fact.a}\u0000${valueKey(fact.value)}`;
}

function sameFactSet(
  current: { a: string; v: unknown }[],
  desired: DesiredFact[],
): boolean {
  if (current.length !== desired.length) return false;
  const currentKeys = new Set(current.map((row) => factKey({ a: row.a, value: row.v })));
  if (currentKeys.size !== desired.length) return false;
  return desired.every((fact) => currentKeys.has(factKey(fact)));
}

/** Define (or replace) a view definition as schema-as-facts. */
export const defineView = mutation({
  args: {
    name: v.string(),
    label: v.optional(v.string()),
    description: v.optional(v.string()),
    spec: v.any(),
  },
  handler: async (ctx, args) => {
    await requireWritePrincipal(ctx);
    if (!isRenderableViewSpec(args.spec)) {
      throw new Error("malformed view spec: expected a renderable spec with a root node");
    }
    const now = Date.now();
    const e = viewId(args.name);
    const desired: DesiredFact[] = [
      { a: "type", value: "View" },
      { a: "specJson", value: JSON.stringify(args.spec) },
    ];
    if (args.label !== undefined) {
      desired.push({ a: "label", value: args.label });
    }
    if (args.description !== undefined) {
      desired.push({ a: "description", value: args.description });
    }
    const current = await ctx.db
      .query("currentFacts")
      .withIndex("by_e", (q) => q.eq("e", e))
      .take(1000);
    if (sameFactSet(current, desired)) {
      return { viewEntity: e, changed: false };
    }

    const txId = await createTransaction(ctx, {
      actorId: "config",
      reason: `define view ${args.name}`,
      now,
    });
    for (const row of current) {
      await retractInTx(ctx, txId, now, row.factId, "view definition replaced");
    }
    for (const fact of desired) {
      await assertInTx(ctx, txId, now, { e, a: fact.a, value: fact.value });
    }
    return { viewEntity: e, changed: true };
  },
});

/** All view definitions, excluding the full spec payload for navigation. */
export const listViews = query({
  args: {},
  handler: async (ctx) => {
    return (await listViewDefs(ctx)).map(({ name, label, description }) => ({
      name,
      label,
      description,
    }));
  },
});

/** One view definition, including its renderable view spec. */
export const getView = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await loadViewDef(ctx, args.name);
  },
});
