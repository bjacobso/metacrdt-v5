import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
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

const ownedCollectionRunValidator = v.object({
  runId: v.string(),
  subject: v.string(),
  form: v.string(),
  scope: v.string(),
  status: v.string(),
  issuedAt: v.number(),
  updatedAt: v.number(),
  token: v.string(),
  tokenExpiresAt: v.optional(v.number()),
  tokenConsumedAt: v.optional(v.number()),
  context: v.optional(v.any()),
});

const runOwnedActionResultValidator = v.object({
  action: v.string(),
  asserted: v.array(appendOwnedResultValidator),
  collect: v.optional(collectResultValidator),
});

const ownedComplianceDecision = v.union(
  v.literal("reuse"),
  v.literal("collect"),
);

const ownedComplianceItemValidator = v.object({
  form: v.string(),
  scope: v.string(),
  decision: ownedComplianceDecision,
  placements: v.array(v.string()),
  reason: v.string(),
});

const ownedCompliancePlanValidator = v.object({
  worker: v.string(),
  items: v.array(ownedComplianceItemValidator),
  unsupported: v.array(
    v.object({
      rule: v.string(),
      reason: v.string(),
    }),
  ),
  summary: v.object({
    reuse: v.number(),
    collect: v.number(),
    total: v.number(),
    unsupported: v.number(),
  }),
});

const ownedComplianceIssueItemValidator = v.object({
  form: v.string(),
  scope: v.string(),
  token: v.string(),
  collectUrl: v.string(),
  reused: v.boolean(),
});

const ownedComplianceIssueResultValidator = v.object({
  worker: v.string(),
  issued: v.number(),
  reused: v.number(),
  items: v.array(ownedComplianceIssueItemValidator),
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

type ComponentReadCtx = QueryCtx | MutationCtx;

type OwnedEntity = {
  e: string;
  facts: Array<{
    factId: string;
    e: string;
    a: string;
    v: unknown;
    assertedAt: number;
    validFrom: number;
    validTo?: number;
    txTime: number;
    updatedAt: number;
    assertEventId: string;
  }>;
  attributes: Array<{
    a: string;
    values: unknown[];
    facts: Array<{
      factId: string;
      e: string;
      a: string;
      v: unknown;
      assertedAt: number;
      validFrom: number;
      validTo?: number;
      txTime: number;
      updatedAt: number;
      assertEventId: string;
    }>;
  }>;
};

type OwnedEntityMap = Map<string, unknown[]>;

type RequirementSpec = {
  form: string;
  scopeAttr: string;
  guard?: { attr: string; value: unknown };
};

type ParsedRequirement =
  | { ok: true; rule: string; requirement: RequirementSpec }
  | { ok: false; rule: string; reason: string };

type OwnedCompliancePlan = {
  worker: string;
  items: Array<{
    form: string;
    scope: string;
    decision: "reuse" | "collect";
    placements: string[];
    reason: string;
  }>;
  unsupported: Array<{ rule: string; reason: string }>;
  summary: {
    reuse: number;
    collect: number;
    total: number;
    unsupported: number;
  };
};

function isPattern(x: unknown): x is [unknown, unknown, unknown] {
  return Array.isArray(x) && x.length === 3;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function entityMap(entity: OwnedEntity | null): OwnedEntityMap {
  const attrs: OwnedEntityMap = new Map();
  if (entity === null) return attrs;
  for (const attr of entity.attributes) attrs.set(attr.a, attr.values);
  return attrs;
}

function firstString(attrs: OwnedEntityMap, a: string): string | undefined {
  const value = attrs.get(a)?.find((v) => typeof v === "string");
  return typeof value === "string" ? value : undefined;
}

function hasValue(attrs: OwnedEntityMap, a: string, v: unknown): boolean {
  return (attrs.get(a) ?? []).some((value) => sameValue(value, v));
}

function hasType(attrs: OwnedEntityMap, type: string): boolean {
  return hasValue(attrs, "type", type);
}

function parseRequirementRule(rule: Doc<"rules">): ParsedRequirement {
  if (!rule.name.startsWith("require.")) {
    return { ok: false, rule: rule.name, reason: "not a requirement rule" };
  }
  const form = rule.name.slice("require.".length);
  if (rule.where === undefined || rule.emit === undefined) {
    return { ok: false, rule: rule.name, reason: "missing where or emit" };
  }
  if (
    rule.emit.e !== "?w" ||
    rule.emit.a !== `requires.${form}` ||
    rule.emit.v !== "?s"
  ) {
    return {
      ok: false,
      rule: rule.name,
      reason: "emit shape is not a component compliance requirement",
    };
  }

  const patterns = rule.where.filter(isPattern);
  const hasPlacementType = patterns.some(
    ([e, a, v]) => e === "?p" && a === "type" && v === "Placement",
  );
  const hasWorker = patterns.some(
    ([e, a, v]) => e === "?p" && a === "worker" && v === "?w",
  );
  if (!hasPlacementType || !hasWorker) {
    return {
      ok: false,
      rule: rule.name,
      reason: "missing Placement type or worker clause",
    };
  }

  const scopes = patterns.filter(
    ([e, a, v]) =>
      e === "?p" &&
      typeof a === "string" &&
      a !== "type" &&
      a !== "worker" &&
      v === "?s",
  );
  if (scopes.length !== 1 || typeof scopes[0]?.[1] !== "string") {
    return {
      ok: false,
      rule: rule.name,
      reason: "expected exactly one placement scope clause",
    };
  }

  const guards = patterns.filter(
    ([e, a, v]) =>
      e === "?s" &&
      typeof a === "string" &&
      !(typeof v === "string" && v.startsWith("?")),
  );
  if (guards.length > 1) {
    return {
      ok: false,
      rule: rule.name,
      reason: "multiple guards are not yet supported",
    };
  }

  const guard =
    guards.length === 1 && typeof guards[0]?.[1] === "string"
      ? { attr: guards[0][1], value: guards[0][2] }
      : undefined;
  return {
    ok: true,
    rule: rule.name,
    requirement: {
      form,
      scopeAttr: scopes[0][1],
      ...(guard === undefined ? {} : { guard }),
    },
  };
}

async function loadOwnedEntity(
  ctx: ComponentReadCtx,
  e: string,
): Promise<OwnedEntity | null> {
  return await ctx.runQuery(components.metacrdt.log.getCurrentEntity, { e });
}

async function componentPlacementIdsForWorker(
  ctx: ComponentReadCtx,
  worker: string,
): Promise<string[]> {
  const rows = await ctx.runQuery(components.metacrdt.log.listCurrent, {
    a: "worker",
    limit: 500,
  });
  return [
    ...new Set(
      rows
        .filter((row) => row.v === worker)
        .map((row) => row.e)
        .sort(),
    ),
  ];
}

async function buildOwnedCompliancePlan(
  ctx: ComponentReadCtx,
  worker: string,
): Promise<OwnedCompliancePlan> {
  const workerEntity = await loadOwnedEntity(ctx, worker);
  if (workerEntity === null) {
    throw new Error(`component-owned worker ${worker} not found`);
  }
  const workerAttrs = entityMap(workerEntity);
  if (!hasType(workerAttrs, "Worker")) {
    throw new Error(`component-owned entity ${worker} is not a Worker`);
  }

  const rules = await ctx.db
    .query("rules")
    .withIndex("by_enabled", (q) => q.eq("enabled", true))
    .take(1000);
  const requirements: RequirementSpec[] = [];
  const unsupported: OwnedCompliancePlan["unsupported"] = [];
  for (const rule of rules) {
    if (!rule.name.startsWith("require.")) continue;
    const parsed = parseRequirementRule(rule);
    if (parsed.ok) requirements.push(parsed.requirement);
    else unsupported.push({ rule: parsed.rule, reason: parsed.reason });
  }
  requirements.sort((a, b) => `${a.form}\u0000${a.scopeAttr}`.localeCompare(
    `${b.form}\u0000${b.scopeAttr}`,
  ));
  unsupported.sort((a, b) => a.rule.localeCompare(b.rule));

  const entityCache = new Map<string, OwnedEntity | null>([[worker, workerEntity]]);
  async function cachedEntity(e: string): Promise<OwnedEntity | null> {
    if (entityCache.has(e)) return entityCache.get(e) ?? null;
    const entity = await loadOwnedEntity(ctx, e);
    entityCache.set(e, entity);
    return entity;
  }

  const itemMap = new Map<string, OwnedCompliancePlan["items"][number]>();
  const placementIds = await componentPlacementIdsForWorker(ctx, worker);
  for (const placementId of placementIds) {
    const placement = await cachedEntity(placementId);
    const placementAttrs = entityMap(placement);
    if (!hasType(placementAttrs, "Placement")) continue;
    for (const req of requirements) {
      const scope = firstString(placementAttrs, req.scopeAttr);
      if (scope === undefined) continue;
      if (req.guard !== undefined) {
        const scopeEntity = await cachedEntity(scope);
        if (!hasValue(entityMap(scopeEntity), req.guard.attr, req.guard.value)) {
          continue;
        }
      }
      const decision = hasValue(workerAttrs, `submitted.${req.form}`, scope)
        ? "reuse"
        : "collect";
      const key = `${req.form}\u0000${scope}`;
      const existing = itemMap.get(key);
      const placements = [
        ...new Set([...(existing?.placements ?? []), placementId]),
      ].sort();
      itemMap.set(key, {
        form: req.form,
        scope,
        decision,
        placements,
        reason:
          decision === "reuse"
            ? `current submitted.${req.form} fact matches this scope`
            : `no current submitted.${req.form} fact matches this scope`,
      });
    }
  }

  const items = [...itemMap.values()].sort((a, b) =>
    `${a.form}\u0000${a.scope}`.localeCompare(`${b.form}\u0000${b.scope}`),
  );
  const reuse = items.filter((item) => item.decision === "reuse").length;
  const collect = items.filter((item) => item.decision === "collect").length;
  return {
    worker,
    items,
    unsupported,
    summary: {
      reuse,
      collect,
      total: items.length,
      unsupported: unsupported.length,
    },
  };
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

export const startOwnedCollect = mutation({
  args: {
    subject: v.string(),
    form: v.string(),
    scope: v.string(),
    expireSeconds: v.optional(v.number()),
  },
  returns: collectResultValidator,
  handler: async (ctx, args) => {
    const actor = await actorContext(ctx);
    const entity = await ctx.runQuery(components.metacrdt.log.getCurrentEntity, {
      e: args.subject,
    });
    if (entity === null) {
      throw new Error(`component-owned entity ${args.subject} not found`);
    }
    return await ctx.runMutation(
      components.metacrdt.log.issueCollection,
      withoutUndefined({
        ...actor,
        subject: args.subject,
        form: args.form,
        scope: args.scope,
        expireMs:
          args.expireSeconds === undefined ? undefined : args.expireSeconds * 1000,
      }),
    );
  },
});

export const listOwnedCollections = query({
  args: {
    subject: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(ownedCollectionRunValidator),
  handler: async (ctx, args) =>
    await ctx.runQuery(
      components.metacrdt.log.listCollections,
      withoutUndefined(args),
    ),
});

export const ownedCompliancePlan = query({
  args: {
    worker: v.string(),
  },
  returns: ownedCompliancePlanValidator,
  handler: async (ctx, args) => {
    return await buildOwnedCompliancePlan(ctx, args.worker);
  },
});

export const issueOwnedOpenCollections = mutation({
  args: {
    worker: v.string(),
    expireSeconds: v.optional(v.number()),
  },
  returns: ownedComplianceIssueResultValidator,
  handler: async (ctx, args) => {
    const actor = await actorContext(ctx);
    const plan = await buildOwnedCompliancePlan(ctx, args.worker);
    const items = [];
    for (const item of plan.items) {
      if (item.decision !== "collect") continue;
      const issued = await ctx.runMutation(
        components.metacrdt.log.issueCollection,
        withoutUndefined({
          ...actor,
          subject: args.worker,
          form: item.form,
          scope: item.scope,
          expireMs:
            args.expireSeconds === undefined
              ? undefined
              : args.expireSeconds * 1000,
        }),
      );
      items.push({
        form: item.form,
        scope: item.scope,
        token: issued.token,
        collectUrl: issued.collectUrl,
        reused: issued.reused,
      });
    }
    return {
      worker: args.worker,
      issued: items.filter((item) => !item.reused).length,
      reused: items.filter((item) => item.reused).length,
      items,
    };
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
