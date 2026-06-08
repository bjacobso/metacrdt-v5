import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
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
//   (action:<name>, fields,    [{ name, label, type, ... }])       optional
//   (action:<name>, opensForm, { form, scope })                    optional

type ActionField = {
  name: string;
  label?: string;
  type: "string" | "number" | "boolean" | "select";
  required?: boolean;
  options?: string[];
  defaultValue?: unknown;
};

type ActionDef = {
  name: string;
  label?: string;
  appliesTo?: string;
  asserts: Record<string, unknown>;
  fields: ActionField[];
  opensForm?: {
    form: unknown;
    scope: unknown;
  };
};

const actionFieldValidator = v.object({
  name: v.string(),
  label: v.optional(v.string()),
  type: v.union(
    v.literal("string"),
    v.literal("number"),
    v.literal("boolean"),
    v.literal("select"),
  ),
  required: v.optional(v.boolean()),
  options: v.optional(v.array(v.string())),
  defaultValue: v.optional(v.any()),
});

const opensFormValidator = v.object({
  form: v.any(),
  scope: v.any(),
});

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
    fields: v.optional(v.array(actionFieldValidator)),
    opensForm: v.optional(opensFormValidator),
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
    if (args.fields !== undefined)
      await assertInTx(ctx, txId, now, { e, a: "fields", value: args.fields });
    if (args.opensForm !== undefined)
      await assertInTx(ctx, txId, now, { e, a: "opensForm", value: args.opensForm });
    if (args.label !== undefined)
      await assertInTx(ctx, txId, now, { e, a: "label", value: args.label });
    return { actionEntity: e };
  },
});

async function loadActionDef(ctx: QueryCtx, name: string): Promise<ActionDef | null> {
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
    fields: Array.isArray(m["fields"]?.[0])
      ? (m["fields"]![0] as ActionField[])
      : [],
    opensForm:
      m["opensForm"]?.[0] && typeof m["opensForm"][0] === "object"
        ? (m["opensForm"][0] as { form: unknown; scope: unknown })
        : undefined,
  };
}

function resolveActionValue(
  raw: unknown,
  entity: string,
  fields: ActionField[],
  args: Record<string, unknown>,
): unknown {
  if (typeof raw !== "string") return raw;
  if (raw === "$entity") return entity;
  if (!raw.startsWith("$arg.")) return raw;
  const name = raw.slice("$arg.".length);
  const field = fields.find((f) => f.name === name);
  if (!field) throw new Error(`unknown action arg placeholder: ${name}`);
  const value = args[name] ?? field.defaultValue;
  if (value === undefined && field.required !== false) {
    throw new Error(`missing action arg: ${name}`);
  }
  if (value === undefined) return null;
  if (field.type === "select" && value !== undefined) {
    const allowed = field.options ?? [];
    if (!allowed.includes(String(value))) {
      throw new Error(`invalid action arg ${name}: ${String(value)}`);
    }
  }
  return value;
}

function resolveActionString(
  label: string,
  raw: unknown,
  entity: string,
  fields: ActionField[],
  args: Record<string, unknown>,
): string {
  const value = resolveActionValue(raw, entity, fields, args);
  if (value === null || value === "") {
    throw new Error(`missing action ${label}`);
  }
  return String(value);
}

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
  const live = existing.find((r) => r.status === "waiting" && r.token);
  if (live) {
    return {
      runId: live._id,
      token: live.token!,
      collectUrl: `/collect?token=${live.token}`,
      reused: true,
    };
  }

  const now = Date.now();
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
