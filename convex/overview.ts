import { query } from "./_generated/server";
import { v } from "convex/values";
import { typeOrigin } from "./lib/origin";
import { typeNameOf } from "./lib/meta";

const TYPE_ATTR = "type";
const SAMPLE = 1000;

/** Headline counts for the Overview dashboard. */
export const summary = query({
  args: {},
  handler: async (ctx) => {
    const typeRows = await ctx.db
      .query("currentFacts")
      .withIndex("by_a", (q) => q.eq("a", TYPE_ATTR))
      .take(SAMPLE);

    // Configured types: declared type:<Name> registry entries.
    const configured = new Set(
      typeRows
        .filter((r) => r.v === "EntityType")
        .map((r) => typeNameOf(r.e)),
    );
    const configuredTypes = [...configured].filter(
      (t) => typeOrigin(t, true) === "configured",
    ).length;

    // Active placements.
    const placements = typeRows.filter((r) => r.v === "Placement").length;

    // Evidence (submissions) currently on record — these are what reuse keys off.
    const submitted = await ctx.db
      .query("currentFacts")
      .withIndex("by_a", (q) => q.eq("a", "submitted.i9"))
      .take(SAMPLE);
    const allSubmitted = typeRows.length; // placeholder; refined below

    // Reuse: a submission scope shared by more than one placement means the
    // evidence was reused rather than re-collected. Count distinct reused scopes.
    const placementRows = typeRows.filter((r) => r.v === "Placement");
    const scopeUse = new Map<string, number>();
    for (const p of placementRows) {
      const facts = await ctx.db
        .query("currentFacts")
        .withIndex("by_e", (q) => q.eq("e", p.e))
        .collect();
      for (const f of facts) {
        if (["employer", "client", "job", "venue"].includes(f.a)) {
          const key = `${f.a}:${String(f.v)}`;
          scopeUse.set(key, (scopeUse.get(key) ?? 0) + 1);
        }
      }
    }
    const reusedScopes = [...scopeUse.values()].filter((n) => n > 1).length;

    // Obligation satisfaction for the demo subject.
    const derived = (
      await ctx.db
        .query("derivedFacts")
        .withIndex("by_e", (q) => q.eq("e", "worker:maria"))
        .take(SAMPLE)
    ).filter((d) => !d.stale);
    const required = derived.filter((d) => d.a.startsWith("requires.")).length;
    const open = derived.filter((d) => d.a.startsWith("task.")).length;

    return {
      configuredTypes,
      placements,
      reusedScopes,
      evidence: submitted.length || allSubmitted,
      required,
      open,
      satisfiedPct: required === 0 ? 100 : Math.round(((required - open) / required) * 100),
    };
  },
});

/** Recent transactions, each described by a representative fact event. */
export const recentActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const txns = await ctx.db
      .query("transactions")
      .withIndex("by_txTime")
      .order("desc")
      .take(Math.min(args.limit ?? 12, 50));

    const out = [];
    for (const tx of txns) {
      const ev = await ctx.db
        .query("factEvents")
        .withIndex("by_tx", (q) => q.eq("txId", tx._id))
        .first();
      if (!ev) continue;
      out.push({
        txId: tx._id,
        actorId: tx.actorId,
        actorType: tx.actorType,
        reason: tx.reason,
        txTime: tx.txTime,
        kind: ev.kind,
        e: ev.e,
        a: ev.a,
        v: ev.v,
      });
    }
    return out;
  },
});
