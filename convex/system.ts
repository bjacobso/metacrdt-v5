import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { LIMITS, runWhere, type Binding } from "./lib/engine";
import { eventLogTripleSource } from "./lib/eventLogTripleSource";
import { valueKey } from "./lib/visibility";

// The intrinsic side of the product. These are the platform's own reactive
// processes — not tenant-authored flows, but the autonomic machinery that keeps
// projections and obligations consistent. They're real (crons + the fact-change
// event path), so we surface them read-only with whatever live state we can
// cheaply derive, the way a SaaS shows "system jobs" you don't configure.

function resolveEmitTerm(term: unknown, binding: Binding): unknown {
  if (typeof term === "string" && term.startsWith("?")) {
    return binding[term.slice(1)];
  }
  return term;
}

async function countComplianceObligationsFromEventLog(
  ctx: Parameters<typeof runWhere>[0],
  rules: Doc<"rules">[],
): Promise<number> {
  const coord = { txTime: Date.now(), validTime: Date.now() };
  const keys = new Set<string>();
  for (const rule of rules) {
    if (rule.emit === undefined) continue;
    const bindings = await runWhere(
      ctx,
      (rule.where ?? []) as unknown[],
      coord,
      {},
      { source: eventLogTripleSource },
    );
    for (const binding of bindings) {
      const e = resolveEmitTerm(rule.emit.e, binding);
      if (e === undefined || e === null) continue;
      const v = resolveEmitTerm(rule.emit.v, binding);
      const a = rule.emit.a;
      if (!(a.startsWith("requires.") || a.startsWith("task."))) continue;
      keys.add(`${String(e)}\u0000${a}\u0000${valueKey(v)}`);
      if (keys.size > LIMITS.maxResultRows) return keys.size;
    }
  }
  return keys.size;
}

async function countWaitingFlowRunsFromEventLog(
  ctx: Parameters<typeof runWhere>[0],
): Promise<number> {
  const now = Date.now();
  const rows = await runWhere(
    ctx,
    [["?run", "flow.run.status", "waiting"]],
    { txTime: now, validTime: now },
    {},
    { source: eventLogTripleSource },
  );
  return new Set(rows.map((row) => String(row.run))).size;
}

/**
 * Descriptors for the system processes, each enriched with live counts. Mirrors
 * what the entity/flow lists do for the "configured" side: gives the System tab
 * something concrete to render.
 */
export const listSystemProcesses = query({
  args: {},
  handler: async (ctx) => {
    const enabledRules = await ctx.db
      .query("rules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .take(500);
    const datalogRules = enabledRules.filter((r) => r.kind !== "closure");
    const closureRules = enabledRules.filter((r) => r.kind === "closure");
    const complianceRules = enabledRules.filter(
      (r) => r.name.startsWith("require.") || r.name.startsWith("task."),
    );

    // Pending rule recomputations (unprocessed invalidations).
    const pendingInvalidations = (
      await ctx.db.query("ruleInvalidations").take(500)
    ).filter((i) => i.processedAt === undefined).length;

    const obligationFacts =
      await countComplianceObligationsFromEventLog(ctx, complianceRules);

    const waitingRuns = await countWaitingFlowRunsFromEventLog(ctx);

    return [
      {
        name: "compliance-reconciler",
        title: "Compliance reconciler",
        kind: "cron" as const,
        schedule: "every 24h",
        trigger: "scheduled tick (valid-time expiry)",
        description:
          "Re-runs requirement/task rules so obligations re-fire when a satisfying submission lapses. Valid-time expiry has no triggering write, so a cron sweeps it.",
        stats: [
          { label: "compliance rules", value: complianceRules.length },
          { label: "open/required obligations", value: obligationFacts },
        ],
      },
      {
        name: "rule-materializer",
        title: "Rule materializer",
        kind: "event" as const,
        schedule: "on fact change",
        trigger: "processFactChange → recomputeRule",
        description:
          "Recomputes Datalog rules whose dependsOnAttributes changed, refreshing derivedFacts. The reactive core: every assert/retract schedules the affected rules.",
        stats: [
          { label: "datalog rules", value: datalogRules.length },
          { label: "pending recomputes", value: pendingInvalidations },
        ],
      },
      {
        name: "closure-materializer",
        title: "Transitive-closure materializer",
        kind: "event" as const,
        schedule: "on base-attribute change",
        trigger: "recomputeTransitiveClosure",
        description:
          "Materializes the transitive closure of base attributes (e.g. reportsTo → reportsTo+) into queryable derived facts.",
        stats: [{ label: "closure rules", value: closureRules.length }],
      },
      {
        name: "flow-resumer",
        title: "Flow resumer",
        kind: "event" as const,
        schedule: "on submission fact",
        trigger: "submitted.<form> → resumeOnSubmission",
        description:
          "Resumes parked flow runs when their awaited submission fact arrives — the event path that turns a passive collect step into a reactive one.",
        stats: [{ label: "runs waiting", value: waitingRuns }],
      },
    ];
  },
});
