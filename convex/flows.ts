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
import { eventLogBaseWithDerivedTripleSourceForTenant } from "./lib/eventLogTripleSource";
import { assertInTx, createTransaction, retractInTx } from "./facts";
import { obligationsFromEventLog } from "./lib/obligations";
import {
  requireTenant,
  tenantOrLegacyRead,
} from "./lib/tenantAuth";
import {
  COLLECT_TOKEN_TTL_MS,
  isLiveToken,
  tokenExpiresAt as collectTokenExpiresAt,
} from "./lib/collect";
import {
  FLOW_RUN_STATUS_ATTR,
  flowRunEntity,
  stepFlow,
  validateFlowDef,
  type FlowDef,
  type FlowRun,
  type StepIntent,
} from "./lib/workflow";

// A minimal durable workflow runner for the compliance `collect` step:
//   issue → park (waiting) → resume on the matching submission fact → complete,
// with scheduled reminder / escalation / expiry timer ticks along the way.
// Step = one mutation; "wait" = a parked flowRuns row resumed by the event path
// (a submitted.<form> fact) or by a scheduler tick. This is the Convex-native
// stand-in for a durable step engine (no BullMQ, no separate workflow service).

const DEFAULTS = { reminderSeconds: 10, escalateSeconds: 30 };

type FlowRunStatus = Doc<"flowRuns">["status"];

function tenantIdForWrite(tenantId: Id<"tenants"> | undefined): Id<"tenants"> {
  if (tenantId === undefined) throw new Error("Tenant context required");
  return tenantId;
}

function tokenExpiresAt(now: number, expireSeconds?: number): number {
  return expireSeconds === undefined
    ? now + COLLECT_TOKEN_TTL_MS
    : collectTokenExpiresAt(now, expireSeconds);
}

async function log(
  ctx: MutationCtx,
  runId: Id<"flowRuns">,
  kind: string,
  message?: string,
): Promise<void> {
  const run = await ctx.db.get(runId);
  if (run === null) throw new Error(`flow run ${runId} not found`);
  await ctx.db.insert("flowEvents", {
    tenantId: run.tenantId,
    runId,
    ts: Date.now(),
    kind,
    message,
  });
}

async function recordFlowRunStatus(
  ctx: MutationCtx,
  runId: Id<"flowRuns">,
  status: FlowRunStatus,
  now: number,
  reason: string,
): Promise<void> {
  const run = await ctx.db.get(runId);
  if (run === null) throw new Error(`flow run ${runId} not found`);
  const tenantId = run.tenantId;
  const txId = await createTransaction(ctx, {
    tenantId,
    actorId: "system:flows",
    actorType: "system",
    reason,
    source: "flowRuns",
    now,
  });
  const entity = flowRunEntity(runId);
  const current = await ctx.db
    .query("currentFacts")
    .withIndex("by_tenant_and_e_a", (q) =>
      q.eq("tenantId", tenantId).eq("e", entity).eq("a", FLOW_RUN_STATUS_ATTR),
    )
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
    tenantSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "editor");
    const tenantId = tenantIdForWrite(tenant.tenantId);
    // Don't double-issue: reuse an existing live run for the same target.
    const existing = await ctx.db
      .query("flowRuns")
      .withIndex("by_tenant_and_target", (q) =>
        q
          .eq("tenantId", tenantId)
          .eq("subject", args.subject)
          .eq("form", args.form)
          .eq("scope", args.scope),
      )
      .collect();
    const now = Date.now();
    const live = existing.find((r) => isLiveToken(r, now));
    if (live) return { runId: live._id, reused: true };

    const reminderSeconds = args.reminderSeconds ?? DEFAULTS.reminderSeconds;
    const escalateSeconds = args.escalateSeconds ?? DEFAULTS.escalateSeconds;
    const runId = await ctx.db.insert("flowRuns", {
      tenantId,
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
  args: { subject: v.string(), tenantSlug: v.string() },
  handler: async (ctx, args): Promise<{ issued: number }> => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "editor");
    const tenantId = tenantIdForWrite(tenant.tenantId);
    const openTasks = (
      await obligationsFromEventLog(ctx, {
        worker: args.subject,
        tenantId,
        limit: 500,
      })
    ).filter((o) => o.open);

    let issued = 0;
    for (const task of openTasks) {
      const res: { reused: boolean } = await ctx.runMutation(
        internal.flows.startCollectInternal,
        {
          tenantId,
          subject: args.subject,
          form: task.form,
          scope: task.scope,
        },
      );
      if (!res.reused) issued++;
    }
    return { issued };
  },
});

// Internal twin of startCollect so issueAllOpen can call it within the tx.
export const startCollectInternal = internalMutation({
  args: {
    tenantId: v.id("tenants"),
    subject: v.string(),
    form: v.string(),
    scope: v.string(),
  },
  handler: async (ctx, args): Promise<{ runId: Id<"flowRuns">; reused: boolean }> => {
    const existing = await ctx.db
      .query("flowRuns")
      .withIndex("by_tenant_and_target", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("subject", args.subject)
          .eq("form", args.form)
          .eq("scope", args.scope),
      )
      .collect();
    const now = Date.now();
    const live = existing.find((r) => isLiveToken(r, now));
    if (live) return { runId: live._id, reused: true };

    const runId = await ctx.db.insert("flowRuns", {
      tenantId: args.tenantId,
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
  args: {
    tenantId: v.id("tenants"),
    subject: v.string(),
    form: v.string(),
    scope: v.string(),
  },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("flowRuns")
      .withIndex("by_tenant_and_target", (q) =>
        q
          .eq("tenantId", args.tenantId)
          .eq("subject", args.subject)
          .eq("form", args.form)
          .eq("scope", args.scope),
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
  args: { runId: v.id("flowRuns"), tenantSlug: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("flowRuns", args.runId);
    if (!run || run.status !== "waiting") return;
    const tenant = await requireTenant(ctx, args.tenantSlug, "editor");
    if (run.tenantId !== tenant.tenantId) {
      throw new Error("Tenant access denied");
    }
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
  args: { subject: v.optional(v.string()), tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await tenantOrLegacyRead(ctx, args.tenantSlug);
    const runs =
      tenant === null
        ? args.subject
          ? await ctx.db
              .query("flowRuns")
              .withIndex("by_subject", (q) => q.eq("subject", args.subject!))
              .order("desc")
              .take(100)
          : await ctx.db.query("flowRuns").order("desc").take(100)
        : args.subject
          ? await ctx.db
              .query("flowRuns")
              .withIndex("by_tenant_and_subject", (q) =>
                q.eq("tenantId", tenant.tenantId).eq("subject", args.subject!),
              )
              .order("desc")
              .take(100)
          : await ctx.db
              .query("flowRuns")
              .withIndex("by_tenant_and_status", (q) =>
                q.eq("tenantId", tenant.tenantId),
              )
              .order("desc")
              .take(100);

    const out = [];
    for (const run of runs) {
      const events =
        tenant === null
          ? await ctx.db
              .query("flowEvents")
              .withIndex("by_run", (q) => q.eq("runId", run._id))
              .order("desc")
              .take(50)
          : await ctx.db
              .query("flowEvents")
              .withIndex("by_tenant_and_run", (q) =>
                q.eq("tenantId", tenant.tenantId).eq("runId", run._id),
              )
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
  args: { name: v.string(), tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await tenantOrLegacyRead(ctx, args.tenantSlug);
    if (tenant === null) {
      return await ctx.db
        .query("flowDefs")
        .withIndex("by_name", (q) => q.eq("name", args.name))
        .first();
    }
    return await ctx.db
      .query("flowDefs")
      .withIndex("by_tenant_and_name", (q) =>
        q.eq("tenantId", tenant.tenantId).eq("name", args.name),
      )
      .first();
  },
});

/** All flow definitions (for listing / starting), origin-tagged. */
export const listFlowDefs = query({
  args: { tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await tenantOrLegacyRead(ctx, args.tenantSlug);
    const defs =
      tenant === null
        ? await ctx.db.query("flowDefs").take(50)
        : await ctx.db
            .query("flowDefs")
            .withIndex("by_tenant_and_name", (q) =>
              q.eq("tenantId", tenant.tenantId),
            )
            .take(50);
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
  args: { type: v.string(), tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await tenantOrLegacyRead(ctx, args.tenantSlug);
    const defs =
      tenant === null
        ? await ctx.db.query("flowDefs").take(50)
        : await ctx.db
            .query("flowDefs")
            .withIndex("by_tenant_and_name", (q) =>
              q.eq("tenantId", tenant.tenantId),
            )
            .take(50);
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

/** Move a parked run to its current step's `next` and re-enter the interpreter. */
async function resumeToNext(
  ctx: MutationCtx,
  run: Doc<"flowRuns">,
  now: number,
): Promise<void> {
  const def =
    run.flowDefName === undefined
      ? null
      : run.tenantId === undefined
        ? await ctx.db
            .query("flowDefs")
            .withIndex("by_name", (q) => q.eq("name", run.flowDefName!))
            .first()
        : await ctx.db
            .query("flowDefs")
            .withIndex("by_tenant_and_name", (q) =>
              q.eq("tenantId", run.tenantId).eq("name", run.flowDefName!),
            )
            .first();
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
    tenantSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "admin");
    const tenantId = tenantIdForWrite(tenant.tenantId);
    const validation = validateFlowDef(args as FlowDef);
    if (!validation.ok) {
      throw new Error(
        `invalid flow ${args.name}: ${validation.diagnostics.map((d) => d.message).join("; ")}`,
      );
    }
    const existing = await ctx.db
      .query("flowDefs")
      .withIndex("by_tenant_and_name", (q) =>
        q.eq("tenantId", tenantId).eq("name", args.name),
      )
      .first();
    const fields = {
      tenantId,
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
    tenantSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "editor");
    const tenantId = tenantIdForWrite(tenant.tenantId);
    const def = await ctx.db
      .query("flowDefs")
      .withIndex("by_tenant_and_name", (q) =>
        q.eq("tenantId", tenantId).eq("name", args.flowDefName),
      )
      .first();
    if (!def) throw new Error(`unknown flow: ${args.flowDefName}`);
    const now = Date.now();
    const runId = await ctx.db.insert("flowRuns", {
      tenantId,
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

function flowDefFromDoc(def: Doc<"flowDefs">): FlowDef {
  return {
    name: def.name,
    ...(def.title === undefined ? {} : { title: def.title }),
    ...(def.subjectType === undefined ? {} : { subjectType: def.subjectType }),
    origin: def.origin ?? "configured",
    startStepId: def.startStepId,
    steps: def.steps,
  };
}

function flowRunFromDoc(run: Doc<"flowRuns">): FlowRun {
  return {
    id: run._id,
    flowName: run.flowName,
    ...(run.flowDefName === undefined ? {} : { flowDefName: run.flowDefName }),
    subject: run.subject,
    status: run.status,
    step: run.step,
    ...(run.currentStepId === undefined ? {} : { currentStepId: run.currentStepId }),
    ...(run.context === undefined ? {} : { context: run.context as Record<string, unknown> }),
    ...(run.form === undefined ? {} : { form: run.form }),
    ...(run.scope === undefined ? {} : { scope: run.scope }),
  };
}

async function patchFlowRunFromReducer(
  ctx: MutationCtx,
  runId: Id<"flowRuns">,
  run: FlowRun,
  now: number,
  extra: Partial<Doc<"flowRuns">> = {},
): Promise<void> {
  await ctx.db.patch("flowRuns", runId, {
    status: run.status as FlowRunStatus,
    step: run.step ?? run.currentStepId ?? "",
    ...(run.currentStepId === undefined ? {} : { currentStepId: run.currentStepId }),
    ...(run.context === undefined ? {} : { context: run.context }),
    ...(run.form === undefined ? {} : { form: run.form }),
    ...(run.scope === undefined ? {} : { scope: run.scope }),
    updatedAt: now,
    ...extra,
  });
}

function collectTimerPhase(timer: { kind: string }): "reminder" | "escalate" | "expire" | null {
  if (timer.kind === "collect-reminder") return "reminder";
  if (timer.kind === "collect-escalate") return "escalate";
  if (timer.kind === "collect-expire") return "expire";
  return null;
}

/** The interpreter: execute steps until a parking step or completion. */
export const advanceFlow = internalMutation({
  args: { runId: v.id("flowRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get("flowRuns", args.runId);
    if (!run || !run.flowDefName || run.status !== "running") return;
    const def = await ctx.db
      .query("flowDefs")
      .withIndex("by_tenant_and_name", (q) =>
        q.eq("tenantId", run.tenantId).eq("name", run.flowDefName!),
      )
      .first();
    if (!def) return;

    const now = Date.now();
    let txId: Id<"transactions"> | null = null;
    const getTx = async () =>
      (txId ??= await createTransaction(ctx, {
        tenantId: run.tenantId,
        reason: `flow ${def.name}`,
        now,
      }));
    const flowDef = flowDefFromDoc(def);
    let runState = flowRunFromDoc(run);
    const branchResults: Record<string, boolean> = {};

    for (let i = 0; i < 50; i++) {
      const result = stepFlow(flowDef, runState, {
        branchResults,
        runId: run._id,
      });
      let branchIntent: Extract<StepIntent, { kind: "branch" }> | null = null;
      let extraPatch: Partial<Doc<"flowRuns">> = {};

      for (const intent of result.intents) {
        if (intent.kind === "assert") {
          const tx = await getTx();
          await assertInTx(ctx, tx, now, {
            e: intent.e,
            a: intent.a,
            value: intent.v,
          });
        } else if (intent.kind === "log") {
          await log(ctx, run._id, intent.event, intent.message);
        } else if (intent.kind === "branch") {
          branchIntent = intent;
          break;
        } else if (intent.kind === "park") {
          await recordFlowRunStatus(ctx, run._id, "waiting", now, "flow waiting");
          if (intent.reason === "collect") {
            const timers = intent.timers ?? [];
            extraPatch = {
              ...extraPatch,
              token: crypto.randomUUID(),
              tokenExpiresAt: tokenExpiresAt(now),
            };
            if (timers.length === 0) {
              await ctx.scheduler.runAfter(DEFAULTS.reminderSeconds * 1000, internal.flows.tick, {
                runId: run._id,
                phase: "reminder",
              });
            } else {
              for (const timer of timers) {
                const phase = collectTimerPhase(timer);
                if (phase === null) continue;
                await ctx.scheduler.runAfter(timer.afterMs, internal.flows.tick, {
                  runId: run._id,
                  phase,
                });
              }
            }
          }
        } else if (intent.kind === "schedule") {
          if (intent.op.op === "flow.resume") {
            await ctx.scheduler.runAfter(intent.afterMs, internal.flows.wake, {
              runId: run._id,
            });
          } else if (intent.op.op === "flow.action") {
            await ctx.scheduler.runAfter(intent.afterMs, internal.flows.runActionStep, {
              runId: run._id,
            });
          }
        } else if (intent.kind === "complete") {
          await recordFlowRunStatus(ctx, run._id, "completed", now, "flow completed");
        }
      }

      await patchFlowRunFromReducer(ctx, run._id, result.run, now, extraPatch);
      runState = result.run;

      if (branchIntent) {
        const bindings = await runWhere(
          ctx,
          [...branchIntent.where],
          { txTime: now, validTime: now },
          { [branchIntent.subjectVar]: run.subject },
          { source: eventLogBaseWithDerivedTripleSourceForTenant(run.tenantId) },
        );
        branchResults[branchIntent.stepId] = bindings.length > 0;
        continue;
      }

      return;
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
    const flowDef = await ctx.db
      .query("flowDefs")
      .withIndex("by_tenant_and_name", (q) =>
        q.eq("tenantId", run.tenantId).eq("name", run.flowDefName!),
      )
      .first();
    const step = flowDef?.steps.find((s) => s.id === run.currentStepId);
    const now = Date.now();
    const cfg = (step?.config ?? {}) as Record<string, unknown>;
    if (cfg.resultAttr) {
      const txId = await createTransaction(ctx, {
        tenantId: run.tenantId,
        reason: "action result",
        now,
      });
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
  args: { tenantSlug: v.string() },
  handler: async (ctx, args): Promise<{ flowDefId: Id<"flowDefs"> }> => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "admin");
    return await ctx.runMutation(internal.flows.defineOnboarding, {
      tenantId: tenantIdForWrite(tenant.tenantId),
    });
  },
});

export const defineOnboarding = internalMutation({
  args: { tenantId: v.id("tenants") },
  handler: async (ctx, args): Promise<{ flowDefId: Id<"flowDefs"> }> => {
    const existing = await ctx.db
      .query("flowDefs")
      .withIndex("by_tenant_and_name", (q) =>
        q.eq("tenantId", args.tenantId).eq("name", "onboarding"),
      )
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
      tenantId: args.tenantId,
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
