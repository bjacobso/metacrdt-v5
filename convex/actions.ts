import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { assertInTx, createTransaction } from "./facts";
import {
  actionFieldValidator,
  actionId,
  loadActionDef,
  listActionDefs,
  opensFormValidator,
  resolveActionString,
  resolveActionValue,
} from "./lib/actionDefs";
import { issueActionCollectRun } from "./lib/collectRuns";
import { requireTenant, tenantOrLegacyRead } from "./lib/tenantAuth";

function tenantIdForWrite(
  tenantId: Awaited<ReturnType<typeof requireTenant>>["tenantId"] | undefined,
) {
  if (tenantId === undefined) throw new Error("Tenant context required");
  return tenantId;
}

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

/** Define (or replace) an action definition. */
export const defineAction = mutation({
  args: {
    name: v.string(),
    label: v.optional(v.string()),
    appliesTo: v.string(),
    asserts: v.any(), // Record<attribute, value>
    fields: v.optional(v.array(actionFieldValidator)),
    opensForm: v.optional(opensFormValidator),
    tenantSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "admin");
    const now = Date.now();
    const e = actionId(args.name);
    const txId = await createTransaction(ctx, {
      actorId: "config",
      tenantId: tenant.tenantId,
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

/** Run an action against a target entity: assert its facts in one transaction. */
export const runAction = mutation({
  args: {
    action: v.string(),
    entity: v.string(),
    tenantSlug: v.string(),
    actorId: v.optional(v.string()),
    args: v.optional(v.record(v.string(), v.any())),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "editor");
    const actorId = tenant.principal;
    const tenantId = tenantIdForWrite(tenant.tenantId);
    const def = await loadActionDef(ctx, args.action, tenant.tenantId);
    if (!def) throw new Error(`unknown action: ${args.action}`);
    const now = Date.now();
    const txId = await createTransaction(ctx, {
      actorId,
      actorType: "user",
      tenantId,
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
        ? await issueActionCollectRun(ctx, {
            tenantId,
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
  args: { type: v.string(), tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await tenantOrLegacyRead(ctx, args.tenantSlug);
    return (await listActionDefs(ctx, tenant?.tenantId)).filter(
      (def) => def.appliesTo === args.type,
    );
  },
});

/** All action definitions (for the System view). */
export const listActions = query({
  args: { tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await tenantOrLegacyRead(ctx, args.tenantSlug);
    return await listActionDefs(ctx, tenant?.tenantId);
  },
});
