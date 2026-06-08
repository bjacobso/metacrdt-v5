import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { components } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  loadActionDef,
  resolveActionString,
  resolveActionValue,
} from "./lib/actionDefs";
import { attrId, BUILTIN_CARDINALITY } from "./lib/meta";
import { requireWritePrincipal } from "./lib/writeAuth";

const hlcValidator = v.object({
  pt: v.number(),
  l: v.number(),
  r: v.string(),
});

const protocolKind = v.union(
  v.literal("assert"),
  v.literal("retract"),
  v.literal("tombstone"),
  v.literal("untombstone"),
  v.literal("correction"),
);

const eventSummaryValidator = v.object({
  eventId: v.optional(v.string()),
  kind: protocolKind,
  e: v.string(),
  a: v.string(),
  v: v.any(),
  txTime: v.number(),
  actor: v.string(),
  actorType: v.union(
    v.literal("human"),
    v.literal("system"),
    v.literal("agent"),
    v.literal("migration"),
  ),
  validFrom: v.optional(v.number()),
  validTo: v.optional(v.number()),
  hlc: v.optional(hlcValidator),
  targetEventId: v.optional(v.string()),
  causalRefs: v.array(v.string()),
  hasProtocolMetadata: v.boolean(),
  verifiable: v.boolean(),
  validEventId: v.boolean(),
  reason: v.optional(v.string()),
});

const ownedProtocolKind = v.union(
  v.literal("assert"),
  v.literal("retract"),
  v.literal("tombstone"),
  v.literal("untombstone"),
);

const cardinality = v.union(v.literal("many"), v.literal("one"));
const workerStatus = v.union(v.literal("active"), v.literal("terminated"));

const ownedEventSummaryValidator = v.object({
  rowId: v.string(),
  txId: v.string(),
  eventId: v.string(),
  kind: ownedProtocolKind,
  e: v.string(),
  a: v.string(),
  v: v.any(),
  txTime: v.number(),
  actor: v.string(),
  actorType: v.union(
    v.literal("human"),
    v.literal("system"),
    v.literal("agent"),
    v.literal("migration"),
  ),
  validFrom: v.optional(v.number()),
  validTo: v.optional(v.number()),
  hlc: hlcValidator,
  targetEventId: v.optional(v.string()),
  causalRefs: v.array(v.string()),
  hasProtocolMetadata: v.boolean(),
  verifiable: v.boolean(),
  validEventId: v.boolean(),
  reason: v.optional(v.string()),
});

const appendOwnedResultValidator = v.object({
  txId: v.string(),
  rowId: v.string(),
  eventId: v.string(),
  factId: v.optional(v.string()),
});

const createOwnedEntityResultValidator = v.object({
  e: v.string(),
  asserted: v.array(appendOwnedResultValidator),
});

const collectResultValidator = v.object({
  runId: v.string(),
  token: v.string(),
  collectUrl: v.string(),
  reused: v.boolean(),
});

const runOwnedActionResultValidator = v.object({
  action: v.string(),
  asserted: v.array(appendOwnedResultValidator),
  collect: v.optional(collectResultValidator),
});

const ownedCurrentFactValidator = v.object({
  factId: v.string(),
  e: v.string(),
  a: v.string(),
  v: v.any(),
  assertedAt: v.number(),
  validFrom: v.number(),
  validTo: v.optional(v.number()),
  txTime: v.number(),
  updatedAt: v.number(),
  assertEventId: v.string(),
});

const ownedCurrentAttributeValidator = v.object({
  a: v.string(),
  values: v.array(v.any()),
  facts: v.array(ownedCurrentFactValidator),
});

const ownedCurrentEntityValidator = v.object({
  e: v.string(),
  facts: v.array(ownedCurrentFactValidator),
  attributes: v.array(ownedCurrentAttributeValidator),
});

const ownedCurrentEntityListItemValidator = v.object({
  e: v.string(),
  type: v.string(),
  name: v.optional(v.any()),
  updatedAt: v.number(),
  typeFact: ownedCurrentFactValidator,
});

const rebuildOwnedResultValidator = v.object({
  events: v.number(),
  facts: v.number(),
  currentFacts: v.number(),
});

const createOwnedAttributeValidator = v.object({
  a: v.string(),
  value: v.any(),
  cardinality: v.optional(cardinality),
});

const ownedFormFieldValidator = v.object({
  name: v.string(),
  label: v.string(),
  type: v.union(
    v.literal("string"),
    v.literal("number"),
    v.literal("boolean"),
    v.literal("date"),
    v.literal("select"),
  ),
  required: v.optional(v.boolean()),
  options: v.optional(v.array(v.string())),
  pii: v.optional(v.boolean()),
  sensitive: v.optional(v.boolean()),
});

async function actorContext(ctx: MutationCtx) {
  const actorId = await requireWritePrincipal(ctx);
  return {
    actorId,
    actorType: "user" as const,
  };
}

async function hostCardinalityOf(
  ctx: MutationCtx,
  a: string,
): Promise<"one" | "many"> {
  const row = await ctx.db
    .query("currentFacts")
    .withIndex("by_e_a", (q) => q.eq("e", attrId(a)).eq("a", "cardinality"))
    .first();
  if (row) return row.v === "one" ? "one" : "many";
  return BUILTIN_CARDINALITY[a] ?? "many";
}

function withoutUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) out[key] = value;
  }
  return out as T;
}

function componentRow(row: Doc<"factEvents">) {
  return {
    txTime: row.txTime,
    eventId: row.eventId,
    hlc: row.hlc,
    replicaId: row.replicaId,
    seq: row.seq,
    targetEventId: row.targetEventId,
    causalRefs: row.causalRefs,
    kind: row.kind,
    e: row.e,
    a: row.a,
    v: row.v,
    validFrom: row.validFrom,
    validTo: row.validTo,
    reason: row.reason,
  };
}

function componentTx(tx: Doc<"transactions">) {
  return {
    _creationTime: tx._creationTime,
    actorId: tx.actorId,
    actorType: tx.actorType,
    txTime: tx.txTime,
    reason: tx.reason,
  };
}

/**
 * App-owned wrapper around the packaged @metacrdt/convex component. The host app
 * owns tables, auth, and row selection; the component owns protocol verification
 * and summary semantics.
 */
export const verifyEvents = query({
  args: {
    e: v.string(),
    a: v.optional(v.string()),
    limit: v.optional(v.number()),
    requireValid: v.optional(v.boolean()),
  },
  returns: v.array(eventSummaryValidator),
  handler: async (ctx, args) => {
    const take = Math.max(1, Math.min(args.limit ?? 50, 200));
    const a = args.a;
    const rows =
      a === undefined
        ? await ctx.db
            .query("factEvents")
            .withIndex("by_e", (q) => q.eq("e", args.e))
            .order("desc")
            .take(take)
        : await ctx.db
            .query("factEvents")
            .withIndex("by_e_a_tx", (q) => q.eq("e", args.e).eq("a", a))
            .order("desc")
            .take(take);

    const inputs = [];
    for (const row of rows) {
      const tx = await ctx.db.get(row.txId);
      if (tx === null) continue;
      inputs.push({ row: componentRow(row), tx: componentTx(tx) });
    }

    const summaries = await ctx.runQuery(components.metacrdt.protocol.summarizeRows, {
      inputs,
    });

    if (args.requireValid === true) {
      for (const summary of summaries) {
        if (summary.hasProtocolMetadata && !summary.validEventId) {
          throw new Error(
            `invalid protocol event ${summary.eventId ?? "(missing)"}`,
          );
        }
      }
    }

    return summaries;
  },
});

/**
 * App wrapper for the state-owning @metacrdt/convex component log. The app owns
 * auth and decides what may be written; the component owns the durable protocol
 * transaction/event tables.
 */
export const appendOwnedAssert = mutation({
  args: {
    e: v.string(),
    a: v.string(),
    value: v.any(),
    validFrom: v.optional(v.number()),
    validTo: v.optional(v.number()),
    reason: v.optional(v.string()),
    source: v.optional(v.string()),
    metadata: v.optional(v.any()),
    cardinality: v.optional(cardinality),
  },
  returns: appendOwnedResultValidator,
  handler: async (ctx, args) => {
    const actor = await actorContext(ctx);
    return await ctx.runMutation(
      components.metacrdt.log.appendAssert,
      withoutUndefined({
        ...actor,
        e: args.e,
        a: args.a,
        v: args.value,
        validFrom: args.validFrom,
        validTo: args.validTo,
        reason: args.reason,
        source: args.source,
        eventMetadata: args.metadata,
        cardinality: args.cardinality,
      }),
    );
  },
});

export const createOwnedEntity = mutation({
  args: {
    e: v.string(),
    type: v.string(),
    name: v.optional(v.string()),
    attributes: v.optional(v.array(createOwnedAttributeValidator)),
  },
  returns: createOwnedEntityResultValidator,
  handler: async (ctx, args) => {
    const actor = await actorContext(ctx);
    const asserted = [];
    const rows = [
      { a: "type", value: args.type, cardinality: "one" as const },
      ...(args.name === undefined
        ? []
        : [{ a: "name", value: args.name, cardinality: "one" as const }]),
      ...(args.attributes ?? []),
    ];

    if (rows.length > 12) {
      throw new Error("createOwnedEntity supports at most 12 initial facts");
    }

    for (const row of rows) {
      asserted.push(
        await ctx.runMutation(
          components.metacrdt.log.appendAssert,
          withoutUndefined({
            ...actor,
            e: args.e,
            a: row.a,
            v: row.value,
            reason: `create component-owned ${args.type}`,
            source: "metacrdtComponent.createOwnedEntity",
            cardinality: row.cardinality ?? "one",
          }),
        ),
      );
    }

    return { e: args.e, asserted };
  },
});

export const defineOwnedForm = mutation({
  args: {
    form: v.string(),
    title: v.string(),
    fields: v.array(ownedFormFieldValidator),
  },
  returns: createOwnedEntityResultValidator,
  handler: async (ctx, args) => {
    const actor = await actorContext(ctx);
    const e = `form:${args.form}`;
    const asserted = [];
    for (const row of [
      { a: "type", v: "Form" },
      { a: "formDef", v: { title: args.title, fields: args.fields } },
    ]) {
      asserted.push(
        await ctx.runMutation(
          components.metacrdt.log.appendAssert,
          withoutUndefined({
            ...actor,
            e,
            a: row.a,
            v: row.v,
            reason: `define component-owned form ${args.form}`,
            source: "metacrdtComponent.defineOwnedForm",
            cardinality: "one" as const,
          }),
        ),
      );
    }
    return { e, asserted };
  },
});

export const setOwnedWorkerStatus = mutation({
  args: {
    e: v.string(),
    status: workerStatus,
  },
  returns: appendOwnedResultValidator,
  handler: async (ctx, args) => {
    const actor = await actorContext(ctx);
    return await ctx.runMutation(
      components.metacrdt.log.appendAssert,
      withoutUndefined({
        ...actor,
        e: args.e,
        a: "worker.status",
        v: args.status,
        reason: `set component-owned worker status to ${args.status}`,
        source: "metacrdtComponent.setOwnedWorkerStatus",
        cardinality: "one" as const,
      }),
    );
  },
});

export const runOwnedAction = mutation({
  args: {
    action: v.string(),
    entity: v.string(),
    args: v.optional(v.record(v.string(), v.any())),
  },
  returns: runOwnedActionResultValidator,
  handler: async (ctx, args) => {
    const def = await loadActionDef(ctx, args.action);
    if (!def) throw new Error(`unknown action: ${args.action}`);

    const entity = await ctx.runQuery(components.metacrdt.log.getCurrentEntity, {
      e: args.entity,
    });
    if (entity === null) {
      throw new Error(`component-owned entity ${args.entity} not found`);
    }
    const types =
      entity.attributes
        .find((attr) => attr.a === "type")
        ?.values.map((value) => String(value)) ?? [];
    if (def.appliesTo !== undefined && !types.includes(def.appliesTo)) {
      throw new Error(
        `action ${args.action} applies to ${def.appliesTo}, not ${types.join(", ") || "(untyped)"}`,
      );
    }

    const actor = await actorContext(ctx);
    const actionArgs = args.args ?? {};
    const asserted = [];
    for (const [a, raw] of Object.entries(def.asserts)) {
      const value = resolveActionValue(raw, args.entity, def.fields, actionArgs);
      asserted.push(
        await ctx.runMutation(
          components.metacrdt.log.appendAssert,
          withoutUndefined({
            ...actor,
            e: args.entity,
            a,
            v: value,
            reason: `component-owned action ${args.action} on ${args.entity}`,
            source: "metacrdtComponent.runOwnedAction",
            cardinality: await hostCardinalityOf(ctx, a),
          }),
        ),
      );
    }

    const collect =
      def.opensForm !== undefined
        ? await ctx.runMutation(
            components.metacrdt.log.issueCollection,
            withoutUndefined({
              ...actor,
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
            }),
          )
        : undefined;

    return withoutUndefined({ action: args.action, asserted, collect });
  },
});

export const appendOwnedLifecycle = mutation({
  args: {
    kind: v.union(
      v.literal("retract"),
      v.literal("tombstone"),
      v.literal("untombstone"),
    ),
    targetEventId: v.string(),
    e: v.string(),
    a: v.string(),
    value: v.any(),
    validTo: v.optional(v.number()),
    reason: v.optional(v.string()),
    source: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  returns: appendOwnedResultValidator,
  handler: async (ctx, args) => {
    const actor = await actorContext(ctx);
    return await ctx.runMutation(
      components.metacrdt.log.appendLifecycle,
      withoutUndefined({
        ...actor,
        kind: args.kind,
        targetEventId: args.targetEventId,
        e: args.e,
        a: args.a,
        v: args.value,
        validTo: args.validTo,
        reason: args.reason,
        source: args.source,
        eventMetadata: args.metadata,
      }),
    );
  },
});

export const listOwnedEvents = query({
  args: {
    e: v.optional(v.string()),
    a: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(ownedEventSummaryValidator),
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.metacrdt.log.listEvents,
      withoutUndefined(args),
    ),
});

export const listOwnedCurrent = query({
  args: {
    e: v.optional(v.string()),
    a: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(ownedCurrentFactValidator),
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.metacrdt.log.listCurrent,
      withoutUndefined(args),
    ),
});

export const getOwnedCurrentEntity = query({
  args: {
    e: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.union(ownedCurrentEntityValidator, v.null()),
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.metacrdt.log.getCurrentEntity,
      withoutUndefined(args),
    ),
});

export const listOwnedCurrentEntities = query({
  args: {
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(ownedCurrentEntityListItemValidator),
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.metacrdt.log.listCurrentEntities,
      withoutUndefined(args),
    ),
});

export const rebuildOwnedProjections = mutation({
  args: {},
  returns: rebuildOwnedResultValidator,
  handler: async (ctx) => {
    await requireWritePrincipal(ctx);
    return await ctx.runMutation(components.metacrdt.log.rebuildProjections, {});
  },
});
