import {
  mutation,
  query,
  internalMutation,
  internalAction,
  MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { runWhere } from "./lib/engine";
import { assertInTx, createTransaction, retractInTx } from "./facts";
import { requireWritePrincipal } from "./lib/writeAuth";

// A minimal durable workflow runner for the compliance `collect` step:
//   issue → park (waiting) → resume on the matching submission fact → complete,
// with scheduled reminder / escalation / expiry timer ticks along the way.
// Step = one mutation; "wait" = a parked flowRuns row resumed by the event path
// (a submitted.<form> fact) or by a scheduler tick. This is the Convex-native
// stand-in for a durable step engine (no BullMQ, no separate workflow service).

const DEFAULTS = { reminderSeconds: 10, escalateSeconds: 30 };
const DEFAULT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FLOW_RUN_STATUS_ATTR = "flow.run.status";

type FlowRunStatus = Doc<"flowRuns">["status"];

function tokenExpiresAt(now: number, expireSeconds?: number): number {
  return now + (expireSeconds !== undefined ? expireSeconds * 1000 : DEFAULT_TOKEN_TTL_MS);
}

function hasLiveToken(
  run: { status: string; token?: string; tokenConsumedAt?: number; tokenExpiresAt?: number },
  now: number,
): boolean {
  return (
    run.status === "waiting" &&
    run.token !== undefined &&
    run.tokenConsumedAt === undefined &&
    (run.tokenExpiresAt === undefined || run.tokenExpiresAt > now)
  );
}

async function log(
  ctx: MutationCtx,
  runId: Id<"flowRuns">,
  kind: string,
  message?: string,
): Promise<void> {
  await ctx.db.insert("flowEvents", { runId, ts: Date.now(), kind, message });
}

function flowRunEntity(runId: Id<"flowRuns">): string {
  return `flowRun:${runId}`;
}

async function recordFlowRunStatus(
  ctx: MutationCtx,
  runId: Id<"flowRuns">,
  status: FlowRunStatus,
  now: number,
  reason: string,
): Promise<void> {
  const txId = await createTransaction(ctx, {
    actorId: "system:flows",
    actorType: "system",
    reason,
    source: "flowRuns",
    now,
  });
  const entity = flowRunEntity(runId);
  const current = await ctx.db
    .query("currentFacts")
    .withIndex("by_e_a", (q) => q.eq("e", entity).eq("a", FLOW_RUN_STATUS_ATTR))
    .collect();
  for (const row of current) {
    await retractInTx(ctx, txId, now, row.factId, reason);
  }
  await assertInTx(ctx, txId, now, {
    e: entity,
    a: FLOW_RUN_STATUS_ATTR,
    value: status,
    reason,
    source: "flowRuns",
  });
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
    await requireWritePrincipal(ctx);
    // Don't double-issue: reuse an existing live run for the same target.
    const existing = await ctx.db
      .query("flowRuns")
      .withIndex("by_target", (q) =>
        q.eq("subject", args.subject).eq("form", args.form).eq("scope", args.scope),
      )
      .collect();
    const now = Date.now();
    const live = existing.find((r) => hasLiveToken(r, now));
    if (live) return { runId: live._id, reused: true };

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
      token: crypto.randomUUID(),
      tokenExpiresAt: tokenExpiresAt(now, args.expireSeconds),
    });
    await log(ctx, runId, "issued", `collect ${args.form} for ${args.scope}`);
    await recordFlowRunStatus(ctx, runId, "waiting", now, "flow collect issued");

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
    await requireWritePrincipal(ctx);
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
    const now = Date.now();
    const live = existing.find((r) => hasLiveToken(r, now));
    if (live) return { runId: live._id, reused: true };

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
      token: crypto.randomUUID(),
      tokenExpiresAt: tokenExpiresAt(now),
    });
    await log(ctx, runId, "issued", `collect ${args.form} for ${args.scope}`);
    await recordFlowRunStatus(ctx, runId, "waiting", now, "flow collect issued");
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
      await recordFlowRunStatus(ctx, run._id, "expired", now, "flow expired");
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
      await log(ctx, run._id, "submitted", `${args.form} submitted`);
      if (run.flowDefName) {
        // Part of a DAG: advance to the collect step's next step.
        await resumeToNext(ctx, run, now);
      } else {
        // Standalone collect (compliance): just complete.
        await ctx.db.patch("flowRuns", run._id, {
          status: "completed",
          step: "submitted",
          updatedAt: now,
        });
        await log(ctx, run._id, "completed", "obligation satisfied");
        await recordFlowRunStatus(ctx, run._id, "completed", now, "flow completed");
      }
    }
  },
});

export const cancelFlow = mutation({
  args: { runId: v.id("flowRuns") },
  handler: async (ctx, args) => {
    await requireWritePrincipal(ctx);
    const run = await ctx.db.get("flowRuns", args.runId);
    if (!run || run.status !== "waiting") return;
    const now = Date.now();
    await ctx.db.patch("flowRuns", run._id, {
      status: "cancelled",
      step: "cancelled",
      updatedAt: now,
    });
    await log(ctx, run._id, "cancelled", "cancelled by user");
    await recordFlowRunStatus(ctx, run._id, "cancelled", now, "flow cancelled");
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
        token: run.token,
        flowDefName: run.flowDefName,
        currentStepId: run.currentStepId,
        events: events.map((e) => ({ ts: e.ts, kind: e.kind, message: e.message })),
      });
    }
    return out;
  },
});

export const getFlowDef = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("flowDefs")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
  },
});

/** All flow definitions (for listing / starting), origin-tagged. */
export const listFlowDefs = query({
  args: {},
  handler: async (ctx) => {
    const defs = await ctx.db.query("flowDefs").take(50);
    return defs.map((d) => ({
      _id: d._id,
      name: d.name,
      title: d.title,
      subjectType: d.subjectType,
      origin: d.origin ?? ("configured" as const),
      startStepId: d.startStepId,
      steps: d.steps,
    }));
  },
});

/** Flow definitions runnable on a given entity type (by subjectType). */
export const flowsForType = query({
  args: { type: v.string() },
  handler: async (ctx, args) => {
    const defs = await ctx.db.query("flowDefs").take(50);
    return defs
      .filter((d) => d.subjectType === args.type)
      .map((d) => ({
        _id: d._id,
        name: d.name,
        title: d.title,
        steps: d.steps.map((s) => ({ id: s.id, type: s.type })),
      }));
  },
});

// === Phase 2: the general Flow DAG =========================================
//
// A flow definition is a named graph of typed steps. A run carries a
// currentStepId + context; advanceFlow interprets steps in a loop, executing
// non-parking steps (assert/notify/branch) inline and stopping at parking steps
// (collect/wait/action), which are resumed by the event path, a timer, or an
// action callback. `done` (or a missing next) completes the run.

const stepTypeValidator = v.union(
  v.literal("assert"),
  v.literal("collect"),
  v.literal("notify"),
  v.literal("branch"),
  v.literal("action"),
  v.literal("wait"),
  v.literal("done"),
);

/** Resolve a config value: "$subject", "$ctx.<key>", or a literal. */
function resolveVal(raw: unknown, run: Doc<"flowRuns">): unknown {
  if (typeof raw !== "string") return raw;
  if (raw === "$subject") return run.subject;
  if (raw.startsWith("$ctx.")) {
    const ctxObj = (run.context ?? {}) as Record<string, unknown>;
    return ctxObj[raw.slice("$ctx.".length)];
  }
  return raw;
}

/** Move a parked run to its current step's `next` and re-enter the interpreter. */
async function resumeToNext(
  ctx: MutationCtx,
  run: Doc<"flowRuns">,
  now: number,
): Promise<void> {
  const def = run.flowDefName
    ? await ctx.db
        .query("flowDefs")
        .withIndex("by_name", (q) => q.eq("name", run.flowDefName!))
        .first()
    : null;
  const step = def?.steps.find((s) => s.id === run.currentStepId);
  const next = step?.next ?? "";
  await ctx.db.patch("flowRuns", run._id, {
    status: "running",
    currentStepId: next,
    step: next,
    updatedAt: now,
  });
  await recordFlowRunStatus(ctx, run._id, "running", now, "flow resumed");
  await ctx.scheduler.runAfter(0, internal.flows.advanceFlow, { runId: run._id });
}

export const defineFlow = mutation({
  args: {
    name: v.string(),
    title: v.optional(v.string()),
    subjectType: v.optional(v.string()),
    startStepId: v.string(),
    steps: v.array(
      v.object({
        id: v.string(),
        type: stepTypeValidator,
        config: v.optional(v.any()),
        next: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    await requireWritePrincipal(ctx);
    const existing = await ctx.db
      .query("flowDefs")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    const fields = {
      name: args.name,
      title: args.title,
      subjectType: args.subjectType,
      origin: "configured" as const,
      startStepId: args.startStepId,
      steps: args.steps,
    };
    if (existing) {
      await ctx.db.patch("flowDefs", existing._id, fields);
      return { flowDefId: existing._id };
    }
    const flowDefId = await ctx.db.insert("flowDefs", {
      ...fields,
      createdAt: Date.now(),
    });
    return { flowDefId };
  },
});

export const startFlow = mutation({
  args: {
    flowDefName: v.string(),
    subject: v.string(),
    context: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await requireWritePrincipal(ctx);
    const def = await ctx.db
      .query("flowDefs")
      .withIndex("by_name", (q) => q.eq("name", args.flowDefName))
      .first();
    if (!def) throw new Error(`unknown flow: ${args.flowDefName}`);
    const now = Date.now();
    const runId = await ctx.db.insert("flowRuns", {
      flowName: args.flowDefName,
      flowDefName: args.flowDefName,
      subject: args.subject,
      status: "running",
      step: def.startStepId,
      currentStepId: def.startStepId,
      context: args.context ?? {},
      issuedAt: now,
      updatedAt: now,
    });
    await log(ctx, runId, "started", def.title ?? args.flowDefName);
    await recordFlowRunStatus(ctx, runId, "running", now, "flow started");
    await ctx.scheduler.runAfter(0, internal.flows.advanceFlow, { runId });
    return { runId };
  },
});

/** The interpreter: execute steps until a parking step or completion. */
export const advanceFlow = internalMutation({
  args: { runId: v.id("flowRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("flowRuns", args.runId);
    if (!run || !run.flowDefName || run.status !== "running") return;
    const def = await ctx.db
      .query("flowDefs")
      .withIndex("by_name", (q) => q.eq("name", run.flowDefName!))
      .first();
    if (!def) return;

    const now = Date.now();
    let txId: Id<"transactions"> | null = null;
    const getTx = async () =>
      (txId ??= await createTransaction(ctx, { reason: `flow ${def.name}`, now }));
    let stepId = run.currentStepId ?? def.startStepId;

    const complete = async (at: string) => {
      await ctx.db.patch("flowRuns", run._id, {
        status: "completed",
        step: at,
        currentStepId: at,
        updatedAt: now,
      });
      await log(ctx, run._id, "completed");
      await recordFlowRunStatus(ctx, run._id, "completed", now, "flow completed");
    };

    for (let i = 0; i < 50; i++) {
      const step = def.steps.find((s) => s.id === stepId);
      if (!step || step.type === "done") {
        await complete(stepId || "done");
        return;
      }
      const cfg = (step.config ?? {}) as Record<string, unknown>;

      if (step.type === "assert") {
        const tx = await getTx();
        const value = resolveVal(cfg.v, run);
        await assertInTx(ctx, tx, now, {
          e: run.subject,
          a: String(cfg.a),
          value,
        });
        await log(ctx, run._id, "assert", `${cfg.a} = ${JSON.stringify(value)}`);
      } else if (step.type === "notify") {
        await log(ctx, run._id, "notify", String(cfg.message ?? ""));
      } else if (step.type === "branch") {
        const subjectVar = String(cfg.subjectVar ?? "s");
        const bindings = await runWhere(
          ctx,
          (cfg.where ?? []) as unknown[],
          { txTime: now, validTime: now },
          { [subjectVar]: run.subject },
        );
        const taken = bindings.length > 0;
        stepId = String((taken ? cfg.ifTrue : cfg.ifFalse) ?? "");
        await log(
          ctx,
          run._id,
          "branch",
          taken ? `true → ${stepId}` : `false → ${stepId}`,
        );
        if (!stepId) {
          await complete("done");
          return;
        }
        await ctx.db.patch("flowRuns", run._id, { currentStepId: stepId, step: stepId, updatedAt: now });
        continue;
      } else if (step.type === "collect") {
        const scope = String(resolveVal(cfg.scope ?? `$ctx.${cfg.scopeFrom}`, run) ?? "");
        await ctx.db.patch("flowRuns", run._id, {
          status: "waiting",
          step: stepId,
          currentStepId: stepId,
          form: String(cfg.form),
          scope,
          token: crypto.randomUUID(),
          tokenExpiresAt: tokenExpiresAt(now),
          updatedAt: now,
        });
        await log(ctx, run._id, "issued", `collect ${cfg.form} for ${scope}`);
        await recordFlowRunStatus(ctx, run._id, "waiting", now, "flow waiting");
        await ctx.scheduler.runAfter(DEFAULTS.reminderSeconds * 1000, internal.flows.tick, {
          runId: run._id,
          phase: "reminder",
        });
        return; // parked
      } else if (step.type === "wait") {
        await ctx.db.patch("flowRuns", run._id, {
          status: "waiting",
          step: stepId,
          currentStepId: stepId,
          updatedAt: now,
        });
        await log(ctx, run._id, "wait", `${cfg.seconds ?? 5}s`);
        await recordFlowRunStatus(ctx, run._id, "waiting", now, "flow waiting");
        await ctx.scheduler.runAfter(Number(cfg.seconds ?? 5) * 1000, internal.flows.wake, {
          runId: run._id,
        });
        return; // parked
      } else if (step.type === "action") {
        await ctx.db.patch("flowRuns", run._id, {
          status: "waiting",
          step: stepId,
          currentStepId: stepId,
          updatedAt: now,
        });
        await log(ctx, run._id, "action", String(cfg.label ?? "external action"));
        await recordFlowRunStatus(ctx, run._id, "waiting", now, "flow waiting");
        await ctx.scheduler.runAfter(
          Number(cfg.delaySeconds ?? 1) * 1000,
          internal.flows.runActionStep,
          { runId: run._id },
        );
        return; // parked
      }

      // Non-parking step done → advance to its `next`.
      stepId = step.next ?? "";
      if (!stepId) {
        await complete("done");
        return;
      }
      await ctx.db.patch("flowRuns", run._id, { currentStepId: stepId, step: stepId, updatedAt: now });
    }
  },
});

/** Wake a `wait` step's parked run. */
export const wake = internalMutation({
  args: { runId: v.id("flowRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("flowRuns", args.runId);
    if (!run || run.status !== "waiting") return;
    await resumeToNext(ctx, run, Date.now());
  },
});

/**
 * Execute an `action` step's external work, then resume. This is the
 * external-boundary step: it runs as an action (could `fetch` a vendor like
 * E-Verify); here it's mocked — it records a result fact and advances.
 */
export const runActionStep = internalAction({
  args: { runId: v.id("flowRuns") },
  handler: async (ctx, args): Promise<void> => {
    // A real integration would `fetch(...)` here. Mocked for the demo.
    await ctx.runMutation(internal.flows.resumeAction, { runId: args.runId });
  },
});

export const resumeAction = internalMutation({
  args: { runId: v.id("flowRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("flowRuns", args.runId);
    if (!run || run.status !== "waiting" || !run.flowDefName) return;
    const def = await ctx.db
      .query("flowDefs")
      .withIndex("by_name", (q) => q.eq("name", run.flowDefName!))
      .first();
    const step = def?.steps.find((s) => s.id === run.currentStepId);
    const now = Date.now();
    const cfg = (step?.config ?? {}) as Record<string, unknown>;
    if (cfg.resultAttr) {
      const txId = await createTransaction(ctx, { reason: "action result", now });
      await assertInTx(ctx, txId, now, {
        e: run.subject,
        a: String(cfg.resultAttr),
        value: cfg.resultValue,
      });
      await log(ctx, run._id, "result", `${cfg.resultAttr} = ${JSON.stringify(cfg.resultValue)}`);
    }
    await resumeToNext(ctx, run, now);
  },
});

/** Install the demo onboarding flow: collect I-9 → branch → E-Verify → welcome. */
export const setupDemoFlow = mutation({
  args: {},
  handler: async (ctx): Promise<{ flowDefId: Id<"flowDefs"> }> => {
    await requireWritePrincipal(ctx);
    return await ctx.runMutation(internal.flows.defineOnboarding, {});
  },
});

export const defineOnboarding = internalMutation({
  args: {},
  handler: async (ctx): Promise<{ flowDefId: Id<"flowDefs"> }> => {
    const existing = await ctx.db
      .query("flowDefs")
      .withIndex("by_name", (q) => q.eq("name", "onboarding"))
      .first();
    const steps = [
      { id: "i9", type: "collect" as const, config: { form: "i9", scopeFrom: "employer" }, next: "branch" },
      {
        id: "branch",
        type: "branch" as const,
        config: {
          where: [["?s", "i9/citizenship", "authorized_alien"]],
          ifTrue: "everify",
          ifFalse: "welcome",
        },
      },
      {
        id: "everify",
        type: "action" as const,
        config: { label: "E-Verify check", resultAttr: "everify.status", resultValue: "verified" },
        next: "welcome",
      },
      { id: "welcome", type: "notify" as const, config: { message: "Welcome aboard!" }, next: "done" },
      { id: "done", type: "done" as const },
    ];
    const fields = {
      name: "onboarding",
      title: "Worker onboarding",
      subjectType: "Worker",
      origin: "configured" as const,
      startStepId: "i9",
      steps,
    };
    if (existing) {
      await ctx.db.patch("flowDefs", existing._id, fields);
      return { flowDefId: existing._id };
    }
    const flowDefId = await ctx.db.insert("flowDefs", { ...fields, createdAt: Date.now() });
    return { flowDefId };
  },
});
