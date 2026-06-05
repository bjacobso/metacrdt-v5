import { mutation } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";

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

/** Lower a config literal into the store. Idempotent. */
export const applyConfig = mutation({
  args: { config: v.any() },
  handler: async (ctx, args) => {
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
        asserts: ac.asserts,
      });
      applied.actions++;
    }

    return applied;
  },
});

// --- the bundled staffing blueprint ----------------------------------------
// Consolidates what used to be scattered across compliance.FORMS, the I-9 field
// list in the Flows UI, and the imperative setupDemoFlow/setupComplianceRules.

const I9_FIELDS = [
  { name: "ssn", label: "SSN", type: "string", required: true },
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
    const applied = await ctx.runMutation(api.appconfig.applyConfig, {
      config: STAFFING_BLUEPRINT,
    });
    await ctx.runMutation(api.compliance.seedStaffingDemo, {});
    return { applied };
  },
});
