import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { assertInTx, createTransaction } from "./facts";
import {
  actionFieldValidator,
  actionId,
  loadActionDef,
  opensFormValidator,
  resolveActionString,
  resolveActionValue,
} from "./lib/actionDefs";
import { requireWritePrincipal } from "./lib/writeAuth";

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
//   (action:<name>, fields,    [{ name, label, type, ... }])       optional
//   (action:<name>, opensForm, { form, scope })                    optional

const DEFAULT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

/** Define (or replace) an action definition. */
export const defineAction = mutation({
  args: {
    name: v.string(),
    label: v.optional(v.string()),
    appliesTo: v.string(),
    asserts: v.any(), // Record<attribute, value>
    fields: v.optional(v.array(actionFieldValidator)),
    opensForm: v.optional(opensFormValidator),
  },
  handler: async (ctx, args) => {
    await requireWritePrincipal(ctx);
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
    if (args.fields !== undefined)
      await assertInTx(ctx, txId, now, { e, a: "fields", value: args.fields });
    if (args.opensForm !== undefined)
      await assertInTx(ctx, txId, now, { e, a: "opensForm", value: args.opensForm });
    if (args.label !== undefined)
      await assertInTx(ctx, txId, now, { e, a: "label", value: args.label });
    return { actionEntity: e };
  },
});

async function issueCollectRun(
  ctx: MutationCtx,
  args: {
    subject: string;
    form: string;
    scope: string;
  },
): Promise<{
  runId: Id<"flowRuns">;
  token: string;
  collectUrl: string;
  reused: boolean;
}> {
  const existing = await ctx.db
    .query("flowRuns")
    .withIndex("by_target", (q) =>
      q.eq("subject", args.subject).eq("form", args.form).eq("scope", args.scope),
    )
    .collect();
  const now = Date.now();
  const live = existing.find((r) => hasLiveToken(r, now));
  if (live) {
    return {
      runId: live._id,
      token: live.token!,
      collectUrl: `/collect?token=${live.token}`,
      reused: true,
    };
  }

  const token = crypto.randomUUID();
  const runId = await ctx.db.insert("flowRuns", {
    flowName: "collect",
    subject: args.subject,
    form: args.form,
    scope: args.scope,
    status: "waiting",
    step: "issued",
    issuedAt: now,
    updatedAt: now,
    token,
    tokenExpiresAt: now + DEFAULT_TOKEN_TTL_MS,
  });
  await ctx.db.insert("flowEvents", {
    runId,
    ts: now,
    kind: "issued",
    message: `collect ${args.form} for ${args.scope}`,
  });
  return { runId, token, collectUrl: `/collect?token=${token}`, reused: false };
}

/** Run an action against a target entity: assert its facts in one transaction. */
export const runAction = mutation({
  args: {
    action: v.string(),
    entity: v.string(),
    actorId: v.optional(v.string()),
    args: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    const actorId = await requireWritePrincipal(ctx);
    const def = await loadActionDef(ctx, args.action);
    if (!def) throw new Error(`unknown action: ${args.action}`);
    const now = Date.now();
    const txId = await createTransaction(ctx, {
      actorId,
      actorType: "user",
      reason: `action ${args.action} on ${args.entity}`,
      now,
    });
    let asserted = 0;
    const actionArgs = args.args ?? {};
    for (const [a, raw] of Object.entries(def.asserts)) {
      const value = resolveActionValue(raw, args.entity, def.fields, actionArgs);
      await assertInTx(ctx, txId, now, { e: args.entity, a, value });
      asserted++;
    }
    const collect =
      def.opensForm !== undefined
        ? await issueCollectRun(ctx, {
            subject: args.entity,
            form: resolveActionString(
              "form",
              def.opensForm.form,
              args.entity,
              def.fields,
              actionArgs,
            ),
            scope: resolveActionString(
              "scope",
              def.opensForm.scope,
              args.entity,
              def.fields,
              actionArgs,
            ),
          })
        : undefined;
    return { txId, asserted, collect };
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
