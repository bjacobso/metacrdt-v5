import {
  action,
  internalQuery,
  internalMutation,
  mutation,
  query,
  ActionCtx,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import {
  attrId,
  attrNameOf,
  shapeAttributeDefinition,
  typeId,
} from "./lib/meta";
import { assertInTx, createTransaction, retractInTx } from "./facts";
import {
  formEntity,
  requirementClauses,
  type RequirementSpec,
} from "./lib/collect";
import {
  requireLegacyGlobalWrite,
  requireTenant,
  tenantOrLegacyRead,
} from "./lib/tenantAuth";
import { loadActionDef } from "./lib/actionDefs";

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

type ConfigKind =
  | "attribute"
  | "entityType"
  | "form"
  | "flow"
  | "requirement"
  | "action";

const FORM_FIELD_TYPES = new Set(["string", "number", "boolean", "date", "select"]);
const ACTION_FIELD_TYPES = new Set(["string", "number", "boolean", "select"]);
const FLOW_STEP_TYPES = new Set([
  "assert",
  "collect",
  "notify",
  "branch",
  "action",
  "wait",
  "done",
]);

function validateFieldFlags(
  field: Record<string, unknown>,
  label: string,
  errors: string[],
) {
  if (field.required !== undefined && typeof field.required !== "boolean") {
    errors.push(`${label} required must be a boolean`);
  }
  if (field.pii !== undefined && typeof field.pii !== "boolean") {
    errors.push(`${label} pii must be a boolean`);
  }
  if (field.description !== undefined && typeof field.description !== "string") {
    errors.push(`${label} description must be a string`);
  }
}

function validateDescription(
  value: unknown,
  label: string,
  errors: string[],
) {
  if (value !== undefined && typeof value !== "string") {
    errors.push(`${label} description must be a string`);
  }
}

function validateFieldOptions(
  field: Record<string, unknown>,
  label: string,
  errors: string[],
) {
  if (field.type === "select") {
    if (!Array.isArray(field.options) || field.options.length === 0) {
      errors.push(`${label} select field must define non-empty options`);
      return;
    }
    for (const option of field.options) {
      if (typeof option !== "string" || option.trim() === "") {
        errors.push(`${label} select field has non-string option`);
        return;
      }
    }
    return;
  }
  if (field.options !== undefined) {
    errors.push(`${label} options are only valid for select fields`);
  }
}

function validateActionFieldDefault(
  field: Record<string, unknown>,
  label: string,
  errors: string[],
) {
  if (field.defaultValue === undefined) return;
  if (
    field.type === "select" &&
    Array.isArray(field.options) &&
    !field.options.includes(String(field.defaultValue))
  ) {
    errors.push(`${label} defaultValue must be one of its options`);
  }
}

function validateOpensFormScope(
  scope: unknown,
  knownAttributes: Set<string>,
  actionFieldNames: Set<string>,
  label: string,
  errors: string[],
) {
  if (scope === undefined || typeof scope !== "string") return;
  if (scope.startsWith("$arg.")) {
    const fieldName = scope.slice("$arg.".length);
    if (fieldName.length === 0 || !actionFieldNames.has(fieldName)) {
      errors.push(`${label} opensForm scope references unknown action field ${fieldName || "<missing>"}`);
    }
    return;
  }
  if (!knownAttributes.has(scope)) {
    errors.push(`${label} opensForm scope references unknown attribute ${scope}`);
  }
}

function validateFlowStepConfig(
  flowName: string,
  step: Record<string, unknown>,
  stepIds: Set<string>,
  knownForms: Set<string>,
  knownAttributes: Set<string>,
  errors: string[],
) {
  const stepId = String(step.id ?? "<unknown>");
  const stepType = String(step.type ?? "<missing>");
  const config =
    step.config !== null && typeof step.config === "object" && !Array.isArray(step.config)
      ? (step.config as Record<string, unknown>)
      : {};

  if (!FLOW_STEP_TYPES.has(stepType)) {
    errors.push(`flow ${flowName} step ${stepId} has invalid type`);
  }
  if (step.next !== undefined && !stepIds.has(String(step.next))) {
    errors.push(
      `flow ${flowName} step ${stepId} next references unknown step ${String(step.next)}`,
    );
  }
  if (step.type === "collect") {
    if (!knownForms.has(String(config.form))) {
      errors.push(
        `flow ${flowName} step ${stepId} collects unknown form ${String(config.form ?? "<missing>")}`,
      );
    }
    if (
      config.scopeFrom !== undefined &&
      typeof config.scopeFrom === "string" &&
      !knownAttributes.has(config.scopeFrom)
    ) {
      errors.push(
        `flow ${flowName} step ${stepId} scopeFrom references unknown attribute ${config.scopeFrom}`,
      );
    }
    for (const key of ["reminderSeconds", "escalateSeconds", "expireSeconds"]) {
      if (config[key] !== undefined && typeof config[key] !== "number") {
        errors.push(`flow ${flowName} step ${stepId} ${key} must be a number`);
      }
    }
  }
  if (step.type === "branch") {
    if (
      config.subjectVar !== undefined &&
      (typeof config.subjectVar !== "string" || config.subjectVar.length === 0)
    ) {
      errors.push(`flow ${flowName} step ${stepId} subjectVar must be a string`);
    }
    for (const [key, value] of [
      ["ifTrue", config.ifTrue],
      ["ifFalse", config.ifFalse],
    ] as const) {
      if (value !== undefined && !stepIds.has(String(value))) {
        errors.push(
          `flow ${flowName} step ${stepId} ${key} references unknown step ${String(value)}`,
        );
      }
    }
  }
  if (step.type === "assert") {
    if (typeof config.a !== "string" || !knownAttributes.has(config.a)) {
      errors.push(
        `flow ${flowName} step ${stepId} asserts unknown attribute ${String(config.a ?? "<missing>")}`,
      );
    }
  }
  if (step.type === "action") {
    if (
      config.resultAttr !== undefined &&
      (typeof config.resultAttr !== "string" || !knownAttributes.has(config.resultAttr))
    ) {
      errors.push(
        `flow ${flowName} step ${stepId} resultAttr references unknown attribute ${String(config.resultAttr)}`,
      );
    }
    if (config.delaySeconds !== undefined && typeof config.delaySeconds !== "number") {
      errors.push(`flow ${flowName} step ${stepId} delaySeconds must be a number`);
    }
  }
  if (step.type === "notify") {
    if (typeof config.message !== "string" || config.message.length === 0) {
      errors.push(`flow ${flowName} step ${stepId} notify message must be a string`);
    }
    for (const key of ["channel", "to", "template"]) {
      if (config[key] !== undefined && typeof config[key] !== "string") {
        errors.push(`flow ${flowName} step ${stepId} ${key} must be a string`);
      }
    }
    if (config.delaySeconds !== undefined && typeof config.delaySeconds !== "number") {
      errors.push(`flow ${flowName} step ${stepId} delaySeconds must be a number`);
    }
  }
  if (step.type === "wait" && config.seconds !== undefined && typeof config.seconds !== "number") {
    errors.push(`flow ${flowName} step ${stepId} seconds must be a number`);
  }
}

const DEFAULT_CONFIG_ENTITY = "config:default";

const OWN_ATTR: Record<ConfigKind, string> = {
  attribute: "owns.attribute",
  entityType: "owns.entityType",
  form: "owns.form",
  flow: "owns.flow",
  requirement: "owns.requirement",
  action: "owns.action",
};

function actionEntity(action: string): string {
  return `action:${action}`;
}

export function configEntity(tenantId?: Id<"tenants">): string {
  return tenantId === undefined
    ? DEFAULT_CONFIG_ENTITY
    : `config:tenant:${tenantId}`;
}

async function currentRows(
  ctx: MutationCtx | QueryCtx,
  e: string,
  tenantId?: Id<"tenants">,
) {
  if (tenantId !== undefined) {
    return await ctx.db
      .query("currentFacts")
      .withIndex("by_tenant_and_e", (q) => q.eq("tenantId", tenantId).eq("e", e))
      .take(1000);
  }
  return await ctx.db.query("currentFacts").withIndex("by_e", (q) => q.eq("e", e)).take(1000);
}

async function retractCurrentEntity(
  ctx: MutationCtx,
  txId: Id<"transactions">,
  now: number,
  e: string,
  reason: string,
  tenantId?: Id<"tenants">,
): Promise<number> {
  const rows = await currentRows(ctx, e, tenantId);
  for (const row of rows) {
    await retractInTx(ctx, txId, now, row.factId, reason);
  }
  return rows.length;
}

async function previousOwned(
  ctx: MutationCtx | QueryCtx,
  tenantId?: Id<"tenants">,
): Promise<Record<ConfigKind, Set<string>>> {
  const rows = await currentRows(ctx, configEntity(tenantId), tenantId);
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

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

async function exportAttribute(
  ctx: QueryCtx,
  name: string,
  tenantId: Id<"tenants">,
) {
  const rows = await currentRows(ctx, attrId(name), tenantId);
  const shaped = shapeAttributeDefinition(name, rows);
  return stripUndefined({
    name,
    valueType: shaped.valueType,
    cardinality: shaped.cardinality,
    unique: shaped.unique,
    indexed: shaped.indexed,
    materialized: shaped.materialized,
    inverseAttribute: shaped.inverseAttribute,
    description: shaped.description,
  });
}

async function exportEntityType(
  ctx: QueryCtx,
  name: string,
  tenantId: Id<"tenants">,
  ownedAttributes?: Set<string>,
) {
  const rows = await currentRows(ctx, typeId(name), tenantId);
  const attributes = rows
    .filter((row) => row.a === "hasAttribute")
    .map((row) => attrNameOf(String(row.v)))
    .filter(
      (attribute) =>
        ownedAttributes === undefined ||
        attribute === "name" ||
        attribute === "type" ||
        ownedAttributes.has(attribute),
    )
    .sort();
  const description = rows.find((row) => row.a === "description")?.v;
  return stripUndefined({
    name,
    attributes,
    description: typeof description === "string" ? description : undefined,
  });
}

async function exportForm(ctx: QueryCtx, form: string, tenantId: Id<"tenants">) {
  const rows = await currentRows(ctx, formEntity(form), tenantId);
  const def = rows.find((row) => row.a === "formDef")?.v as
    | { title?: unknown; fields?: unknown }
    | undefined;
  return {
    form,
    title: typeof def?.title === "string" ? def.title : form,
    fields: Array.isArray(def?.fields) ? def.fields : [],
  };
}

async function exportFlow(ctx: QueryCtx, name: string, tenantId: Id<"tenants">) {
  const def = await ctx.db
    .query("flowDefs")
    .withIndex("by_tenant_and_name", (q) =>
      q.eq("tenantId", tenantId).eq("name", name),
    )
    .first();
  return stripUndefined({
    name,
    title: def?.title,
    subjectType: def?.subjectType,
    startStepId: def?.startStepId ?? "",
    steps: def?.steps ?? [],
  });
}

async function exportAction(
  ctx: QueryCtx,
  name: string,
  tenantId: Id<"tenants">,
) {
  const def = await loadActionDef(ctx, name, tenantId);
  return stripUndefined({
    name,
    label: def?.label,
    appliesTo: def?.appliesTo ?? "",
    fields: def?.fields && def.fields.length > 0 ? def.fields : undefined,
    opensForm: def?.opensForm,
    asserts: def?.asserts ?? {},
  });
}

function requirementFromWhere(
  form: string,
  where: unknown[] | undefined,
): RequirementSpec | null {
  if (!Array.isArray(where)) return null;
  const scopeClause = where.find(
    (clause): clause is [unknown, unknown, unknown] =>
      Array.isArray(clause) &&
      clause.length === 3 &&
      clause[0] === "?p" &&
      clause[2] === "?s" &&
      clause[1] !== "type" &&
      clause[1] !== "worker",
  );
  if (scopeClause === undefined || typeof scopeClause[1] !== "string") {
    return null;
  }
  const guardClause = where.find(
    (clause): clause is [unknown, unknown, unknown] =>
      Array.isArray(clause) &&
      clause.length === 3 &&
      clause[0] === "?s" &&
      typeof clause[1] === "string",
  );
  return stripUndefined({
    form,
    scopeAttr: scopeClause[1],
    guard:
      guardClause === undefined
        ? undefined
        : ([guardClause[1], guardClause[2]] as [string, unknown]),
  }) as RequirementSpec;
}

async function exportRequirement(
  ctx: QueryCtx,
  form: string,
  tenantId: Id<"tenants">,
): Promise<{ requirement: RequirementSpec; warning?: string }> {
  const rule = await ctx.db
    .query("rules")
    .withIndex("by_tenant_and_name", (q) =>
      q.eq("tenantId", tenantId).eq("name", `require.${form}`),
    )
    .first();
  const reconstructed = requirementFromWhere(form, rule?.where);
  if (reconstructed !== null) {
    return {
      requirement: reconstructed,
      warning:
        "Requirement validityDays is not stored in lowered rule state and cannot be recovered by export.",
    };
  }
  return {
    requirement: { form, scopeAttr: "" },
    warning: `Requirement ${form} could not be fully reconstructed from rule state.`,
  };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function configSections(config: unknown) {
  const cfg = (config ?? {}) as {
    attributes?: Array<Record<string, unknown>>;
    entityTypes?: Array<Record<string, unknown>>;
    forms?: Array<Record<string, unknown>>;
    flows?: Array<Record<string, unknown>>;
    requirements?: Array<Record<string, unknown>>;
    actions?: Array<Record<string, unknown>>;
  };
  return {
    attribute: Array.isArray(cfg.attributes) ? cfg.attributes : [],
    entityType: Array.isArray(cfg.entityTypes) ? cfg.entityTypes : [],
    form: Array.isArray(cfg.forms) ? cfg.forms : [],
    flow: Array.isArray(cfg.flows) ? cfg.flows : [],
    requirement: Array.isArray(cfg.requirements) ? cfg.requirements : [],
    action: Array.isArray(cfg.actions) ? cfg.actions : [],
  };
}

function configItemName(kind: ConfigKind, item: Record<string, unknown>): string | null {
  const value =
    kind === "form" || kind === "requirement" ? item.form : item.name;
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

async function exportOwnedItem(
  ctx: QueryCtx,
  kind: ConfigKind,
  name: string,
  tenantId: Id<"tenants">,
): Promise<Record<string, unknown>> {
  if (kind === "attribute") return await exportAttribute(ctx, name, tenantId);
  if (kind === "entityType") return await exportEntityType(ctx, name, tenantId);
  if (kind === "form") return await exportForm(ctx, name, tenantId);
  if (kind === "flow") return await exportFlow(ctx, name, tenantId);
  if (kind === "action") return await exportAction(ctx, name, tenantId);
  return (await exportRequirement(ctx, name, tenantId)).requirement as Record<string, unknown>;
}

function dangerousRemovals(
  byKind: Record<ConfigKind, { removed: string[] }>,
): Array<{ kind: ConfigKind; value: string; reason: string }> {
  const reasons: Record<ConfigKind, string> = {
    attribute: "Removing an attribute retracts configured schema and can hide data from generated account surfaces.",
    entityType: "Removing an entity type changes navigation, queries, and generated account surfaces.",
    form: "Removing a form can break collection links, flow steps, and requirement tasks.",
    flow: "Removing a flow can strand expected account workflows.",
    requirement: "Removing a requirement can close derived obligations for the tenant.",
    action: "Removing an action changes available user operations.",
  };
  return Object.entries(byKind).flatMap(([kind, diff]) =>
    diff.removed.map((value) => ({
      kind: kind as ConfigKind,
      value,
      reason: reasons[kind as ConfigKind],
    })),
  );
}

function emptyOwned(): Record<ConfigKind, Set<string>> {
  return {
    attribute: new Set(),
    entityType: new Set(),
    form: new Set(),
    flow: new Set(),
    requirement: new Set(),
    action: new Set(),
  };
}

function configDesired(
  config: unknown,
  current: Record<ConfigKind, Set<string>> = emptyOwned(),
): {
  desired: Record<ConfigKind, Set<string>>;
  errors: string[];
} {
  const cfg = (config ?? {}) as {
    attributes?: Array<{ name?: unknown }>;
    entityTypes?: Array<{ name?: unknown }>;
    forms?: Array<{ form?: unknown }>;
    flows?: Array<{ name?: unknown }>;
    requirements?: Array<{ form?: unknown }>;
    actions?: Array<{ name?: unknown }>;
  };
  const desired = emptyOwned();
  const errors: string[] = [];

  const add = (
    kind: ConfigKind,
    section: unknown[] | undefined,
    key: "name" | "form",
  ) => {
    if (section === undefined) return;
    if (!Array.isArray(section)) {
      errors.push(`${kind} section must be an array`);
      return;
    }
    for (const item of section) {
      if (item === null || typeof item !== "object") {
        errors.push(`${kind} entry must be an object`);
        continue;
      }
      const value = (item as Record<string, unknown>)[key];
      if (typeof value !== "string" || value.trim() === "") {
        errors.push(`${kind} entry missing ${key}`);
        continue;
      }
      if (desired[kind].has(value)) errors.push(`duplicate ${kind}: ${value}`);
      desired[kind].add(value);
    }
  };

  add("attribute", cfg.attributes, "name");
  add("entityType", cfg.entityTypes, "name");
  add("form", cfg.forms, "form");
  add("flow", cfg.flows, "name");
  add("requirement", cfg.requirements, "form");
  add("action", cfg.actions, "name");

  const knownAttributes = new Set([
    ...current.attribute,
    ...desired.attribute,
    "name",
    "type",
  ]);
  const knownTypes = new Set([...current.entityType, ...desired.entityType]);
  const knownForms = new Set([...current.form, ...desired.form]);

  if (Array.isArray(cfg.attributes)) {
    for (const attr of cfg.attributes) {
      if (attr === null || typeof attr !== "object") continue;
      const name = String((attr as { name?: unknown }).name ?? "<unknown>");
      const valueType = (attr as { valueType?: unknown }).valueType;
      const cardinality = (attr as { cardinality?: unknown }).cardinality;
      validateDescription(
        (attr as { description?: unknown }).description,
        `attribute ${name}`,
        errors,
      );
      if (
        !["string", "number", "boolean", "entityRef", "date", "json"].includes(
          String(valueType),
        )
      ) {
        errors.push(`attribute ${name} has invalid valueType`);
      }
      if (cardinality !== "one" && cardinality !== "many") {
        errors.push(`attribute ${name} has invalid cardinality`);
      }
    }
  }

  if (Array.isArray(cfg.entityTypes)) {
    for (const type of cfg.entityTypes) {
      if (type === null || typeof type !== "object") continue;
      const row = type as { name?: unknown; attributes?: unknown };
      const name = String(row.name ?? "<unknown>");
      validateDescription(
        (row as { description?: unknown }).description,
        `entityType ${name}`,
        errors,
      );
      if (row.attributes !== undefined && !Array.isArray(row.attributes)) {
        errors.push(`entityType ${name} attributes must be an array`);
        continue;
      }
      for (const attr of row.attributes ?? []) {
        if (typeof attr !== "string") {
          errors.push(`entityType ${name} has non-string attribute`);
        } else if (!knownAttributes.has(attr)) {
          errors.push(`entityType ${name} references unknown attribute ${attr}`);
        }
      }
    }
  }

  if (Array.isArray(cfg.forms)) {
    for (const form of cfg.forms) {
      if (form === null || typeof form !== "object") continue;
      const row = form as { form?: unknown; title?: unknown; fields?: unknown };
      const name = String(row.form ?? "<unknown>");
      validateDescription(
        (row as { description?: unknown }).description,
        `form ${name}`,
        errors,
      );
      if (typeof row.title !== "string" || row.title.trim() === "") {
        errors.push(`form ${name} missing title`);
      }
      if (!Array.isArray(row.fields)) {
        errors.push(`form ${name} fields must be an array`);
        continue;
      }
      const fieldNames = new Set<string>();
      for (const field of row.fields) {
        if (field === null || typeof field !== "object") {
          errors.push(`form ${name} field must be an object`);
          continue;
        }
        const f = field as Record<string, unknown> & {
          name?: unknown;
          label?: unknown;
          type?: unknown;
        };
        if (typeof f.name !== "string" || f.name.trim() === "") {
          errors.push(`form ${name} field missing name`);
        } else if (fieldNames.has(f.name)) {
          errors.push(`duplicate form ${name} field: ${f.name}`);
        } else {
          fieldNames.add(f.name);
        }
        if (typeof f.label !== "string" || f.label.trim() === "") {
          errors.push(`form ${name} field ${String(f.name ?? "<unknown>")} missing label`);
        }
        if (!FORM_FIELD_TYPES.has(String(f.type))) {
          errors.push(`form ${name} field ${String(f.name ?? "<unknown>")} has invalid type`);
        }
        validateFieldFlags(f, `form ${name} field ${String(f.name ?? "<unknown>")}`, errors);
        validateFieldOptions(f, `form ${name} field ${String(f.name ?? "<unknown>")}`, errors);
      }
    }
  }

  if (Array.isArray(cfg.flows)) {
    for (const flow of cfg.flows) {
      if (flow === null || typeof flow !== "object") continue;
      const row = flow as {
        name?: unknown;
        subjectType?: unknown;
        startStepId?: unknown;
        steps?: unknown;
      };
      const name = String(row.name ?? "<unknown>");
      validateDescription(
        (row as { description?: unknown }).description,
        `flow ${name}`,
        errors,
      );
      if (typeof row.subjectType !== "string" || !knownTypes.has(row.subjectType)) {
        errors.push(
          `flow ${name} references unknown subjectType ${String(row.subjectType ?? "<missing>")}`,
        );
      }
      if (typeof row.startStepId !== "string" || row.startStepId.trim() === "") {
        errors.push(`flow ${name} missing startStepId`);
      }
      if (!Array.isArray(row.steps)) {
        errors.push(`flow ${name} steps must be an array`);
        continue;
      }
      const stepIds = new Set<string>();
      for (const step of row.steps) {
        if (step === null || typeof step !== "object") continue;
        const id = (step as { id?: unknown }).id;
        if (typeof id !== "string" || id.trim() === "") {
          errors.push(`flow ${name} step missing id`);
        } else if (stepIds.has(id)) {
          errors.push(`duplicate flow ${name} step: ${id}`);
        } else {
          stepIds.add(id);
        }
      }
      if (typeof row.startStepId === "string" && !stepIds.has(row.startStepId)) {
        errors.push(`flow ${name} startStepId is not a step`);
      }
      for (const step of row.steps) {
        if (step === null || typeof step !== "object") continue;
        validateFlowStepConfig(
          name,
          step as Record<string, unknown>,
          stepIds,
          knownForms,
          knownAttributes,
          errors,
        );
      }
    }
  }

  if (Array.isArray(cfg.requirements)) {
    for (const requirement of cfg.requirements) {
      if (requirement === null || typeof requirement !== "object") continue;
      const row = requirement as {
        form?: unknown;
        scopeAttr?: unknown;
        validityDays?: unknown;
        guard?: unknown;
      };
      const form = String(row.form ?? "<unknown>");
      validateDescription(
        (row as { description?: unknown }).description,
        `requirement ${form}`,
        errors,
      );
      if (typeof row.form === "string" && !knownForms.has(row.form)) {
        errors.push(`requirement references unknown form ${row.form}`);
      }
      if (typeof row.scopeAttr !== "string" || !knownAttributes.has(row.scopeAttr)) {
        errors.push(`requirement ${form} references unknown scopeAttr ${String(row.scopeAttr ?? "<missing>")}`);
      }
      if (row.validityDays !== undefined && typeof row.validityDays !== "number") {
        errors.push(`requirement ${form} validityDays must be a number`);
      }
      if (row.guard !== undefined) {
        if (
          !Array.isArray(row.guard) ||
          row.guard.length !== 2 ||
          typeof row.guard[0] !== "string"
        ) {
          errors.push(`requirement ${form} guard must be [attribute, value]`);
        } else if (!knownAttributes.has(row.guard[0])) {
          errors.push(`requirement ${form} guard references unknown attribute ${row.guard[0]}`);
        }
      }
    }
  }

  if (Array.isArray(cfg.actions)) {
    for (const action of cfg.actions) {
      if (action === null || typeof action !== "object") continue;
      const row = action as {
        name?: unknown;
        appliesTo?: unknown;
        asserts?: unknown;
        fields?: unknown;
        opensForm?: { form?: unknown; scope?: unknown };
      };
      const name = String(row.name ?? "<unknown>");
      validateDescription(
        (row as { description?: unknown }).description,
        `action ${name}`,
        errors,
      );
      if (typeof row.appliesTo !== "string" || !knownTypes.has(row.appliesTo)) {
        errors.push(`action ${name} references unknown appliesTo ${String(row.appliesTo ?? "<missing>")}`);
      }
      if (
        row.asserts !== undefined &&
        (row.asserts === null || typeof row.asserts !== "object" || Array.isArray(row.asserts))
      ) {
        errors.push(`action ${name} asserts must be an object`);
      } else {
        for (const attr of Object.keys((row.asserts ?? {}) as Record<string, unknown>)) {
          if (!knownAttributes.has(attr)) {
            errors.push(`action ${name} asserts unknown attribute ${attr}`);
          }
        }
      }
      const actionFieldNames = new Set<string>();
      if (row.fields !== undefined && !Array.isArray(row.fields)) {
        errors.push(`action ${name} fields must be an array`);
      } else if (Array.isArray(row.fields)) {
        for (const field of row.fields) {
          if (field === null || typeof field !== "object") {
            errors.push(`action ${name} field must be an object`);
            continue;
          }
          const f = field as Record<string, unknown> & {
            name?: unknown;
            label?: unknown;
            type?: unknown;
          };
          const fieldName = String(f.name ?? "<unknown>");
          if (typeof f.name !== "string" || f.name.trim() === "") {
            errors.push(`action ${name} field missing name`);
          } else if (actionFieldNames.has(f.name)) {
            errors.push(`duplicate action ${name} field: ${f.name}`);
          } else {
            actionFieldNames.add(f.name);
          }
          if (typeof f.label !== "string" || f.label.trim() === "") {
            errors.push(`action ${name} field ${fieldName} missing label`);
          }
          if (!ACTION_FIELD_TYPES.has(String(f.type))) {
            errors.push(`action ${name} field ${fieldName} has invalid type`);
          }
          if (f.pii !== undefined) {
            errors.push(`action ${name} field ${fieldName} pii is only valid for form fields`);
          }
          validateFieldFlags(f, `action ${name} field ${fieldName}`, errors);
          validateFieldOptions(f, `action ${name} field ${fieldName}`, errors);
          validateActionFieldDefault(f, `action ${name} field ${fieldName}`, errors);
        }
      }
      if (
        row.opensForm !== undefined &&
        typeof row.opensForm.form === "string" &&
        !knownForms.has(row.opensForm.form)
      ) {
        errors.push(`action ${name} opens unknown form ${row.opensForm.form}`);
      }
      validateOpensFormScope(
        row.opensForm?.scope,
        knownAttributes,
        actionFieldNames,
        `action ${name}`,
        errors,
      );
    }
  }

  return { desired, errors };
}

function setDiff(desired: Set<string>, current: Set<string>) {
  return {
    added: [...desired].filter((value) => !current.has(value)).sort(),
    removed: [...current].filter((value) => !desired.has(value)).sort(),
    unchanged: [...desired].filter((value) => current.has(value)).sort(),
  };
}

async function disableRuleByName(
  ctx: MutationCtx,
  name: string,
  now: number,
  tenantId?: Id<"tenants">,
): Promise<boolean> {
  const rule =
    tenantId === undefined
      ? await ctx.db
          .query("rules")
          .withIndex("by_name", (q) => q.eq("name", name))
          .unique()
      : await ctx.db
          .query("rules")
          .withIndex("by_tenant_and_name", (q) =>
            q.eq("tenantId", tenantId).eq("name", name),
          )
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
  tenantId?: Id<"tenants">,
): Promise<boolean> {
  const def =
    tenantId === undefined
      ? await ctx.db
          .query("flowDefs")
          .withIndex("by_name", (q) => q.eq("name", name))
          .unique()
      : await ctx.db
          .query("flowDefs")
          .withIndex("by_tenant_and_name", (q) =>
            q.eq("tenantId", tenantId).eq("name", name),
          )
          .unique();
  if (!def) return false;
  await ctx.db.delete(def._id);
  return true;
}

async function reconcileConfig(
  ctx: MutationCtx,
  desired: Record<ConfigKind, Set<string>>,
  kinds: Set<ConfigKind>,
  tenantId?: Id<"tenants">,
): Promise<Record<ConfigKind, number>> {
  const previous = await previousOwned(ctx, tenantId);
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
    tenantId,
    reason: "reconcile config",
    now,
  });
  const manifestEntity = configEntity(tenantId);

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
          tenantId,
        );
      } else if (kind === "entityType") {
        removed[kind] += await retractCurrentEntity(
          ctx,
          txId,
          now,
          typeId(value),
          "entity type removed from config",
          tenantId,
        );
      } else if (kind === "form") {
        removed[kind] += await retractCurrentEntity(
          ctx,
          txId,
          now,
          formEntity(value),
          "form removed from config",
          tenantId,
        );
      } else if (kind === "action") {
        removed[kind] += await retractCurrentEntity(
          ctx,
          txId,
          now,
          actionEntity(value),
          "action removed from config",
          tenantId,
        );
      } else if (kind === "requirement") {
        if (await disableRuleByName(ctx, `require.${value}`, now, tenantId)) {
          removed[kind]++;
        }
        if (await disableRuleByName(ctx, `task.${value}`, now, tenantId)) {
          removed[kind]++;
        }
      } else if (kind === "flow") {
        if (await deleteFlowDefByName(ctx, value, tenantId)) removed[kind]++;
      }
    }

    const manifestRows =
      tenantId === undefined
        ? await ctx.db
            .query("currentFacts")
            .withIndex("by_e_a", (q) =>
              q.eq("e", manifestEntity).eq("a", OWN_ATTR[kind]),
            )
            .take(1000)
        : await ctx.db
            .query("currentFacts")
            .withIndex("by_tenant_and_e_a", (q) =>
              q
                .eq("tenantId", tenantId)
                .eq("e", manifestEntity)
                .eq("a", OWN_ATTR[kind]),
            )
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
        e: manifestEntity,
        a: OWN_ATTR[kind],
        value,
      });
    }
  }

  return removed;
}

/** Lower a config literal into the store. Idempotent. */
export const applyConfig = mutation({
  args: { config: v.any(), tenantSlug: v.string() },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "admin");
    const validation = configDesired(
      args.config,
      await previousOwned(ctx, tenant.tenantId),
    );
    if (validation.errors.length > 0) {
      throw new Error(`invalid account config: ${validation.errors.join("; ")}`);
    }
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
        tenantSlug: tenant.tenantSlug,
        name: a.name,
        valueType: a.valueType,
        cardinality: a.cardinality,
        description: a.description,
      });
      applied.attributes++;
    }

    for (const t of cfg.entityTypes ?? []) {
      await ctx.runMutation(api.attributes.defineType, {
        tenantSlug: tenant.tenantSlug,
        name: t.name,
        attributes: t.attributes,
        description: t.description,
      });
      applied.entityTypes++;
    }

    for (const f of cfg.forms ?? []) {
      await ctx.runMutation(api.forms.defineForm, {
        tenantSlug: tenant.tenantSlug,
        form: f.form,
        title: f.title,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fields: f.fields as any,
      });
      applied.forms++;
    }

    for (const fl of cfg.flows ?? []) {
      await ctx.runMutation(api.flows.defineFlow, {
        tenantSlug: tenant.tenantSlug,
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
      const clauses = requirementClauses(r);
      await ctx.runMutation(api.rules.defineRule, {
        tenantSlug: tenant.tenantSlug,
        name: clauses.requirement.name,
        where: [...clauses.requirement.where],
        emit: clauses.requirement.emit,
        dependsOnAttributes: [...clauses.requirement.dependsOnAttributes],
      });
      await ctx.runMutation(api.rules.defineRule, {
        tenantSlug: tenant.tenantSlug,
        name: clauses.task.name,
        where: [...clauses.task.where],
        emit: clauses.task.emit,
        dependsOnAttributes: [...clauses.task.dependsOnAttributes],
      });
      applied.rules += 2;
    }

    for (const ac of cfg.actions ?? []) {
      await ctx.runMutation(api.actions.defineAction, {
        tenantSlug: tenant.tenantSlug,
        name: ac.name,
        label: ac.label,
        appliesTo: ac.appliesTo,
        fields: ac.fields,
        opensForm: ac.opensForm,
        asserts: ac.asserts ?? {},
      });
      applied.actions++;
    }

    const removed = await reconcileConfig(
      ctx,
      desired,
      reconcileKinds,
      tenant?.tenantId,
    );
    if (removed.requirement > 0) {
      await ctx.scheduler.runAfter(0, internal.rebuild.rebuildProjections, {});
    }

    return { ...applied, removed };
  },
});

export const planConfig = query({
  args: { config: v.any(), tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await tenantOrLegacyRead(ctx, args.tenantSlug);
    const current = await previousOwned(ctx, tenant?.tenantId);
    const { desired, errors } = configDesired(args.config, current);
    const byKind: Record<
      ConfigKind,
      { added: string[]; changed: string[]; removed: string[]; unchanged: string[] }
    > = {
      attribute: { ...setDiff(desired.attribute, current.attribute), changed: [] },
      entityType: { ...setDiff(desired.entityType, current.entityType), changed: [] },
      form: { ...setDiff(desired.form, current.form), changed: [] },
      flow: { ...setDiff(desired.flow, current.flow), changed: [] },
      requirement: { ...setDiff(desired.requirement, current.requirement), changed: [] },
      action: { ...setDiff(desired.action, current.action), changed: [] },
    };
    if (tenant !== null) {
      const sections = configSections(args.config);
      for (const kind of Object.keys(sections) as ConfigKind[]) {
        for (const item of sections[kind]) {
          const name = configItemName(kind, item);
          if (name === null || !current[kind].has(name)) continue;
          const currentItem = await exportOwnedItem(ctx, kind, name, tenant.tenantId);
          if (stableJson(item) !== stableJson(currentItem)) {
            byKind[kind].changed.push(name);
          }
        }
        byKind[kind].changed.sort();
      }
    }
    const dangerous = dangerousRemovals(byKind);
    return {
      tenantSlug: tenant?.tenantSlug ?? null,
      valid: errors.length === 0,
      errors,
      byKind,
      dangerous,
      totals: Object.fromEntries(
        Object.entries(byKind).map(([kind, diff]) => [
          kind,
          {
            added: diff.added.length,
            changed: diff.changed.length,
            removed: diff.removed.length,
            unchanged: diff.unchanged.length,
          },
        ]),
      ),
    };
  },
});

export const exportConfig = query({
  args: { tenantSlug: v.string() },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug);
    const tenantRow = await ctx.db.get(tenant.tenantId);
    const owned = await previousOwned(ctx, tenant.tenantId);
    const warnings = new Set<string>();

    const attributes = [];
    for (const name of [...owned.attribute].sort()) {
      attributes.push(await exportAttribute(ctx, name, tenant.tenantId));
    }

    const entityTypes = [];
    for (const name of [...owned.entityType].sort()) {
      entityTypes.push(
        await exportEntityType(ctx, name, tenant.tenantId, owned.attribute),
      );
    }

    const forms = [];
    for (const form of [...owned.form].sort()) {
      forms.push(await exportForm(ctx, form, tenant.tenantId));
    }

    const flows = [];
    for (const name of [...owned.flow].sort()) {
      flows.push(await exportFlow(ctx, name, tenant.tenantId));
    }

    const requirements = [];
    for (const form of [...owned.requirement].sort()) {
      const exported = await exportRequirement(ctx, form, tenant.tenantId);
      requirements.push(exported.requirement);
      if (exported.warning !== undefined) warnings.add(exported.warning);
    }

    const actions = [];
    for (const name of [...owned.action].sort()) {
      actions.push(await exportAction(ctx, name, tenant.tenantId));
    }

    return {
      account: {
        slug: tenant.tenantSlug,
        name: tenantRow?.name ?? tenant.tenantSlug,
        kind: tenantRow?.kind ?? "custom",
      },
      attributes,
      entityTypes,
      forms,
      flows,
      requirements,
      actions,
      warnings: [...warnings].sort(),
    };
  },
});

export const createApplyJob = mutation({
  args: { tenantSlug: v.string(), config: v.any() },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "admin");
    const current = await previousOwned(ctx, tenant.tenantId);
    const { desired, errors } = configDesired(args.config, current);
    if (errors.length > 0) {
      throw new Error(`invalid account config: ${errors.join("; ")}`);
    }
    const byKind: Record<
      ConfigKind,
      { added: string[]; changed: string[]; removed: string[]; unchanged: string[] }
    > = {
      attribute: { ...setDiff(desired.attribute, current.attribute), changed: [] },
      entityType: { ...setDiff(desired.entityType, current.entityType), changed: [] },
      form: { ...setDiff(desired.form, current.form), changed: [] },
      flow: { ...setDiff(desired.flow, current.flow), changed: [] },
      requirement: { ...setDiff(desired.requirement, current.requirement), changed: [] },
      action: { ...setDiff(desired.action, current.action), changed: [] },
    };
    const plan = {
      tenantSlug: tenant.tenantSlug,
      valid: true,
      errors: [] as string[],
      byKind,
      dangerous: dangerousRemovals(byKind),
    };
    const now = Date.now();
    const jobId = await ctx.db.insert("configApplyJobs", {
      tenantId: tenant.tenantId,
      tenantSlug: tenant.tenantSlug,
      requestedBy: tenant.principal,
      status: "queued",
      config: args.config,
      plan,
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    });
    return { jobId, plan };
  },
});

export const markApplyJobRunning = internalMutation({
  args: { jobId: v.id("configApplyJobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (job === null) throw new Error("apply job not found");
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "running",
      attempts: job.attempts + 1,
      error: undefined,
      startedAt: now,
      updatedAt: now,
    });
    return {
      tenantSlug: job.tenantSlug,
      config: job.config,
    };
  },
});

export const markApplyJobCompleted = internalMutation({
  args: { jobId: v.id("configApplyJobs"), result: v.any() },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "completed",
      result: args.result,
      error: undefined,
      completedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const markApplyJobFailed = internalMutation({
  args: { jobId: v.id("configApplyJobs"), error: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.db.patch(args.jobId, {
      status: "failed",
      error: args.error,
      completedAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const getApplyJob = query({
  args: { tenantSlug: v.string(), jobId: v.id("configApplyJobs") },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug);
    const job = await ctx.db.get(args.jobId);
    if (job === null) return null;
    if (job.tenantId !== tenant.tenantId) {
      throw new Error("Tenant access denied");
    }
    return job;
  },
});

export const authorizeApplyJobRetry = internalQuery({
  args: { tenantSlug: v.string(), jobId: v.id("configApplyJobs") },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "admin");
    const job = await ctx.db.get(args.jobId);
    if (job === null) return null;
    if (job.tenantId !== tenant.tenantId) {
      throw new Error("Tenant access denied");
    }
    return job;
  },
});

export const listApplyJobs = query({
  args: { tenantSlug: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug);
    return await ctx.db
      .query("configApplyJobs")
      .withIndex("by_tenant_and_createdAt", (q) =>
        q.eq("tenantId", tenant.tenantId),
      )
      .order("desc")
      .take(Math.min(args.limit ?? 10, 50));
  },
});

async function runApplyJob(
  ctx: ActionCtx,
  jobId: Id<"configApplyJobs">,
): Promise<{ jobId: Id<"configApplyJobs">; status: "completed" | "failed" }> {
  const job: Pick<Doc<"configApplyJobs">, "tenantSlug" | "config"> =
    await ctx.runMutation(internal.appconfig.markApplyJobRunning, { jobId });
  try {
    const result = await ctx.runMutation(api.appconfig.applyConfig, {
      tenantSlug: job.tenantSlug,
      config: job.config,
    });
    await ctx.runMutation(internal.appconfig.markApplyJobCompleted, {
      jobId,
      result,
    });
    return { jobId, status: "completed" };
  } catch (error) {
    await ctx.runMutation(internal.appconfig.markApplyJobFailed, {
      jobId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { jobId, status: "failed" };
  }
}

export const applyConfigJob = action({
  args: { tenantSlug: v.string(), config: v.any() },
  handler: async (ctx, args): Promise<{ jobId: Id<"configApplyJobs">; status: "completed" | "failed" }> => {
    const created: { jobId: Id<"configApplyJobs"> } = await ctx.runMutation(
      api.appconfig.createApplyJob,
      args,
    );
    return await runApplyJob(ctx, created.jobId);
  },
});

export const retryApplyConfigJob = action({
  args: { tenantSlug: v.string(), jobId: v.id("configApplyJobs") },
  handler: async (ctx, args): Promise<{ jobId: Id<"configApplyJobs">; status: "completed" | "failed" }> => {
    const job: Doc<"configApplyJobs"> | null = await ctx.runQuery(
      internal.appconfig.authorizeApplyJobRetry,
      args,
    );
    if (job === null) throw new Error("apply job not found");
    if (job.status !== "failed") {
      throw new Error("only failed apply jobs can be retried");
    }
    return await runApplyJob(ctx, args.jobId);
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
    { name: "everify.status", valueType: "string", cardinality: "one", description: "E-Verify workflow status." },
    { name: "i9/citizenship", valueType: "string", cardinality: "one", description: "I-9 citizenship status." },
    { name: "role", valueType: "string", cardinality: "one", description: "Job role." },
    { name: "worker", valueType: "entityRef", cardinality: "one", description: "The worker on a placement." },
    { name: "employer", valueType: "entityRef", cardinality: "one", description: "The employer on a placement." },
    { name: "client", valueType: "entityRef", cardinality: "one", description: "The client on a placement." },
    { name: "job", valueType: "entityRef", cardinality: "one", description: "The job on a placement." },
    { name: "venue", valueType: "entityRef", cardinality: "one", description: "The venue on a placement." },
  ],
  entityTypes: [
    { name: "Worker", attributes: ["name", "worker.status", "everify.status", "i9/citizenship"], description: "A staffed worker." },
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

export const LEGAL_BLUEPRINT = {
  attributes: [
    { name: "matter.status", valueType: "string", cardinality: "one", description: "Current matter lifecycle state." },
    { name: "practice.area", valueType: "string", cardinality: "one", description: "Legal practice area." },
    { name: "client", valueType: "entityRef", cardinality: "one", description: "Client associated with the matter." },
    { name: "responsible.attorney", valueType: "entityRef", cardinality: "one", description: "Attorney responsible for the matter." },
  ],
  entityTypes: [
    { name: "Matter", attributes: ["name", "matter.status", "practice.area", "client", "responsible.attorney"], description: "A legal matter." },
    { name: "Client", attributes: ["name"], description: "A legal client." },
    { name: "Attorney", attributes: ["name"], description: "A firm attorney." },
  ],
  forms: [
    {
      form: "conflict_check",
      title: "Conflict Check",
      fields: [
        { name: "cleared", label: "Conflict cleared", type: "boolean", required: true },
        { name: "notes", label: "Notes", type: "string" },
      ],
    },
    {
      form: "engagement_letter",
      title: "Engagement Letter",
      fields: [
        { name: "signed", label: "Signed", type: "boolean", required: true },
      ],
    },
  ],
  flows: [
    {
      name: "matter_intake",
      title: "Matter intake",
      subjectType: "Matter",
      startStepId: "conflict",
      steps: [
        { id: "conflict", type: "collect", config: { form: "conflict_check", scopeFrom: "client" }, next: "engagement" },
        { id: "engagement", type: "collect", config: { form: "engagement_letter", scopeFrom: "client" }, next: "open" },
        { id: "open", type: "assert", config: { a: "matter.status", v: "open" }, next: "done" },
        { id: "done", type: "done" },
      ],
    },
  ],
  requirements: [
    { form: "conflict_check", scopeAttr: "client" },
    { form: "engagement_letter", scopeAttr: "client" },
  ],
  actions: [
    { name: "close_matter", label: "Close matter", appliesTo: "Matter", asserts: { "matter.status": "closed" } },
  ],
};

/**
 * Install the staffing blueprint (schema + flows + rules + actions) and seed the
 * demo data. Replaces the old imperative setupComplianceRules + setupDemoFlow +
 * inline defineForm bootstrap with one config-as-code entry point.
 */
export const setupStaffing = mutation({
  args: { tenantSlug: v.string() },
  handler: async (ctx, args): Promise<{ applied: unknown }> => {
    const applied = await ctx.runMutation(api.appconfig.applyConfig, {
      tenantSlug: args.tenantSlug,
      config: STAFFING_BLUEPRINT,
    });
    await ctx.runMutation(api.compliance.seedStaffingDemo, {
      tenantSlug: args.tenantSlug,
    });
    return { applied };
  },
});

export const setupLegal = mutation({
  args: { tenantSlug: v.string() },
  handler: async (ctx, args): Promise<{ applied: unknown; txId: Id<"transactions"> }> => {
    const applied = await ctx.runMutation(api.appconfig.applyConfig, {
      tenantSlug: args.tenantSlug,
      config: LEGAL_BLUEPRINT,
    });
    const tenant = await requireTenant(ctx, args.tenantSlug, "editor");
    const actorId = tenant.principal;
    const now = Date.now();
    const txId = await createTransaction(ctx, {
      tenantId: tenant.tenantId,
      actorId,
      reason: "seed legal demo",
      now,
    });
    const tenantId = tenant.tenantId;
    const f = async (e: string, a: string, value: unknown) => {
      const current = await ctx.db
        .query("currentFacts")
        .withIndex("by_tenant_and_e_a", (q) =>
          q.eq("tenantId", tenantId).eq("e", e).eq("a", a),
        )
        .collect();
      if (current.some((row) => row.v === value)) return null;
      return assertInTx(ctx, txId, now, { e, a, value });
    };

    await f("client:globex", "type", "Client");
    await f("client:globex", "name", "Globex");
    await f("attorney:dana", "type", "Attorney");
    await f("attorney:dana", "name", "Dana Whitfield");
    await f("matter:globex-onboarding", "type", "Matter");
    await f("matter:globex-onboarding", "name", "Globex onboarding");
    await f("matter:globex-onboarding", "matter.status", "intake");
    await f("matter:globex-onboarding", "practice.area", "employment");
    await f("matter:globex-onboarding", "client", "client:globex");
    await f("matter:globex-onboarding", "responsible.attorney", "attorney:dana");

    return { applied, txId };
  },
});
