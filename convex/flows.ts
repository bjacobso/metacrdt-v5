import { mutation, query, internalMutation, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";

// A minimal durable workflow runner for the compliance `collect` step:
//   issue → park (waiting) → resume on the matching submission fact → complete,
// with scheduled reminder / escalation / expiry timer ticks along the way.
// Step = one mutation; "wait" = a parked flowRuns row resumed by the event path
// (a submitted.<form> fact) or by a scheduler tick. This is the Convex-native
// stand-in for a durable step engine (no BullMQ, no separate workflow service).

const DEFAULTS = { reminderSeconds: 10, escalateSeconds: 30 };

async function log(
  ctx: MutationCtx,
  runId: Id<"flowRuns">,
  kind: string,
  message?: string,
): Promise<void> {
  await ctx.db.insert("flowEvents", { runId, ts: Date.now(), kind, message });
}

/** Start a `collect` flow for one (subject, form, scope) obligation. */
export const startCollect = mutation({
  args: {
    subject: v.string(),
    form: v.string(),
    scope: v.string(),
    reminderSeconds: v.optional(v.number()),
    escalateSeconds: v.optional(v.number()),
    expireSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Don't double-issue: reuse an existing live run for the same target.
    const existing = await ctx.db
      .query("flowRuns")
      .withIndex("by_target", (q) =>
        q.eq("subject", args.subject).eq("form", args.form).eq("scope", args.scope),
      )
      .collect();
    const live = existing.find((r) => r.status === "waiting");
    if (live) return { runId: live._id, reused: true };

    const now = Date.now();
    const reminderSeconds = args.reminderSeconds ?? DEFAULTS.reminderSeconds;
    const escalateSeconds = args.escalateSeconds ?? DEFAULTS.escalateSeconds;
    const runId = await ctx.db.insert("flowRuns", {
      flowName: "collect",
      subject: args.subject,
      form: args.form,
      scope: args.scope,
      status: "waiting",
      step: "issued",
      issuedAt: now,
      updatedAt: now,
      reminderSeconds,
      escalateSeconds,
      expireSeconds: args.expireSeconds,
    });
    await log(ctx, runId, "issued", `collect ${args.form} for ${args.scope}`);

    // Schedule the timer ticks. They no-op if the run has left `waiting`.
    await ctx.scheduler.runAfter(reminderSeconds * 1000, internal.flows.tick, {
      runId,
      phase: "reminder",
    });
    await ctx.scheduler.runAfter(escalateSeconds * 1000, internal.flows.tick, {
      runId,
      phase: "escalate",
    });
    if (args.expireSeconds !== undefined) {
      await ctx.scheduler.runAfter(args.expireSeconds * 1000, internal.flows.tick, {
        runId,
        phase: "expire",
      });
    }
    return { runId, reused: false };
  },
});

/** Issue collect flows for every currently-open obligation of a worker. */
export const issueAllOpen = mutation({
  args: { subject: v.string() },
  handler: async (ctx, args): Promise<{ issued: number }> => {
    const derived = (
      await ctx.db
        .query("derivedFacts")
        .withIndex("by_e", (q) => q.eq("e", args.subject))
        .take(500)
    ).filter((d) => !d.stale && d.a.startsWith("task."));

    let issued = 0;
    for (const d of derived) {
      const res: { reused: boolean } = await ctx.runMutation(
        internal.flows.startCollectInternal,
        { subject: args.subject, form: d.a.slice("task.".length), scope: String(d.v) },
      );
      if (!res.reused) issued++;
    }
    return { issued };
  },
});

// Internal twin of startCollect so issueAllOpen can call it within the tx.
export const startCollectInternal = internalMutation({
  args: { subject: v.string(), form: v.string(), scope: v.string() },
  handler: async (ctx, args): Promise<{ runId: Id<"flowRuns">; reused: boolean }> => {
    const existing = await ctx.db
      .query("flowRuns")
      .withIndex("by_target", (q) =>
        q.eq("subject", args.subject).eq("form", args.form).eq("scope", args.scope),
      )
      .collect();
    const live = existing.find((r) => r.status === "waiting");
    if (live) return { runId: live._id, reused: true };

    const now = Date.now();
    const runId = await ctx.db.insert("flowRuns", {
      flowName: "collect",
      subject: args.subject,
      form: args.form,
      scope: args.scope,
      status: "waiting",
      step: "issued",
      issuedAt: now,
      updatedAt: now,
      reminderSeconds: DEFAULTS.reminderSeconds,
      escalateSeconds: DEFAULTS.escalateSeconds,
    });
    await log(ctx, runId, "issued", `collect ${args.form} for ${args.scope}`);
    await ctx.scheduler.runAfter(DEFAULTS.reminderSeconds * 1000, internal.flows.tick, {
      runId,
      phase: "reminder",
    });
    await ctx.scheduler.runAfter(DEFAULTS.escalateSeconds * 1000, internal.flows.tick, {
      runId,
      phase: "escalate",
    });
    return { runId, reused: false };
  },
});

/** A scheduled timer tick — reminder / escalation / expiry. No-op unless waiting. */
export const tick = internalMutation({
  args: {
    runId: v.id("flowRuns"),
    phase: v.union(
      v.literal("reminder"),
      v.literal("escalate"),
      v.literal("expire"),
    ),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("flowRuns", args.runId);
    if (!run || run.status !== "waiting") return;
    const now = Date.now();
    if (args.phase === "expire") {
      await ctx.db.patch("flowRuns", run._id, { status: "expired", step: "expired", updatedAt: now });
      await log(ctx, run._id, "expired", "collection window elapsed");
    } else if (args.phase === "reminder") {
      await ctx.db.patch("flowRuns", run._id, { step: "reminded", updatedAt: now });
      await log(ctx, run._id, "reminder", `reminded about ${run.form}`);
    } else {
      await ctx.db.patch("flowRuns", run._id, { step: "escalated", updatedAt: now });
      await log(ctx, run._id, "escalated", `escalated ${run.form}`);
    }
  },
});

/**
 * Resume any waiting `collect` runs for a (subject, form, scope) when the
 * matching submission fact arrives. Scheduled from the fact-change event path.
 */
export const resumeOnSubmission = internalMutation({
  args: { subject: v.string(), form: v.string(), scope: v.string() },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("flowRuns")
      .withIndex("by_target", (q) =>
        q.eq("subject", args.subject).eq("form", args.form).eq("scope", args.scope),
      )
      .collect();
    const now = Date.now();
    for (const run of runs) {
      if (run.status !== "waiting") continue;
      await ctx.db.patch("flowRuns", run._id, {
        status: "completed",
        step: "submitted",
        updatedAt: now,
      });
      await log(ctx, run._id, "submitted", `${args.form} submitted`);
      await log(ctx, run._id, "completed", "obligation satisfied");
    }
  },
});

export const cancelFlow = mutation({
  args: { runId: v.id("flowRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("flowRuns", args.runId);
    if (!run || run.status !== "waiting") return;
    await ctx.db.patch("flowRuns", run._id, {
      status: "cancelled",
      step: "cancelled",
      updatedAt: Date.now(),
    });
    await log(ctx, run._id, "cancelled", "cancelled by user");
  },
});

// --- read model -------------------------------------------------------------

/** Flow runs (optionally for one subject), each with its event timeline. */
export const listFlows = query({
  args: { subject: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const runs = args.subject
      ? await ctx.db
          .query("flowRuns")
          .withIndex("by_subject", (q) => q.eq("subject", args.subject!))
          .order("desc")
          .take(100)
      : await ctx.db.query("flowRuns").order("desc").take(100);

    const out = [];
    for (const run of runs) {
      const events = await ctx.db
        .query("flowEvents")
        .withIndex("by_run", (q) => q.eq("runId", run._id))
        .order("desc")
        .take(50);
      out.push({
        _id: run._id,
        flowName: run.flowName,
        subject: run.subject,
        form: run.form,
        scope: run.scope,
        status: run.status,
        step: run.step,
        issuedAt: run.issuedAt,
        updatedAt: run.updatedAt,
        events: events.map((e) => ({ ts: e.ts, kind: e.kind, message: e.message })),
      });
    }
    return out;
  },
});
