import { mutation, MutationCtx } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { attrId, typeId } from "./lib/meta";
import { assertInTx, createTransaction, retractInTx } from "./facts";
import { requireWritePrincipal } from "./lib/writeAuth";

// Config-as-code. A tenant declares its shape — entity types, attributes, forms,
// flows, requirements, actions — as one literal, and applyConfig *lowers* it into
// the store: schema-as-facts (types/attributes), form defs, flow defs, compliance
// rules, and action defs. Because it lowers to ordinary facts/rows, the declared
// shape inherits history (every applyConfig is a transaction) and the "configured"
// origin facet falls out — type:<Name> registry entries make those types show up
// as configured, distinct from intrinsic system types.
//
// Each lowering target is an existing upsert mutation, so applyConfig is
// idempotent: rerunning it converges rather than duplicating.

type RequirementSpec = {
  form: string;
  scopeAttr: string;
  guard?: [string, unknown];
  validityDays?: number;
};

type ConfigKind =
  | "attribute"
  | "entityType"
  | "form"
  | "flow"
  | "requirement"
  | "action";

const CONFIG_ENTITY = "config:default";

const OWN_ATTR: Record<ConfigKind, string> = {
  attribute: "owns.attribute",
  entityType: "owns.entityType",
  form: "owns.form",
  flow: "owns.flow",
  requirement: "owns.requirement",
  action: "owns.action",
};

/** Build the requirement / task Datalog clauses for one requirement spec. */
function requirementWhere(f: RequirementSpec): unknown[] {
  const where: unknown[] = [
    ["?p", "type", "Placement"],
    ["?p", "worker", "?w"],
    ["?p", f.scopeAttr, "?s"],
  ];
  if (f.guard) where.push(["?s", f.guard[0], f.guard[1]]);
  return where;
}
function requirementDeps(f: RequirementSpec): string[] {
  const deps = ["type", "worker", f.scopeAttr];
  if (f.guard) deps.push(f.guard[0]);
  return [...new Set(deps)];
}

function formEntity(form: string): string {
  return `form:${form}`;
}

function actionEntity(action: string): string {
  return `action:${action}`;
}

async function currentRows(ctx: MutationCtx, e: string) {
  return await ctx.db
    .query("currentFacts")
    .withIndex("by_e", (q) => q.eq("e", e))
    .take(1000);
}

async function retractCurrentEntity(
  ctx: MutationCtx,
  txId: Id<"transactions">,
  now: number,
  e: string,
  reason: string,
): Promise<number> {
  const rows = await currentRows(ctx, e);
  for (const row of rows) {
    await retractInTx(ctx, txId, now, row.factId, reason);
  }
  return rows.length;
}

async function previousOwned(ctx: MutationCtx): Promise<Record<ConfigKind, Set<string>>> {
  const rows = await currentRows(ctx, CONFIG_ENTITY);
  const out: Record<ConfigKind, Set<string>> = {
    attribute: new Set(),
    entityType: new Set(),
    form: new Set(),
    flow: new Set(),
    requirement: new Set(),
    action: new Set(),
  };
  const byAttr = new Map(Object.entries(OWN_ATTR).map(([k, a]) => [a, k as ConfigKind]));
  for (const row of rows) {
    const kind = byAttr.get(row.a);
    if (kind) out[kind].add(String(row.v));
  }
  return out;
}

async function disableRuleByName(
  ctx: MutationCtx,
  name: string,
  now: number,
): Promise<boolean> {
  const rule = await ctx.db
    .query("rules")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (!rule) return false;
  await ctx.db.patch("rules", rule._id, { enabled: false, updatedAt: now });
  const derived = await ctx.db
    .query("derivedFacts")
    .withIndex("by_rule", (q) => q.eq("ruleId", rule._id))
    .take(5000);
  for (const d of derived) await ctx.db.delete("derivedFacts", d._id);
  return true;
}

async function deleteFlowDefByName(
  ctx: MutationCtx,
  name: string,
): Promise<boolean> {
  const def = await ctx.db
    .query("flowDefs")
    .withIndex("by_name", (q) => q.eq("name", name))
    .unique();
  if (!def) return false;
  await ctx.db.delete(def._id);
  return true;
}

async function reconcileConfig(
  ctx: MutationCtx,
  desired: Record<ConfigKind, Set<string>>,
  kinds: Set<ConfigKind>,
): Promise<Record<ConfigKind, number>> {
  const previous = await previousOwned(ctx);
  const removed: Record<ConfigKind, number> = {
    attribute: 0,
    entityType: 0,
    form: 0,
    flow: 0,
    requirement: 0,
    action: 0,
  };
  const now = Date.now();
  const txId = await createTransaction(ctx, {
    actorId: "config",
    reason: "reconcile config",
    now,
  });

  for (const kind of kinds) {
    for (const value of previous[kind]) {
      if (desired[kind].has(value)) continue;
      if (kind === "attribute") {
        removed[kind] += await retractCurrentEntity(
          ctx,
          txId,
          now,
          attrId(value),
          "attribute removed from config",
        );
      } else if (kind === "entityType") {
        removed[kind] += await retractCurrentEntity(
          ctx,
          txId,
          now,
          typeId(value),
          "entity type removed from config",
        );
      } else if (kind === "form") {
        removed[kind] += await retractCurrentEntity(
          ctx,
          txId,
          now,
          formEntity(value),
          "form removed from config",
        );
      } else if (kind === "action") {
        removed[kind] += await retractCurrentEntity(
          ctx,
          txId,
          now,
          actionEntity(value),
          "action removed from config",
        );
      } else if (kind === "requirement") {
        if (await disableRuleByName(ctx, `require.${value}`, now)) removed[kind]++;
        if (await disableRuleByName(ctx, `task.${value}`, now)) removed[kind]++;
      } else if (kind === "flow") {
        if (await deleteFlowDefByName(ctx, value)) removed[kind]++;
      }
    }

    const manifestRows = await ctx.db
      .query("currentFacts")
      .withIndex("by_e_a", (q) => q.eq("e", CONFIG_ENTITY).eq("a", OWN_ATTR[kind]))
      .take(1000);
    for (const row of manifestRows) {
      if (!desired[kind].has(String(row.v))) {
        await retractInTx(
          ctx,
          txId,
          now,
          row.factId,
          `${kind} removed from config manifest`,
        );
      }
    }
    for (const value of desired[kind]) {
      await assertInTx(ctx, txId, now, {
        e: CONFIG_ENTITY,
        a: OWN_ATTR[kind],
        value,
      });
    }
  }

  return removed;
}

/** Lower a config literal into the store. Idempotent. */
export const applyConfig = mutation({
  args: { config: v.any() },
  handler: async (ctx, args) => {
    await requireWritePrincipal(ctx);
    const cfg = (args.config ?? {}) as {
      attributes?: Array<{
        name: string;
        valueType: "string" | "number" | "boolean" | "entityRef" | "date" | "json";
        cardinality: "one" | "many";
        description?: string;
      }>;
      entityTypes?: Array<{
        name: string;
        attributes?: string[];
        description?: string;
      }>;
      forms?: Array<{ form: string; title: string; fields: unknown[] }>;
      flows?: Array<{
        name: string;
        title?: string;
        subjectType?: string;
        startStepId: string;
        steps: unknown[];
      }>;
      requirements?: RequirementSpec[];
      actions?: Array<{
        name: string;
        label?: string;
        appliesTo: string;
        fields?: Array<{
          name: string;
          label?: string;
          type: "string" | "number" | "boolean" | "select";
          required?: boolean;
          options?: string[];
          defaultValue?: unknown;
        }>;
        opensForm?: { form: unknown; scope: unknown };
        asserts: Record<string, unknown>;
      }>;
    };

    const applied = {
      attributes: 0,
      entityTypes: 0,
      forms: 0,
      flows: 0,
      rules: 0,
      actions: 0,
    };
    const desired: Record<ConfigKind, Set<string>> = {
      attribute: new Set((cfg.attributes ?? []).map((a) => a.name)),
      entityType: new Set((cfg.entityTypes ?? []).map((t) => t.name)),
      form: new Set((cfg.forms ?? []).map((f) => f.form)),
      flow: new Set((cfg.flows ?? []).map((f) => f.name)),
      requirement: new Set((cfg.requirements ?? []).map((r) => r.form)),
      action: new Set((cfg.actions ?? []).map((a) => a.name)),
    };
    const reconcileKinds = new Set<ConfigKind>();
    if ("attributes" in cfg) reconcileKinds.add("attribute");
    if ("entityTypes" in cfg) reconcileKinds.add("entityType");
    if ("forms" in cfg) reconcileKinds.add("form");
    if ("flows" in cfg) reconcileKinds.add("flow");
    if ("requirements" in cfg) reconcileKinds.add("requirement");
    if ("actions" in cfg) reconcileKinds.add("action");

    for (const a of cfg.attributes ?? []) {
      await ctx.runMutation(api.attributes.defineAttribute, {
        name: a.name,
        valueType: a.valueType,
        cardinality: a.cardinality,
        description: a.description,
      });
      applied.attributes++;
    }

    for (const t of cfg.entityTypes ?? []) {
      await ctx.runMutation(api.attributes.defineType, {
        name: t.name,
        attributes: t.attributes,
        description: t.description,
      });
      applied.entityTypes++;
    }

    for (const f of cfg.forms ?? []) {
      await ctx.runMutation(api.forms.defineForm, {
        form: f.form,
        title: f.title,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fields: f.fields as any,
      });
      applied.forms++;
    }

    for (const fl of cfg.flows ?? []) {
      await ctx.runMutation(api.flows.defineFlow, {
        name: fl.name,
        title: fl.title,
        subjectType: fl.subjectType,
        startStepId: fl.startStepId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        steps: fl.steps as any,
      });
      applied.flows++;
    }

    for (const r of cfg.requirements ?? []) {
      const where = requirementWhere(r);
      const deps = requirementDeps(r);
      await ctx.runMutation(api.rules.defineRule, {
        name: `require.${r.form}`,
        where,
        emit: { e: "?w", a: `requires.${r.form}`, v: "?s" },
        dependsOnAttributes: deps,
      });
      await ctx.runMutation(api.rules.defineRule, {
        name: `task.${r.form}`,
        where: [...where, { not: ["?w", `submitted.${r.form}`, "?s"] }],
        emit: { e: "?w", a: `task.${r.form}`, v: "?s" },
        dependsOnAttributes: [...deps, `submitted.${r.form}`],
      });
      applied.rules += 2;
    }

    for (const ac of cfg.actions ?? []) {
      await ctx.runMutation(api.actions.defineAction, {
        name: ac.name,
        label: ac.label,
        appliesTo: ac.appliesTo,
        fields: ac.fields,
        opensForm: ac.opensForm,
        asserts: ac.asserts,
      });
      applied.actions++;
    }

    const removed = await reconcileConfig(ctx, desired, reconcileKinds);
    if (removed.requirement > 0) {
      await ctx.scheduler.runAfter(0, internal.rebuild.rebuildProjections, {});
    }

    return { ...applied, removed };
  },
});

// --- the bundled staffing blueprint ----------------------------------------
// Consolidates what used to be scattered across compliance.FORMS, the I-9 field
// list in the Flows UI, and the imperative setupDemoFlow/setupComplianceRules.

const I9_FIELDS = [
  { name: "ssn", label: "SSN", type: "string", required: true, pii: true },
  {
    name: "citizenship",
    label: "Citizenship",
    type: "select",
    options: ["citizen", "permanent_resident", "authorized_alien"],
    required: true,
  },
];

const ACK_FIELD = [
  { name: "acknowledged", label: "I acknowledge", type: "boolean", required: true },
];

const ONBOARDING_STEPS = [
  { id: "i9", type: "collect", config: { form: "i9", scopeFrom: "employer" }, next: "branch" },
  {
    id: "branch",
    type: "branch",
    config: {
      where: [["?s", "i9/citizenship", "authorized_alien"]],
      ifTrue: "everify",
      ifFalse: "welcome",
    },
  },
  {
    id: "everify",
    type: "action",
    config: { label: "E-Verify check", resultAttr: "everify.status", resultValue: "verified" },
    next: "welcome",
  },
  { id: "welcome", type: "notify", config: { message: "Welcome aboard!" }, next: "done" },
  { id: "done", type: "done" },
];

export const STAFFING_BLUEPRINT = {
  attributes: [
    { name: "worker.status", valueType: "string", cardinality: "one", description: "Worker employment status." },
    { name: "role", valueType: "string", cardinality: "one", description: "Job role." },
    { name: "worker", valueType: "entityRef", cardinality: "one", description: "The worker on a placement." },
    { name: "employer", valueType: "entityRef", cardinality: "one", description: "The employer on a placement." },
    { name: "client", valueType: "entityRef", cardinality: "one", description: "The client on a placement." },
    { name: "job", valueType: "entityRef", cardinality: "one", description: "The job on a placement." },
    { name: "venue", valueType: "entityRef", cardinality: "one", description: "The venue on a placement." },
  ],
  entityTypes: [
    { name: "Worker", attributes: ["name", "worker.status"], description: "A staffed worker." },
    { name: "Employer", attributes: ["name"], description: "A staffing agency / employer of record." },
    { name: "Client", attributes: ["name"], description: "A client site a worker is placed at." },
    { name: "Job", attributes: ["name", "role"], description: "A job role." },
    { name: "Venue", attributes: ["name"], description: "A physical venue." },
    { name: "Placement", attributes: ["worker", "employer", "client", "job", "venue"], description: "A worker placed by an employer at a client/job/venue." },
  ],
  forms: [
    { form: "i9", title: "Form I-9", fields: I9_FIELDS },
    { form: "handbook", title: "Employee Handbook Acknowledgement", fields: ACK_FIELD },
    { form: "forklift", title: "Forklift Certification", fields: ACK_FIELD },
    { form: "venue_disclosure", title: "Venue Disclosure", fields: ACK_FIELD },
  ],
  flows: [
    { name: "onboarding", title: "Worker onboarding", subjectType: "Worker", startStepId: "i9", steps: ONBOARDING_STEPS },
  ],
  requirements: [
    { form: "i9", scopeAttr: "employer", validityDays: 365 * 3 },
    { form: "handbook", scopeAttr: "client" },
    { form: "forklift", scopeAttr: "job", guard: ["role", "forklift"] },
    { form: "venue_disclosure", scopeAttr: "venue" },
  ],
  actions: [
    { name: "terminate", label: "Terminate worker", appliesTo: "Worker", asserts: { "worker.status": "terminated" } },
    { name: "reactivate", label: "Reactivate worker", appliesTo: "Worker", asserts: { "worker.status": "active" } },
  ],
};

/**
 * Install the staffing blueprint (schema + flows + rules + actions) and seed the
 * demo data. Replaces the old imperative setupComplianceRules + setupDemoFlow +
 * inline defineForm bootstrap with one config-as-code entry point.
 */
export const setupStaffing = mutation({
  args: {},
  handler: async (ctx): Promise<{ applied: unknown }> => {
    await requireWritePrincipal(ctx);
    const applied = await ctx.runMutation(api.appconfig.applyConfig, {
      config: STAFFING_BLUEPRINT,
    });
    await ctx.runMutation(api.compliance.seedStaffingDemo, {});
    return { applied };
  },
});
