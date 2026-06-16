import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { isVisible } from "./lib/visibility";

// Bound for a single-transaction rebuild. Large logs would need a batched,
// self-continuing rebuild (scheduler) — noted in PLAN.
const SCAN = 20000;

function compareEventOrder(a: Doc<"factEvents">, b: Doc<"factEvents">): number {
  // Prefer MetaCRDT protocol ordering for rows that have it. Legacy rows fall
  // back to the original txTime/_creationTime order.
  const ah = a.hlc;
  const bh = b.hlc;
  if (ah && bh) {
    if (ah.pt !== bh.pt) return ah.pt - bh.pt;
    if (ah.l !== bh.l) return ah.l - bh.l;
    if (ah.r !== bh.r) return ah.r.localeCompare(bh.r);
    if (a.eventId && b.eventId && a.eventId !== b.eventId) {
      return a.eventId.localeCompare(b.eventId);
    }
  }
  return a.txTime - b.txTime || a._creationTime - b._creationTime;
}

/**
 * Regenerate the read projections from the append-only event log, proving the
 * "events are the source of truth" invariant:
 *
 *   factEvents (immutable)  ──fold──▶  facts (bitemporal lifecycle)
 *   facts                   ──fold──▶  currentFacts (now-projection)
 *   facts + rules           ──fold──▶  derivedFacts (recomputed)
 *
 * `facts` rows are reconstructed in place (patched, keeping their ids so
 * factEvents.factId and other references stay valid) from each fact's event
 * sequence. Note: write-time-only metadata not carried in the log (source,
 * confidence, supersedes/supersededBy lineage) is left as-is — the log governs
 * the bitemporal *state*, not that auxiliary metadata.
 */
export const rebuildProjections = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // 1. Fold the event log per fact to reconstruct its bitemporal lifecycle.
    const events = await ctx.db.query("factEvents").take(SCAN);
    if (events.length === SCAN) {
      console.warn(`rebuildProjections scanned the ${SCAN} event cap; rebuild may be partial`);
    }
    const byFact = new Map<string, Doc<"factEvents">[]>();
    for (const e of events) {
      if (!e.factId) continue;
      const k = e.factId as string;
      const arr = byFact.get(k);
      if (arr) arr.push(e);
      else byFact.set(k, [e]);
    }

    let factsRebuilt = 0;
    for (const [factIdStr, evs] of byFact) {
      const factId = factIdStr as Id<"facts">;
      const fact = await ctx.db.get("facts", factId);
      if (!fact) continue; // event references a fact that no longer exists
      evs.sort(compareEventOrder);
      const assertEv = evs.find((e) => e.kind === "assert");
      if (!assertEv) continue;

      let validTo = assertEv.validTo;
      let retractedAt: number | undefined = undefined;
      let tombstonedAt: number | undefined = undefined;
      let tombstoneReason: string | undefined = undefined;
      for (const e of evs) {
        if (e.kind === "retract") {
          retractedAt = e.txTime;
          if (e.validTo !== undefined) validTo = e.validTo;
        } else if (e.kind === "tombstone" || e.kind === "correction") {
          tombstonedAt = e.txTime;
          tombstoneReason = e.reason;
        } else if (e.kind === "untombstone") {
          tombstonedAt = undefined;
          tombstoneReason = undefined;
        }
      }

      await ctx.db.patch("facts", factId, {
        assertedAt: assertEv.txTime,
        validFrom: assertEv.validFrom ?? assertEv.txTime,
        validTo,
        retractedAt,
        tombstonedAt,
        tombstoneReason,
      });
      factsRebuilt++;
    }

    // 2. Rebuild currentFacts as the now-projection of facts.
    const stale = await ctx.db.query("currentFacts").take(SCAN);
    for (const row of stale) await ctx.db.delete("currentFacts", row._id);

    const coord = { txTime: now, validTime: now };
    const facts = await ctx.db.query("facts").take(SCAN);
    let currentRebuilt = 0;
    for (const f of facts) {
      if (!isVisible(f, coord)) continue;
      await ctx.db.insert("currentFacts", {
        tenantId: f.tenantId,
        e: f.e,
        a: f.a,
        v: f.v,
        factId: f._id,
        validFrom: f.validFrom,
        txTime: now,
        updatedAt: now,
      });
      currentRebuilt++;
    }

    // 3. Recompute derived facts (also projections of facts + rules).
    const rules = await ctx.db
      .query("rules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
    for (const r of rules) {
      if (r.kind === "closure") {
        await ctx.scheduler.runAfter(
          0,
          internal.materialize.recomputeTransitiveClosure,
          { ruleId: r._id },
        );
      } else {
        await ctx.scheduler.runAfter(0, internal.materialize.recomputeRule, {
          ruleId: r._id,
        });
      }
    }

    return {
      eventsScanned: events.length,
      factsRebuilt,
      currentRebuilt,
      rulesScheduled: rules.length,
    };
  },
});
