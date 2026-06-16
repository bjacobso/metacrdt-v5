import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireTenant } from "./lib/tenantAuth";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function section(config: unknown, key: string): unknown[] {
  const value = record(config)[key];
  return Array.isArray(value) ? value : [];
}

function names(entries: unknown[], key: string): string[] {
  return entries
    .map((entry) => record(entry)[key])
    .filter((value): value is string => typeof value === "string")
    .sort();
}

function accountMetadata(config: unknown) {
  const account = record(record(config).account);
  const slug = typeof account.slug === "string" && account.slug !== ""
    ? account.slug
    : "account";
  return {
    slug,
    name: typeof account.name === "string" && account.name !== ""
      ? account.name
      : slug,
    kind: typeof account.kind === "string" && account.kind !== ""
      ? account.kind
      : "custom",
  };
}

function accountConfigManifest(config: unknown) {
  return {
    attributes: names(section(config, "attributes"), "name"),
    entityTypes: names(section(config, "entityTypes"), "name"),
    forms: names(section(config, "forms"), "form"),
    flows: names(section(config, "flows"), "name"),
    requirements: names(section(config, "requirements"), "form"),
    actions: names(section(config, "actions"), "name"),
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function accountConfigDigest(value: unknown): string {
  const source = stableJson(value);
  let h1 = 0xdeadbeef ^ source.length;
  let h2 = 0x41c6ce57 ^ source.length;
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const digest = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `cyrb53:${digest.toString(16).padStart(14, "0")}`;
}

function accountResourceMap(config: unknown): Record<string, unknown> {
  return {
    attributes: Object.fromEntries(
      section(config, "attributes").map((entry) => {
        const row = record(entry);
        return [
          row.name,
          {
            value_type: row.valueType,
            cardinality: row.cardinality,
            description: row.description ?? null,
          },
        ];
      }),
    ),
    entity_types: Object.fromEntries(
      section(config, "entityTypes").map((entry) => {
        const row = record(entry);
        return [
          row.name,
          {
            attributes: [...((row.attributes as string[] | undefined) ?? [])].sort(),
            description: row.description ?? null,
          },
        ];
      }),
    ),
    forms: Object.fromEntries(
      section(config, "forms").map((entry) => {
        const row = record(entry);
        return [
          row.form,
          {
            title: row.title,
            description: row.description,
            fields: row.fields ?? [],
          },
        ];
      }),
    ),
    flows: Object.fromEntries(
      section(config, "flows").map((entry) => {
        const row = record(entry);
        return [
          row.name,
          {
            title: row.title ?? null,
            description: row.description,
            subject_type: row.subjectType ?? null,
            start_step_id: row.startStepId,
            steps: row.steps ?? [],
          },
        ];
      }),
    ),
    requirements: Object.fromEntries(
      section(config, "requirements").map((entry) => {
        const row = record(entry);
        return [
          row.form,
          {
            scope_attr: row.scopeAttr,
            description: row.description,
            guard: row.guard ?? null,
            validity_days: row.validityDays ?? null,
          },
        ];
      }),
    ),
    actions: Object.fromEntries(
      section(config, "actions").map((entry) => {
        const row = record(entry);
        return [
          row.name,
          {
            label: row.label ?? null,
            description: row.description,
            applies_to: row.appliesTo,
            fields: row.fields ?? [],
            opens_form: row.opensForm ?? null,
            asserts: row.asserts ?? {},
          },
        ];
      }),
    ),
  };
}

function accountDeployArtifact(config: unknown): Record<string, unknown> {
  return {
    kind: "metacrdt.account.deploy",
    version: 1,
    account: accountMetadata(config),
    manifest: accountConfigManifest(config),
    resources: accountResourceMap(config),
  };
}

const CONFIG_KINDS = [
  "attribute",
  "entityType",
  "form",
  "flow",
  "requirement",
  "action",
] as const;

type ConfigKind = typeof CONFIG_KINDS[number];

const RESOURCE_BUCKETS: Record<ConfigKind, string> = {
  attribute: "attributes",
  entityType: "entity_types",
  form: "forms",
  flow: "flows",
  requirement: "requirements",
  action: "actions",
};

type AccountConfigResourceGraphEdge = {
  fromKind: ConfigKind;
  fromName: string;
  toKind: ConfigKind;
  toName: string;
  relation: string;
};

type DeployPlanDiff = {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: string[];
};

function emptyPlanDiff(): DeployPlanDiff {
  return { added: [], changed: [], removed: [], unchanged: [] };
}

function emptyDiffByKind(): Record<ConfigKind, DeployPlanDiff> {
  return Object.fromEntries(
    CONFIG_KINDS.map((kind) => [kind, emptyPlanDiff()]),
  ) as Record<ConfigKind, DeployPlanDiff>;
}

function resourceBucket(
  artifact: unknown,
  kind: ConfigKind,
): Record<string, unknown> {
  const resources = record(record(artifact).resources);
  return record(resources[RESOURCE_BUCKETS[kind]]);
}

function dangerousRemoval(kind: ConfigKind, value: string): Record<string, unknown> {
  return {
    kind,
    value,
    reason: `Removing ${kind}:${value} can remove or orphan tenant runtime behavior.`,
  };
}

function artifactAccountMetadata(artifact: unknown) {
  const account = record(record(artifact).account);
  const slug = typeof account.slug === "string" && account.slug !== ""
    ? account.slug
    : "account";
  return {
    slug,
    name: typeof account.name === "string" && account.name !== ""
      ? account.name
      : slug,
    kind: typeof account.kind === "string" && account.kind !== ""
      ? account.kind
      : "custom",
  };
}

function accountMetadataChange(current: unknown, desired: unknown): Record<string, unknown> {
  const before = current === null || current === undefined
    ? null
    : artifactAccountMetadata(current);
  const after = artifactAccountMetadata(desired);
  if (before === null) {
    return {
      action: "added",
      before,
      after,
      changedFields: ["slug", "name", "kind"],
    };
  }
  const changedFields = (["slug", "name", "kind"] as const).filter(
    (field) => before[field] !== after[field],
  );
  return {
    action: changedFields.length === 0 ? "unchanged" : "changed",
    before,
    after,
    changedFields,
  };
}

function planTotals(
  byKind: Record<ConfigKind, DeployPlanDiff>,
): Record<ConfigKind, Record<string, number>> {
  const totals = {} as Record<ConfigKind, Record<string, number>>;
  for (const kind of CONFIG_KINDS) {
    totals[kind] = {
      added: byKind[kind].added.length,
      changed: byKind[kind].changed.length,
      removed: byKind[kind].removed.length,
      unchanged: byKind[kind].unchanged.length,
    };
  }
  return totals;
}

function planIsEmptyByTotals(totals: Record<ConfigKind, Record<string, number>>): boolean {
  return Object.values(totals).every(
    (entry) => entry.added === 0 && entry.changed === 0 && entry.removed === 0,
  );
}

function artifactDeployPlan(args: {
  tenantSlug: string;
  currentArtifact?: unknown;
  desiredArtifact: unknown;
  validation: { valid: boolean; errors: string[] };
}): Record<string, unknown> {
  const byKind = emptyDiffByKind();
  const changes: Record<string, unknown>[] = [];
  const dangerous: Record<string, unknown>[] = [];
  for (const kind of CONFIG_KINDS) {
    const currentBucket = resourceBucket(args.currentArtifact, kind);
    const desiredBucket = resourceBucket(args.desiredArtifact, kind);
    const names = [...new Set([...Object.keys(currentBucket), ...Object.keys(desiredBucket)])]
      .sort();
    for (const name of names) {
      const before = currentBucket[name];
      const after = desiredBucket[name];
      if (before === undefined && after !== undefined) {
        byKind[kind].added.push(name);
        changes.push({ kind, name, action: "added", after });
      } else if (before !== undefined && after === undefined) {
        byKind[kind].removed.push(name);
        changes.push({ kind, name, action: "removed", before });
        dangerous.push(dangerousRemoval(kind, name));
      } else if (stableJson(before) !== stableJson(after)) {
        byKind[kind].changed.push(name);
        changes.push({ kind, name, action: "changed", before, after });
      } else {
        byKind[kind].unchanged.push(name);
        changes.push({ kind, name, action: "unchanged", before, after });
      }
    }
  }
  const totals = planTotals(byKind);
  const accountChange = accountMetadataChange(args.currentArtifact, args.desiredArtifact);
  return {
    valid: args.validation.valid,
    errors: args.validation.errors,
    empty: planIsEmptyByTotals(totals) &&
      record(accountChange).action === "unchanged",
    destructive: dangerous.length > 0,
    tenantSlug: args.tenantSlug,
    currentArtifactDigest: args.currentArtifact === undefined
      ? null
      : accountConfigDigest(args.currentArtifact),
    desiredArtifactDigest: accountConfigDigest(args.desiredArtifact),
    account: artifactAccountMetadata(args.desiredArtifact),
    accountChange,
    manifest: record(args.desiredArtifact).manifest,
    byKind,
    totals,
    changes,
    dangerous,
  };
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function addGraphEdge(
  edges: AccountConfigResourceGraphEdge[],
  edge: AccountConfigResourceGraphEdge,
) {
  if (
    edge.fromName.trim() === "" ||
    edge.toName.trim() === "" ||
    edge.fromName === "<unnamed>" ||
    edge.toName === "<unnamed>"
  ) {
    return;
  }
  const duplicate = edges.some(
    (existing) =>
      existing.fromKind === edge.fromKind &&
      existing.fromName === edge.fromName &&
      existing.relation === edge.relation &&
      existing.toKind === edge.toKind &&
      existing.toName === edge.toName,
  );
  if (!duplicate) edges.push(edge);
}

function accountConfigResourceGraph(config: unknown): AccountConfigResourceGraphEdge[] {
  const edges: AccountConfigResourceGraphEdge[] = [];

  for (const raw of section(config, "entityTypes")) {
    const entry = record(raw);
    const entity = nonEmptyString(entry.name);
    if (entity === undefined) continue;
    for (const attr of Array.isArray(entry.attributes) ? entry.attributes : []) {
      if (typeof attr !== "string") continue;
      addGraphEdge(edges, {
        fromKind: "entityType",
        fromName: entity,
        toKind: "attribute",
        toName: attr,
        relation: "attribute",
      });
    }
  }

  for (const raw of section(config, "flows")) {
    const entry = record(raw);
    const flow = nonEmptyString(entry.name);
    if (flow === undefined) continue;
    const subjectType = nonEmptyString(entry.subjectType);
    if (subjectType !== undefined) {
      addGraphEdge(edges, {
        fromKind: "entityType",
        fromName: subjectType,
        toKind: "flow",
        toName: flow,
        relation: "flow",
      });
    }
    for (const rawStep of Array.isArray(entry.steps) ? entry.steps : []) {
      const step = record(rawStep);
      const configRecord = record(step.config);
      const form = nonEmptyString(configRecord.form);
      if (form !== undefined) {
        addGraphEdge(edges, {
          fromKind: "flow",
          fromName: flow,
          toKind: "form",
          toName: form,
          relation: nonEmptyString(step.type) ?? "uses",
        });
      }
      const resultAttr = nonEmptyString(configRecord.resultAttr);
      if (resultAttr !== undefined) {
        addGraphEdge(edges, {
          fromKind: "flow",
          fromName: flow,
          toKind: "attribute",
          toName: resultAttr,
          relation: "asserts",
        });
      }
      const assertedAttr = nonEmptyString(configRecord.a);
      if (assertedAttr !== undefined) {
        addGraphEdge(edges, {
          fromKind: "flow",
          fromName: flow,
          toKind: "attribute",
          toName: assertedAttr,
          relation: "asserts",
        });
      }
    }
  }

  for (const raw of section(config, "requirements")) {
    const entry = record(raw);
    const form = nonEmptyString(entry.form);
    if (form === undefined) continue;
    const scope = nonEmptyString(entry.scopeAttr);
    if (scope !== undefined) {
      addGraphEdge(edges, {
        fromKind: "requirement",
        fromName: form,
        toKind: "attribute",
        toName: scope,
        relation: "scope",
      });
    }
    addGraphEdge(edges, {
      fromKind: "requirement",
      fromName: form,
      toKind: "form",
      toName: form,
      relation: "requires",
    });
  }

  for (const raw of section(config, "actions")) {
    const entry = record(raw);
    const action = nonEmptyString(entry.name);
    if (action === undefined) continue;
    const appliesTo = nonEmptyString(entry.appliesTo);
    if (appliesTo !== undefined) {
      addGraphEdge(edges, {
        fromKind: "entityType",
        fromName: appliesTo,
        toKind: "action",
        toName: action,
        relation: "action",
      });
    }
    const opensForm = record(entry.opensForm);
    const form = nonEmptyString(opensForm.form);
    if (form !== undefined) {
      addGraphEdge(edges, {
        fromKind: "action",
        fromName: action,
        toKind: "form",
        toName: form,
        relation: "opens",
      });
    }
    const asserts = record(entry.asserts);
    for (const attr of Object.keys(asserts)) {
      addGraphEdge(edges, {
        fromKind: "action",
        fromName: action,
        toKind: "attribute",
        toName: attr,
        relation: "asserts",
      });
    }
  }

  return edges;
}

function validateDeploymentAccount(config: unknown, tenantSlug: string): void {
  const account = record(record(config).account);
  const slug = account.slug;
  const name = account.name;
  const kind = account.kind;
  if (typeof slug !== "string" || slug.trim() === "") {
    throw new Error("account config missing account slug");
  }
  if (slug !== tenantSlug) {
    throw new Error(`account slug ${slug} does not match tenant ${tenantSlug}`);
  }
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("account config missing account name");
  }
  if (
    kind !== undefined &&
    kind !== "staffing" &&
    kind !== "legal" &&
    kind !== "custom"
  ) {
    throw new Error("account kind must be staffing, legal, or custom");
  }
}

function validateSubmittedDeployArtifact(args: {
  config: unknown;
  artifact: unknown;
  sourceDigest: string;
  artifactDigest: string;
}) {
  const expectedArtifact = accountDeployArtifact(args.config);
  const expectedSourceDigest = accountConfigDigest(args.config);
  const expectedArtifactDigest = accountConfigDigest(expectedArtifact);
  if (args.sourceDigest !== expectedSourceDigest) {
    throw new Error(
      `source digest mismatch: expected ${expectedSourceDigest}, got ${args.sourceDigest}`,
    );
  }
  if (args.artifactDigest !== expectedArtifactDigest) {
    throw new Error(
      `artifact digest mismatch: expected ${expectedArtifactDigest}, got ${args.artifactDigest}`,
    );
  }
  if (stableJson(args.artifact) !== stableJson(expectedArtifact)) {
    throw new Error("deployment artifact does not match account config");
  }
  return expectedArtifact;
}

function planIsEmpty(plan: unknown): boolean {
  const explicitEmpty = (plan as { empty?: unknown }).empty;
  if (typeof explicitEmpty === "boolean") return explicitEmpty;

  const accountChange = (plan as { accountChange?: { action?: unknown } }).accountChange;
  const accountUnchanged =
    accountChange === undefined || accountChange.action === "unchanged";
  const totals = (plan as { totals?: Record<string, unknown> }).totals;
  if (totals === undefined) return false;
  return accountUnchanged && Object.values(totals).every((raw) => {
    const total = raw as {
      added?: unknown;
      changed?: unknown;
      removed?: unknown;
    };
    return (
      Number(total.added ?? 0) === 0 &&
      Number(total.changed ?? 0) === 0 &&
      Number(total.removed ?? 0) === 0
    );
  });
}

function planIsDestructive(plan: unknown): boolean {
  const dangerous = (plan as { dangerous?: unknown }).dangerous;
  return Array.isArray(dangerous) && dangerous.length > 0;
}

function planSummary(plan: unknown): Record<string, unknown> {
  const planned = plan as {
    tenantSlug?: unknown;
    accountChange?: unknown;
    totals?: unknown;
    byKind?: unknown;
    dangerous?: unknown;
  };
  return {
    tenantSlug: planned.tenantSlug,
    accountChange: planned.accountChange,
    totals: planned.totals,
    byKind: planned.byKind,
    dangerous: planned.dangerous,
  };
}

function artifactReview(artifact: unknown): Record<string, unknown> {
  const raw = artifact as {
    kind?: unknown;
    version?: unknown;
    account?: unknown;
    manifest?: Record<string, unknown>;
  };
  return {
    kind: raw.kind,
    version: raw.version,
    account: raw.account,
    manifest: raw.manifest,
  };
}

type ActiveDeploymentBaseline = {
  activePlanId?: Id<"accountDeploymentPlans">;
  artifactDigest?: string;
  artifact?: unknown;
  appliedAt?: number;
};

async function activeDeploymentBaseline(
  ctx: MutationCtx | QueryCtx,
  tenantId: Id<"tenants">,
): Promise<ActiveDeploymentBaseline> {
  const state = await ctx.db
    .query("accountDeploymentStates")
    .withIndex("by_tenant", (q) => q.eq("tenantId", tenantId))
    .unique();
  if (state === null) return {};
  if (state.activePlanId === undefined) {
    return {
      artifactDigest: state.artifactDigest,
      appliedAt: state.appliedAt,
    };
  }
  const activePlan = await ctx.db.get(state.activePlanId);
  return {
    activePlanId: state.activePlanId,
    artifactDigest: state.artifactDigest,
    artifact: activePlan?.artifact,
    appliedAt: state.appliedAt,
  };
}

function deploymentBaselineSummary(baseline: ActiveDeploymentBaseline): Record<string, unknown> {
  return {
    activePlanId: baseline.activePlanId,
    artifactDigest: baseline.artifactDigest,
    appliedAt: baseline.appliedAt,
  };
}

function deploymentPlanStaleness(
  planned: Doc<"accountDeploymentPlans">,
  current: ActiveDeploymentBaseline,
): Record<string, unknown> {
  const currentDigest = current.artifactDigest;
  const baselineDigest = planned.baselineArtifactDigest;
  const currentMatchesBaseline =
    baselineDigest === undefined
      ? currentDigest === undefined
      : currentDigest === baselineDigest;
  const message = currentMatchesBaseline
    ? undefined
    : baselineDigest === undefined
      ? `deployment plan is stale: tenant now has active artifact ${currentDigest}`
      : `deployment plan is stale: expected active artifact ${baselineDigest}, found ${currentDigest ?? "none"}`;
  return {
    stale: !currentMatchesBaseline,
    baseline: {
      activePlanId: planned.baselineActivePlanId,
      artifactDigest: planned.baselineArtifactDigest,
      appliedAt: planned.baselineAppliedAt,
    },
    current: deploymentBaselineSummary(current),
    ...(message === undefined ? {} : { message }),
  };
}

function previewJson(value: unknown): string {
  const text = JSON.stringify(value, null, 2);
  const limit = 4_000;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n... truncated ${text.length - limit} chars`;
}

function resourceGraphReview(config: unknown): Record<string, unknown> {
  const edges = accountConfigResourceGraph(config);
  return {
    digest: accountConfigDigest(edges),
    edgeCount: edges.length,
    edges: edges.slice(0, 100),
    truncated: edges.length > 100,
  };
}

function draftReview(draft: Doc<"accountConfigDrafts"> | null): Record<string, unknown> | undefined {
  if (draft === null) return undefined;
  return {
    id: draft._id,
    name: draft.name,
    sourceFormat: draft.sourceFormat,
    sourceDigest: draft.sourceDigest,
    checkedInPath: draft.checkedInPath,
    checkedInDigest: draft.checkedInDigest,
    reviewNote: draft.reviewNote,
    artifactDigest: draft.artifactDigest,
    updatedAt: draft.updatedAt,
    updatedBy: draft.updatedBy,
  };
}

function deploymentReview(args: {
  plan: unknown;
  config: unknown;
  artifact: unknown;
  sourceDigest: string;
  artifactDigest: string;
  sourceFormat?: string;
  draft?: Doc<"accountConfigDrafts"> | null;
  baseline: ActiveDeploymentBaseline;
  rollbackOfPlanId?: Id<"accountDeploymentPlans">;
  rollbackTarget?: {
    planId: Id<"accountDeploymentPlans">;
    sourceDigest: string;
    artifactDigest: string;
    appliedAt?: number;
  };
}): Record<string, unknown> {
  const planned = args.plan as {
    accountChange?: unknown;
    totals?: unknown;
    dangerous?: unknown;
    byKind?: unknown;
  };
  return {
    source: {
      digest: args.sourceDigest,
      format: args.sourceFormat ?? "unknown",
      preview: previewJson(args.config),
      draft: draftReview(args.draft ?? null),
    },
    artifact: {
      digest: args.artifactDigest,
      ...artifactReview(args.artifact),
      preview: previewJson(args.artifact),
    },
    resourceGraph: resourceGraphReview(args.config),
    baseline: {
      activePlanId: args.baseline.activePlanId,
      artifactDigest: args.baseline.artifactDigest,
      appliedAt: args.baseline.appliedAt,
    },
    diff: {
      accountChange: planned.accountChange,
      totals: planned.totals,
      byKind: planned.byKind,
      dangerous: planned.dangerous,
    },
    ...(args.rollbackOfPlanId === undefined
      ? {}
      : { rollbackOfPlanId: args.rollbackOfPlanId }),
    ...(args.rollbackTarget === undefined
      ? {}
      : { rollbackTarget: args.rollbackTarget }),
  };
}

async function assertPlanBaselineIsCurrent(
  ctx: MutationCtx,
  planned: Doc<"accountDeploymentPlans">,
): Promise<void> {
  const current = await activeDeploymentBaseline(ctx, planned.tenantId);
  const currentDigest = current.artifactDigest;
  const baselineDigest = planned.baselineArtifactDigest;
  const currentMatchesBaseline =
    baselineDigest === undefined
      ? currentDigest === undefined
      : currentDigest === baselineDigest;
  if (currentMatchesBaseline) return;

  throw new Error(
    baselineDigest === undefined
      ? `deployment plan is stale: tenant now has active artifact ${currentDigest}`
      : `deployment plan is stale: expected active artifact ${baselineDigest}, found ${currentDigest ?? "none"}`,
  );
}

async function upsertActiveDeployment(
  ctx: MutationCtx,
  args: {
    tenantId: Id<"tenants">;
    tenantSlug: string;
    activePlanId: Id<"accountDeploymentPlans">;
    sourceDigest: string;
    artifactDigest: string;
    appliedBy: string;
    appliedAt: number;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("accountDeploymentStates")
    .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
    .unique();
  const row = {
    tenantId: args.tenantId,
    tenantSlug: args.tenantSlug,
    activePlanId: args.activePlanId,
    sourceDigest: args.sourceDigest,
    artifactDigest: args.artifactDigest,
    appliedBy: args.appliedBy,
    appliedAt: args.appliedAt,
    updatedAt: args.appliedAt,
  };
  if (existing === null) {
    await ctx.db.insert("accountDeploymentStates", row);
  } else {
    await ctx.db.patch(existing._id, row);
  }
}

async function requireTenantDeploymentPlan(
  ctx: MutationCtx | QueryCtx,
  args: { tenantSlug: string; planId: Id<"accountDeploymentPlans"> },
  requiredRole: Parameters<typeof requireTenant>[2] = "admin",
): Promise<{
  tenant: Awaited<ReturnType<typeof requireTenant>>;
  plan: Doc<"accountDeploymentPlans">;
}> {
  const tenant = await requireTenant(ctx, args.tenantSlug, requiredRole);
  const plan = await ctx.db.get(args.planId);
  if (plan === null) throw new Error("deployment plan not found");
  if (plan.tenantId !== tenant.tenantId) {
    throw new Error("Tenant access denied");
  }
  return { tenant, plan };
}

export const planFromArtifact = mutation({
  args: {
    tenantSlug: v.string(),
    config: v.any(),
    artifact: v.any(),
    sourceDigest: v.string(),
    artifactDigest: v.string(),
    sourceFormat: v.optional(v.string()),
    draftId: v.optional(v.id("accountConfigDrafts")),
    draftSourceDigest: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "admin");
    const draft = args.draftId === undefined ? null : await ctx.db.get(args.draftId);
    if (args.draftId !== undefined && draft === null) {
      throw new Error("account config draft not found");
    }
    if (draft !== null && draft.tenantId !== tenant.tenantId) {
      throw new Error("account config draft belongs to another tenant");
    }
    if (draft !== null && args.draftSourceDigest !== draft.sourceDigest) {
      throw new Error("account config draft source digest does not match deployment source");
    }
    if (
      draft !== null &&
      args.sourceFormat !== undefined &&
      args.sourceFormat !== draft.sourceFormat
    ) {
      throw new Error("account config draft source format does not match deployment source");
    }
    if (
      draft !== null &&
      draft.artifactDigest !== undefined &&
      draft.artifactDigest !== args.artifactDigest
    ) {
      throw new Error("account config draft artifact digest does not match deployment artifact");
    }
    validateDeploymentAccount(args.config, tenant.tenantSlug);
    const artifact = validateSubmittedDeployArtifact({
      config: args.config,
      artifact: args.artifact,
      sourceDigest: args.sourceDigest,
      artifactDigest: args.artifactDigest,
    });
    const validation: {
      valid: boolean;
      errors: string[];
    } = await ctx.runQuery(api.appconfig.planConfig, {
      tenantSlug: tenant.tenantSlug,
      config: args.config,
    });
    if (!validation.valid) {
      throw new Error(`invalid account config: ${validation.errors.join("; ")}`);
    }
    const now = Date.now();
    const baseline = await activeDeploymentBaseline(ctx, tenant.tenantId);
    const plan = artifactDeployPlan({
      tenantSlug: tenant.tenantSlug,
      currentArtifact: baseline.artifact,
      desiredArtifact: artifact,
      validation,
    });
    const summary = planSummary(plan);
    const review = deploymentReview({
      plan,
      config: args.config,
      artifact,
      sourceDigest: args.sourceDigest,
      artifactDigest: args.artifactDigest,
      sourceFormat: args.sourceFormat,
      draft,
      baseline,
    });
    const planId = await ctx.db.insert("accountDeploymentPlans", {
      tenantId: tenant.tenantId,
      tenantSlug: tenant.tenantSlug,
      requestedBy: tenant.principal,
      status: "planned",
      sourceDigest: args.sourceDigest,
      artifactDigest: args.artifactDigest,
      sourceFormat: args.sourceFormat,
      config: args.config,
      artifact,
      plan,
      summary,
      review,
      empty: planIsEmpty(plan),
      destructive: planIsDestructive(plan),
      baselineActivePlanId: baseline.activePlanId,
      baselineArtifactDigest: baseline.artifactDigest,
      baselineAppliedAt: baseline.appliedAt,
      ...(draft === null ? {} : { draftId: draft._id }),
      createdAt: now,
      updatedAt: now,
    });
    return {
      planId,
      status: "planned" as const,
      sourceDigest: args.sourceDigest,
      artifactDigest: args.artifactDigest,
      ...(draft === null ? {} : { draftId: draft._id }),
      empty: planIsEmpty(plan),
      destructive: planIsDestructive(plan),
      summary,
      review,
      plan,
    };
  },
});

export const approvePlan = mutation({
  args: { tenantSlug: v.string(), planId: v.id("accountDeploymentPlans") },
  handler: async (ctx, args) => {
    const { tenant, plan: planned } = await requireTenantDeploymentPlan(ctx, args);
    if (planned.status === "approved") {
      return {
        planId: args.planId,
        status: "approved" as const,
        approvedBy: planned.approvedBy,
        approvedAt: planned.approvedAt,
      };
    }
    if (planned.status !== "planned") {
      throw new Error(`deployment plan is ${planned.status}`);
    }
    const now = Date.now();
    try {
      await assertPlanBaselineIsCurrent(ctx, planned);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.db.patch(args.planId, {
        status: "failed",
        error: message,
        updatedAt: now,
      });
      return {
        planId: args.planId,
        status: "failed" as const,
        error: message,
      };
    }
    await ctx.db.patch(args.planId, {
      status: "approved",
      approvedBy: tenant.principal,
      approvedAt: now,
      updatedAt: now,
    });
    return {
      planId: args.planId,
      status: "approved" as const,
      approvedBy: tenant.principal,
      approvedAt: now,
    };
  },
});

export const planRollback = mutation({
  args: { tenantSlug: v.string(), planId: v.id("accountDeploymentPlans") },
  handler: async (ctx, args) => {
    const { tenant, plan: target } = await requireTenantDeploymentPlan(ctx, args);
    if (target.status !== "applied") {
      throw new Error(`rollback target is ${target.status}`);
    }
    const validation: {
      valid: boolean;
      errors: string[];
    } = await ctx.runQuery(api.appconfig.planConfig, {
      tenantSlug: tenant.tenantSlug,
      config: target.config,
    });
    if (!validation.valid) {
      throw new Error(`invalid rollback config: ${validation.errors.join("; ")}`);
    }
    const now = Date.now();
    const baseline = await activeDeploymentBaseline(ctx, tenant.tenantId);
    const plan = artifactDeployPlan({
      tenantSlug: tenant.tenantSlug,
      currentArtifact: baseline.artifact,
      desiredArtifact: target.artifact,
      validation,
    });
    const summary = {
      ...planSummary(plan),
      rollbackOfPlanId: args.planId,
    };
    const review = deploymentReview({
      plan,
      config: target.config,
      artifact: target.artifact,
      sourceDigest: target.sourceDigest,
      artifactDigest: target.artifactDigest,
      sourceFormat: target.sourceFormat,
      baseline,
      draft: undefined,
      rollbackOfPlanId: args.planId,
      rollbackTarget: {
        planId: args.planId,
        sourceDigest: target.sourceDigest,
        artifactDigest: target.artifactDigest,
        appliedAt: target.appliedAt,
      },
    });
    const planId = await ctx.db.insert("accountDeploymentPlans", {
      tenantId: tenant.tenantId,
      tenantSlug: tenant.tenantSlug,
      requestedBy: tenant.principal,
      status: "planned",
      sourceDigest: target.sourceDigest,
      artifactDigest: target.artifactDigest,
      sourceFormat: target.sourceFormat,
      config: target.config,
      artifact: target.artifact,
      plan,
      summary,
      review,
      empty: planIsEmpty(plan),
      destructive: planIsDestructive(plan),
      baselineActivePlanId: baseline.activePlanId,
      baselineArtifactDigest: baseline.artifactDigest,
      baselineAppliedAt: baseline.appliedAt,
      rollbackOfPlanId: args.planId,
      createdAt: now,
      updatedAt: now,
    });
    return {
      planId,
      status: "planned" as const,
      rollbackOfPlanId: args.planId,
      sourceDigest: target.sourceDigest,
      artifactDigest: target.artifactDigest,
      empty: planIsEmpty(plan),
      destructive: planIsDestructive(plan),
      summary,
      review,
      plan,
    };
  },
});

export const applyPlan = mutation({
  args: { tenantSlug: v.string(), planId: v.id("accountDeploymentPlans") },
  handler: async (ctx, args): Promise<{
    planId: Id<"accountDeploymentPlans">;
    status: "applied" | "failed";
    empty: boolean;
    destructive: boolean;
    summary: unknown;
    result: unknown;
    error?: string;
  }> => {
    const { tenant, plan: planned } = await requireTenantDeploymentPlan(ctx, args);

    if (planned.status === "applied") {
      return {
        planId: args.planId,
        status: "applied",
        empty: planned.empty,
        destructive: planned.destructive,
        summary: planned.summary,
        result: planned.applyResult ?? { alreadyApplied: true },
      };
    }
    if (planned.status !== "approved") {
      throw new Error(`deployment plan is ${planned.status}`);
    }

    const now = Date.now();
    try {
      await assertPlanBaselineIsCurrent(ctx, planned);
      const result = planned.empty
        ? { skipped: true, reason: "deployment plan is empty" }
        : await ctx.runMutation(api.appconfig.applyConfig, {
            tenantSlug: tenant.tenantSlug,
            config: planned.config,
          });
      await ctx.db.patch(args.planId, {
        status: "applied",
        applyResult: result,
        error: undefined,
        appliedAt: now,
        updatedAt: now,
      });
      await upsertActiveDeployment(ctx, {
        tenantId: tenant.tenantId,
        tenantSlug: tenant.tenantSlug,
        activePlanId: args.planId,
        sourceDigest: planned.sourceDigest,
        artifactDigest: planned.artifactDigest,
        appliedBy: tenant.principal,
        appliedAt: now,
      });
      return {
        planId: args.planId,
        status: "applied",
        empty: planned.empty,
        destructive: planned.destructive,
        summary: planned.summary,
        result,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.db.patch(args.planId, {
        status: "failed",
        error: message,
        updatedAt: Date.now(),
      });
      return {
        planId: args.planId,
        status: "failed",
        empty: planned.empty,
        destructive: planned.destructive,
        summary: planned.summary,
        result: null,
        error: message,
      };
    }
  },
});

export const currentDeployment = query({
  args: { tenantSlug: v.string() },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug);
    const state = await ctx.db
      .query("accountDeploymentStates")
      .withIndex("by_tenant", (q) => q.eq("tenantId", tenant.tenantId))
      .unique();
    if (state === null) return null;
    const plan = state.activePlanId === undefined
      ? null
      : await ctx.db.get(state.activePlanId);
    return { ...state, plan };
  },
});

export const reviewPlan = query({
  args: { tenantSlug: v.string(), planId: v.id("accountDeploymentPlans") },
  handler: async (ctx, args): Promise<Record<string, unknown>> => {
    const { plan: planned } = await requireTenantDeploymentPlan(
      ctx,
      args,
      "viewer",
    );
    const current = await activeDeploymentBaseline(ctx, planned.tenantId);
    return {
      planId: planned._id,
      tenantSlug: planned.tenantSlug,
      status: planned.status,
      sourceDigest: planned.sourceDigest,
      artifactDigest: planned.artifactDigest,
      sourceFormat: planned.sourceFormat,
      requestedBy: planned.requestedBy,
      createdAt: planned.createdAt,
      updatedAt: planned.updatedAt,
      approvedBy: planned.approvedBy,
      approvedAt: planned.approvedAt,
      appliedAt: planned.appliedAt,
      empty: planned.empty,
      destructive: planned.destructive,
      draftId: planned.draftId,
      rollbackOfPlanId: planned.rollbackOfPlanId,
      error: planned.error,
      summary: planned.summary,
      review: planned.review ?? null,
      baseline: {
        activePlanId: planned.baselineActivePlanId,
        artifactDigest: planned.baselineArtifactDigest,
        appliedAt: planned.baselineAppliedAt,
      },
      current: deploymentBaselineSummary(current),
      staleness: deploymentPlanStaleness(planned, current),
    };
  },
});

export const listPlans = query({
  args: { tenantSlug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<Doc<"accountDeploymentPlans">[]> => {
    const tenant = await requireTenant(ctx, args.tenantSlug);
    return await ctx.db
      .query("accountDeploymentPlans")
      .withIndex("by_tenant_and_createdAt", (q) =>
        q.eq("tenantId", tenant.tenantId),
      )
      .order("desc")
      .take(Math.min(args.limit ?? 10, 50));
  },
});
