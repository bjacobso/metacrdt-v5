import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { assertInTx, createTransaction, retractInTx } from "./facts";
import { listViewDefs, loadViewDef, viewId } from "./lib/viewDefs";
import { requireWritePrincipal } from "./lib/writeAuth";

function isValidViewSpecShell(spec: unknown): boolean {
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
    return false;
  }
  const record = spec as Record<string, unknown>;
  return (
    record["root"] !== null &&
    typeof record["root"] === "object" &&
    !Array.isArray(record["root"])
  );
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
    if (!isValidViewSpecShell(args.spec)) {
      throw new Error("malformed view spec: expected a renderable spec with a root node");
    }
    const now = Date.now();
    const e = viewId(args.name);
    const txId = await createTransaction(ctx, {
      actorId: "config",
      reason: `define view ${args.name}`,
      now,
    });
    const current = await ctx.db
      .query("currentFacts")
      .withIndex("by_e", (q) => q.eq("e", e))
      .take(1000);
    for (const row of current) {
      await retractInTx(ctx, txId, now, row.factId, "view definition replaced");
    }
    await assertInTx(ctx, txId, now, { e, a: "type", value: "View" });
    await assertInTx(ctx, txId, now, {
      e,
      a: "specJson",
      value: JSON.stringify(args.spec),
    });
    if (args.label !== undefined) {
      await assertInTx(ctx, txId, now, { e, a: "label", value: args.label });
    }
    if (args.description !== undefined) {
      await assertInTx(ctx, txId, now, {
        e,
        a: "description",
        value: args.description,
      });
    }
    return { viewEntity: e };
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
