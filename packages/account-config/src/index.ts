import {
  parse,
  toSExprMany,
  type Loc,
  type SExpr,
} from "@forma/ts/reader";

export const CONFIG_KINDS = [
  "attribute",
  "entityType",
  "form",
  "flow",
  "requirement",
  "action",
] as const;

export type ConfigKind = (typeof CONFIG_KINDS)[number];

export type AccountConfigManifest = {
  attributes: string[];
  entityTypes: string[];
  forms: string[];
  flows: string[];
  requirements: string[];
  actions: string[];
};

export type AccountMetadata = {
  slug: string;
  name: string;
  kind: string;
};

export type AccountDeployArtifact = {
  kind: "metacrdt.account.deploy";
  version: 1;
  account: AccountMetadata;
  manifest: AccountConfigManifest;
  resources: Record<string, unknown>;
};

export type AccountDeployDump = {
  version: 1;
  source: {
    format: "account-config-ir";
    config: unknown;
    digest: string;
    diagnostics: string[];
    account: AccountMetadata;
    manifest: AccountConfigManifest;
  };
  prepared: {
    artifact: AccountDeployArtifact;
    digest: string;
  };
};

export type AccountDeployResourceAction = "added" | "changed" | "removed" | "unchanged";

export type AccountDeployResourceChange = {
  kind: ConfigKind;
  name: string;
  action: AccountDeployResourceAction;
  before?: unknown;
  after?: unknown;
};

export type AccountDeployAccountChange = {
  action: Exclude<AccountDeployResourceAction, "removed">;
  before: AccountMetadata | null;
  after: AccountMetadata;
  changedFields: string[];
};

export type AccountDeployPlanDiff = {
  added: string[];
  changed: string[];
  removed: string[];
  unchanged: string[];
};

export type AccountDeployDangerousChange = {
  kind: ConfigKind;
  value: string;
  reason: string;
};

export type AccountDeployPlan = {
  valid: boolean;
  errors: string[];
  empty: boolean;
  destructive: boolean;
  currentArtifactDigest: string | null;
  desiredArtifactDigest: string;
  account: AccountMetadata;
  accountChange: AccountDeployAccountChange;
  manifest: AccountConfigManifest;
  byKind: Record<ConfigKind, AccountDeployPlanDiff>;
  totals: Record<ConfigKind, {
    added: number;
    changed: number;
    removed: number;
    unchanged: number;
  }>;
  changes: AccountDeployResourceChange[];
  dangerous: AccountDeployDangerousChange[];
};

export type AccountConfigResourceGraphEdge = {
  fromKind: ConfigKind;
  fromName: string;
  toKind: ConfigKind;
  toName: string;
  relation: string;
};

export type AccountConfigResourceGraphMermaidOptions = {
  account?: Partial<AccountMetadata>;
};

export type AccountConfigSourceOutlineKind = "account" | ConfigKind;

export type AccountConfigSourceOutlineItem = {
  name: string;
  detail?: string;
  line?: number;
};

export type AccountConfigSourceOutlineGroup = {
  kind: AccountConfigSourceOutlineKind;
  label: string;
  items: AccountConfigSourceOutlineItem[];
};

export type AccountConfigSourceNavigationItem = {
  key: string;
  label: string;
  line: number;
  detail?: string;
  sourceLine?: string;
};

export type AccountDeployMainMeta = {
  url?: string;
};

export type AccountDeployIfMainTarget = {
  isMain?: boolean;
  mainModuleUrl?: string;
  tenantSlug?: string;
  sourceFormat?: string;
  currentArtifact?:
    | AccountDeployArtifact
    | null
    | (() => AccountDeployArtifact | null | Promise<AccountDeployArtifact | null>);
  plan?: (input: {
    tenantSlug?: string;
    config: unknown;
    artifact: AccountDeployArtifact;
    sourceDigest: string;
    artifactDigest: string;
    sourceFormat?: string;
    localPlan: AccountDeployPlan;
  }) => unknown | Promise<unknown>;
  approve?: (remotePlan: unknown) => unknown | Promise<unknown>;
  apply?: (remotePlan: unknown, approval?: unknown) => unknown | Promise<unknown>;
  autoApprove?: boolean;
  autoApply?: boolean;
  write?: (event: AccountDeployIfMainEvent) => void | Promise<void>;
};

export type AccountDeployIfMainEvent =
  | { type: "skipped"; reason: string }
  | { type: "dumped"; dump: AccountDeployDump }
  | { type: "planned"; plan: AccountDeployPlan; remotePlan?: unknown }
  | { type: "approved"; approval: unknown }
  | { type: "applied"; result: unknown };

export type AccountDeployIfMainResult =
  | {
      skipped: true;
      reason: string;
    }
  | {
      skipped: false;
      dump: AccountDeployDump;
      localPlan: AccountDeployPlan;
      remotePlan?: unknown;
      approval?: unknown;
      applyResult?: unknown;
    };

export type AccountDeployApplyTarget = {
  applyPlan: (input: {
    tenantSlug?: string;
    planId: string;
    approval?: unknown;
  }) => unknown | Promise<unknown>;
  write?: (event: AccountDeployIfMainEvent) => void | Promise<void>;
};

export type AccountDeployApproveTarget = {
  approvePlan: (input: {
    tenantSlug?: string;
    planId: string;
  }) => unknown | Promise<unknown>;
  write?: (event: AccountDeployIfMainEvent) => void | Promise<void>;
};

export type AccountConfigSourceDiagnostic = {
  message: string;
  loc?: Loc;
  path?: string;
};

export type FormaAccountConfigParseResult =
  | {
      config: Record<string, unknown>;
      diagnostics: AccountConfigSourceDiagnostic[];
    }
  | {
      config: null;
      diagnostics: AccountConfigSourceDiagnostic[];
    };

class FormaSourceError extends Error {
  loc?: Loc;
  path?: string;

  constructor(message: string, loc?: Loc, path?: string) {
    super(message);
    this.name = "FormaSourceError";
    if (loc !== undefined) this.loc = loc;
    if (path !== undefined) this.path = path;
  }
}

function sourceError(message: string, expr?: SExpr, path?: string): FormaSourceError {
  return new FormaSourceError(message, expr?.loc, path);
}

const FIELD_TYPES = new Set(["string", "number", "boolean", "date", "select"]);
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
const VALUE_TYPES = new Set([
  "string",
  "number",
  "boolean",
  "entityRef",
  "date",
  "json",
]);
const CARDINALITIES = new Set(["one", "many"]);

const RESOURCE_BUCKETS: Record<ConfigKind, string> = {
  attribute: "attributes",
  entityType: "entity_types",
  form: "forms",
  flow: "flows",
  requirement: "requirements",
  action: "actions",
};

const ACCOUNT_CONFIG_FORM_HEADS = [
  "account",
  "tenant",
  "attribute",
  "attr",
  "entity",
  "entity-type",
  "form",
  "flow",
  "requirement",
  "requires",
  "action",
] as const;

const ACCOUNT_CONFIG_SECTION_WRAPPER_HEADS = {
  attributes: ["attribute", "attr"],
  "entity-types": ["entity-type"],
  entities: ["entity"],
  forms: ["form"],
  flows: ["flow"],
  requirements: ["requirement", "requires"],
  actions: ["action"],
} as const;

const ACCOUNT_CONFIG_WRAPPER_HEADS = [
  "account-config",
  ...Object.keys(ACCOUNT_CONFIG_SECTION_WRAPPER_HEADS),
] as const;

const ACCOUNT_CONFIG_SUGGESTION_HEADS = [
  ...ACCOUNT_CONFIG_FORM_HEADS,
  ...ACCOUNT_CONFIG_WRAPPER_HEADS,
  "value-type",
  "subject-type",
  "start",
  "scope",
  "scope-attr",
  "valid-for",
  "validity-days",
  "applies-to",
  "opens-form",
  "default",
  "default-value",
  "result-attr",
  "result-value",
  "scope-from",
  "if-true",
  "if-false",
  "subject-var",
  "delay-seconds",
  "reminder-seconds",
  "escalate-seconds",
  "expire-seconds",
  "field",
  "fields",
  "step",
  "steps",
  "assert",
  "asserts",
  "collect",
  "branch",
  "notify",
  "wait",
  "done",
] as const;

function isAccountConfigFormHead(head: string | undefined): boolean {
  return (
    head !== undefined &&
    ACCOUNT_CONFIG_FORM_HEADS.includes(head as typeof ACCOUNT_CONFIG_FORM_HEADS[number])
  );
}

function isAccountConfigWrapperHead(head: string | undefined): boolean {
  return (
    head !== undefined &&
    ACCOUNT_CONFIG_WRAPPER_HEADS.includes(head as typeof ACCOUNT_CONFIG_WRAPPER_HEADS[number])
  );
}

function allowedSectionWrapperChildHeads(head: string): readonly string[] | undefined {
  return ACCOUNT_CONFIG_SECTION_WRAPPER_HEADS[
    head as keyof typeof ACCOUNT_CONFIG_SECTION_WRAPPER_HEADS
  ];
}

function sectionWrapperForChildHead(head: string | undefined): string | undefined {
  if (head === undefined) return undefined;
  for (const [wrapperHead, childHeads] of Object.entries(ACCOUNT_CONFIG_SECTION_WRAPPER_HEADS)) {
    if ((childHeads as readonly string[]).includes(head)) return wrapperHead;
  }
  return undefined;
}

function formatAllowedSectionWrapperChildren(heads: readonly string[]): string {
  if (heads.length === 1) return `${heads[0]} resources`;
  return `${heads.slice(0, -1).join(", ")} or ${heads[heads.length - 1]} resources`;
}

function invalidWrapperChildMessage(
  wrapperHead: string,
  allowedHeads: readonly string[],
  child: SExpr,
): string {
  const found = sexprHead(child);
  const foundLabel = found ??
    (child._tag === "List" ? "an unnamed list" : child._tag.toLowerCase());
  const suggestedWrapper = sectionWrapperForChildHead(found);
  const suggestedChild = found === undefined
    ? undefined
    : closeMatchSuggestion(found, allowedHeads);
  const hint = suggestedWrapper !== undefined && suggestedWrapper !== wrapperHead
    ? `. Move ${found} resources under the ${suggestedWrapper} wrapper or keep them top-level.`
    : suggestedChild === undefined
      ? ""
      : `. Did you mean ${suggestedChild}?`;
  return `${wrapperHead} wrapper can only contain ${
    formatAllowedSectionWrapperChildren(allowedHeads)
  }; found ${foundLabel}${hint}`;
}

function unknownAccountConfigFormMessage(head: string | undefined): string {
  const found = head ?? "<unknown>";
  const hints: Record<string, string> = {
    accountConfig:
      "Use account-config as the bundle wrapper.",
    entityType:
      "Use entity-type for standalone entity types, entity for compact entities, or entities as a grouping wrapper.",
    entityTypes:
      "Use entity-type for standalone entity types, entity for compact entities, or entities as a grouping wrapper.",
    entity_types:
      "Use entity-types as the grouping wrapper or entity-type for a standalone entity type.",
    "entity-types":
      "Use entity-type for a standalone entity type, or put entity-type forms inside an entity-types wrapper.",
    valueType:
      "Use value-type inside attr/attribute forms, or the compact positional attr shorthand.",
    subjectType:
      "Use subject-type inside a flow, or the compact positional flow subject shorthand.",
    startStepId:
      "Use start inside a flow, or the compact positional flow start shorthand.",
    scopeAttr:
      "Use scope or scope-attr inside a requirement/requires form.",
    validityDays:
      "Use valid-for or validity-days inside a requirement/requires form.",
    appliesTo:
      "Use applies-to inside an action, or the compact positional action shorthand.",
    opensForm:
      "Use opens-form inside an action.",
    defaultValue:
      "Use default or default-value inside a form or action field.",
    resultAttr:
      "Use result-attr inside an action workflow step.",
    resultValue:
      "Use result-value inside an action workflow step.",
    scopeFrom:
      "Use scope or scope-from inside a collect workflow step.",
    ifTrue:
      "Use if-true inside a branch workflow step.",
    ifFalse:
      "Use if-false inside a branch workflow step.",
    subjectVar:
      "Use subject-var inside a branch workflow step.",
    delaySeconds:
      "Use delay-seconds inside notify or action workflow steps.",
    reminderSeconds:
      "Use reminder-seconds inside a collect workflow step.",
    escalateSeconds:
      "Use escalate-seconds inside a collect workflow step.",
    expireSeconds:
      "Use expire-seconds inside a collect workflow step.",
    field:
      "Field resources must be nested inside a form/action, or inside a fields wrapper within one.",
    fields:
      "The fields wrapper is only valid inside a form or action.",
    step:
      "Step resources must be nested inside a flow, or inside a steps wrapper within one.",
    collect:
      "Collect steps must be nested inside a flow, or inside a steps wrapper within one.",
    branch:
      "Branch steps must be nested inside a flow, or inside a steps wrapper within one.",
    notify:
      "Notify steps must be nested inside a flow, or inside a steps wrapper within one.",
    done:
      "Done steps must be nested inside a flow, or inside a steps wrapper within one.",
    steps:
      "The steps wrapper is only valid inside a flow.",
    assert:
      "Assert resources must be nested inside an action, or inside an asserts wrapper within one.",
    asserts:
      "The asserts wrapper is only valid inside an action.",
  };
  const hint = hints[found];
  const suggestion = closeMatchSuggestion(found, ACCOUNT_CONFIG_SUGGESTION_HEADS);
  if (hint !== undefined) return `unknown account config form: ${found}. ${hint}`;
  return `unknown account config form: ${found}${
    suggestion === undefined ? "" : `. Did you mean ${suggestion}?`
  }`;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function ownValue(value: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
  }
  return undefined;
}

function sexprHead(expr: SExpr): string | undefined {
  return expr._tag === "List" && expr.items[0]?._tag === "Sym"
    ? expr.items[0].name
    : undefined;
}

function sexprTail(expr: SExpr): readonly SExpr[] {
  return expr._tag === "List" ? expr.items.slice(1) : [];
}

function scalarString(expr: SExpr, context: string): string {
  if (expr._tag === "Str") return expr.value;
  if (expr._tag === "Sym") return expr.name;
  throw sourceError(`${context} must be a string or symbol`, expr);
}

function positionalArgs(form: SExpr): readonly SExpr[] {
  return sexprTail(form).slice(1).filter((entry) => entry._tag !== "List");
}

function optionalString(expr: SExpr | undefined, context: string): string | undefined {
  return expr === undefined ? undefined : scalarString(expr, context);
}

function optionalNumber(expr: SExpr | undefined, context: string): number | undefined {
  if (expr === undefined) return undefined;
  if (expr._tag === "Num") return expr.value;
  throw sourceError(`${context} must be a number`, expr);
}

function optionalBoolean(expr: SExpr | undefined, context: string): boolean | undefined {
  if (expr === undefined) return undefined;
  if (expr._tag === "Bool") return expr.value;
  throw sourceError(`${context} must be a boolean`, expr);
}

function optionalBooleanPart(form: SExpr, key: string, context: string): boolean | undefined {
  const entry = listItems(form, key)[0];
  if (entry === undefined) return undefined;
  const [value] = sexprTail(entry);
  if (value === undefined) return true;
  return optionalBoolean(value, context);
}

function listItem(form: SExpr, key: string): SExpr | undefined {
  for (const entry of sexprTail(form)) {
    if (sexprHead(entry) === key) return sexprTail(entry)[0];
  }
  return undefined;
}

function listItems(form: SExpr, key: string): readonly SExpr[] {
  return sexprTail(form).filter((entry) => sexprHead(entry) === key);
}

function duplicateSingletonDiagnostics(
  form: SExpr,
  context: string,
  heads: readonly string[],
): AccountConfigSourceDiagnostic[] {
  return heads.flatMap((head) => {
    const entries = listItems(form, head);
    return entries.slice(1).map((entry) =>
      diagnostic(
        `${context} has multiple ${head} entries; only the first is used`,
        entry,
      )
    );
  });
}

function groupedListItems(
  form: SExpr,
  itemHeads: readonly string[],
  wrapperHead: string,
): readonly SExpr[] {
  const expected = new Set(itemHeads);
  const entries = sexprTail(form).filter((entry) => {
    const head = sexprHead(entry);
    return head !== undefined && expected.has(head);
  });
  const grouped: SExpr[] = [];
  for (const wrapper of listItems(form, wrapperHead)) {
    for (const child of sexprTail(wrapper)) {
      const head = sexprHead(child);
      if (child._tag !== "List" || head === undefined || !expected.has(head)) {
        throw sourceError(invalidWrapperChildMessage(wrapperHead, itemHeads, child), child);
      }
      grouped.push(child);
    }
  }
  return [...entries, ...grouped];
}

function firstListWithHead(form: SExpr, heads: readonly string[]): SExpr | undefined {
  const expected = new Set(heads);
  return sexprTail(form).find((entry) => {
    const head = sexprHead(entry);
    return head !== undefined && expected.has(head);
  });
}

function vectorStrings(expr: SExpr | undefined, context: string): string[] | undefined {
  if (expr === undefined) return undefined;
  if (expr._tag !== "Vector") throw sourceError(`${context} must be a vector`, expr);
  return expr.items.map((item, index) => scalarString(item, `${context}[${index}]`));
}

function sexprValue(expr: SExpr): unknown {
  if (expr._tag === "Str") return expr.value;
  if (expr._tag === "Num") return expr.value;
  if (expr._tag === "Bool") return expr.value;
  if (expr._tag === "Sym") return expr.name;
  if (expr._tag === "Vector") return expr.items.map((item) => sexprValue(item));
  if (expr._tag === "Set") return expr.items.map((item) => sexprValue(item));
  if (expr._tag === "Map") {
    return Object.fromEntries(
      expr.pairs.map(([key, value]) => [scalarString(key, "map key"), sexprValue(value)]),
    );
  }
  if (expr._tag === "List") {
    return expr.items.map((item) => sexprValue(item));
  }
  if (expr._tag === "Error") {
    throw sourceError(expr.message, expr);
  }
  throw sourceError("unsupported S-expression value", expr);
}

function sectionEntries(expressions: readonly SExpr[], head: string): readonly SExpr[] {
  return expressions.filter((expr) => sexprHead(expr) === head);
}

function unwrapAccountConfigExpression(expr: SExpr, parentHead?: string): SExpr[] {
  const head = sexprHead(expr);
  if (!isAccountConfigWrapperHead(head)) {
    if (parentHead !== undefined) {
      const allowed = allowedSectionWrapperChildHeads(parentHead) ?? [];
      if (head === undefined || !allowed.includes(head)) {
        throw sourceError(invalidWrapperChildMessage(parentHead, allowed, expr), expr);
      }
    }
    return [expr];
  }

  const unwrapped: SExpr[] = [];
  for (const child of sexprTail(expr)) {
    if (child._tag !== "List") {
      throw sourceError(`${head} wrapper can only contain account config forms`, child);
    }
    if (head === "account-config") {
      unwrapped.push(...unwrapAccountConfigExpression(child));
      continue;
    }
    unwrapped.push(...unwrapAccountConfigExpression(child, head));
  }
  return unwrapped;
}

function unwrapAccountConfigExpressions(expressions: readonly SExpr[]): SExpr[] {
  const unwrapped: SExpr[] = [];
  for (const expr of expressions) {
    unwrapped.push(...unwrapAccountConfigExpression(expr));
  }
  return unwrapped;
}

function diagnostic(message: string, expr?: SExpr, path?: string): AccountConfigSourceDiagnostic {
  return {
    message,
    ...(expr ? { loc: expr.loc } : {}),
    ...(path ? { path } : {}),
  };
}

function diagnosticAtLoc(message: string, loc?: Loc, path?: string): AccountConfigSourceDiagnostic {
  return {
    message,
    ...(loc ? { loc } : {}),
    ...(path ? { path } : {}),
  };
}

function resourceName(expr: SExpr): string | undefined {
  const [nameExpr] = sexprTail(expr);
  if (nameExpr === undefined) return undefined;
  try {
    return scalarString(nameExpr, "resource name");
  } catch {
    return undefined;
  }
}

function resourceKey(kind: ConfigKind, name: string): string {
  return `${kind}:${name}`;
}

function formFieldKey(formName: string, fieldName: string): string {
  return `formField:${formName}:${fieldName}`;
}

function actionFieldKey(actionName: string, fieldName: string): string {
  return `actionField:${actionName}:${fieldName}`;
}

function flowStepKey(flowName: string, stepId: string): string {
  return `flowStep:${flowName}:${stepId}`;
}

type SourceLocationIndex = Map<string, SExpr[]>;

const COMPACT_STEP_HEADS = [
  "collect",
  "notify",
  "assert",
  "action",
  "branch",
  "wait",
  "delay",
  "pause",
  "done",
] as const;

function isCompactStepHead(head: string | undefined): boolean {
  return head !== undefined && COMPACT_STEP_HEADS.includes(head as typeof COMPACT_STEP_HEADS[number]);
}

function flowStepForms(form: SExpr): readonly SExpr[] {
  return groupedListItems(form, ["step", ...COMPACT_STEP_HEADS], "steps");
}

function directCompactStepId(expr: SExpr): string | undefined {
  const head = sexprHead(expr);
  const [, idExpr] = expr._tag === "List" ? expr.items : [];
  if (idExpr === undefined && head === "done") return "done";
  if (idExpr === undefined) return undefined;
  try {
    return scalarString(idExpr, `${head ?? "compact"} step id`);
  } catch {
    return undefined;
  }
}

function addResourceLocation(
  locations: SourceLocationIndex,
  kind: ConfigKind,
  name: string | undefined,
  expr: SExpr,
) {
  if (name === undefined || name.trim() === "") return;
  const key = resourceKey(kind, name);
  locations.set(key, [...(locations.get(key) ?? []), expr]);
}

function addNestedLocation(
  locations: SourceLocationIndex,
  key: string,
  expr: SExpr,
) {
  locations.set(key, [...(locations.get(key) ?? []), expr]);
}

function collectFormChildLocations(locations: SourceLocationIndex, form: SExpr) {
  const formName = resourceName(form);
  if (formName === undefined) return;
  for (const child of groupedListItems(form, ["field"], "fields")) {
    const fieldName = resourceName(child);
    if (fieldName !== undefined) {
      addNestedLocation(locations, formFieldKey(formName, fieldName), child);
    }
  }
  for (const child of groupedListItems(form, ["requires", "requirement"], "requirements")) {
    const head = sexprHead(child);
    if (head === "requires" || head === "requirement") {
      addResourceLocation(locations, "requirement", formName, child);
    }
  }
}

function collectFlowChildLocations(locations: SourceLocationIndex, flow: SExpr) {
  const flowName = resourceName(flow);
  if (flowName === undefined) return;
  for (const child of flowStepForms(flow)) {
    const head = sexprHead(child);
    if (head !== "step" && !isCompactStepHead(head)) continue;
    const stepId = head === "step" ? resourceName(child) : directCompactStepId(child);
    if (stepId !== undefined) {
      addNestedLocation(locations, flowStepKey(flowName, stepId), child);
    }
  }
}

function collectActionChildLocations(locations: SourceLocationIndex, action: SExpr) {
  const actionName = resourceName(action);
  if (actionName === undefined) return;
  for (const child of groupedListItems(action, ["field"], "fields")) {
    const fieldName = resourceName(child);
    if (fieldName !== undefined) {
      addNestedLocation(locations, actionFieldKey(actionName, fieldName), child);
    }
  }
}

function collectEntityResourceLocations(locations: SourceLocationIndex, entity: SExpr) {
  const entityName = resourceName(entity);
  addResourceLocation(locations, "entityType", entityName, entity);
  for (const child of groupedListItems(entity, ["attr", "attribute"], "attributes")) {
    addResourceLocation(locations, "attribute", resourceName(child), child);
  }
  for (const child of groupedListItems(entity, ["form"], "forms")) {
    addResourceLocation(locations, "form", resourceName(child), child);
    collectFormChildLocations(locations, child);
  }
  for (const child of groupedListItems(entity, ["flow"], "flows")) {
    addResourceLocation(locations, "flow", resourceName(child), child);
    collectFlowChildLocations(locations, child);
  }
  for (const child of groupedListItems(entity, ["requirement", "requires"], "requirements")) {
    addResourceLocation(locations, "requirement", resourceName(child), child);
  }
  for (const child of groupedListItems(entity, ["action"], "actions")) {
    addResourceLocation(locations, "action", resourceName(child), child);
    collectActionChildLocations(locations, child);
  }
}

function collectResourceLocations(expressions: readonly SExpr[]): SourceLocationIndex {
  const locations: SourceLocationIndex = new Map();
  for (const expr of expressions) {
    const head = sexprHead(expr);
    if (head === "attribute" || head === "attr") {
      addResourceLocation(locations, "attribute", resourceName(expr), expr);
    }
    if (head === "entity-type") {
      addResourceLocation(locations, "entityType", resourceName(expr), expr);
    }
    if (head === "entity") collectEntityResourceLocations(locations, expr);
    if (head === "form") {
      addResourceLocation(locations, "form", resourceName(expr), expr);
      collectFormChildLocations(locations, expr);
    }
    if (head === "flow") {
      addResourceLocation(locations, "flow", resourceName(expr), expr);
      collectFlowChildLocations(locations, expr);
    }
    if (head === "requirement" || head === "requires") {
      addResourceLocation(locations, "requirement", resourceName(expr), expr);
    }
    if (head === "action") {
      addResourceLocation(locations, "action", resourceName(expr), expr);
      collectActionChildLocations(locations, expr);
    }
  }
  return locations;
}

function sourceResourceLabel(kind: string, expr: SExpr): string {
  const name = resourceName(expr);
  return name === undefined ? kind : `${kind} ${name}`;
}

function collectFieldSingletonDiagnostics(
  field: SExpr,
  context: string,
): AccountConfigSourceDiagnostic[] {
  return duplicateSingletonDiagnostics(field, context, [
    "label",
    "type",
    "description",
    "help",
    "required",
    "pii",
    "options",
    "default",
    "default-value",
  ]);
}

function collectFormSingletonDiagnostics(form: SExpr): AccountConfigSourceDiagnostic[] {
  const context = sourceResourceLabel("form", form);
  return [
    ...duplicateSingletonDiagnostics(form, context, ["title", "description", "help"]),
    ...groupedListItems(form, ["field"], "fields").flatMap((field) =>
      collectFieldSingletonDiagnostics(
        field,
        `${context} field ${resourceName(field) ?? "<unknown>"}`,
      )
    ),
  ];
}

function collectStepSingletonDiagnostics(
  step: SExpr,
  context: string,
): AccountConfigSourceDiagnostic[] {
  return duplicateSingletonDiagnostics(step, context, [
    "type",
    "config",
    "next",
    "scope",
    "scope-from",
    "reminder-seconds",
    "escalate-seconds",
    "expire-seconds",
    "channel",
    "to",
    "template",
    "delay-seconds",
    "label",
    "result-attr",
    "result-value",
    "where",
    "if-true",
    "if-false",
    "subject-var",
    "seconds",
  ]);
}

function collectFlowSingletonDiagnostics(flow: SExpr): AccountConfigSourceDiagnostic[] {
  const context = sourceResourceLabel("flow", flow);
  return [
    ...duplicateSingletonDiagnostics(flow, context, [
      "subject-type",
      "title",
      "description",
      "help",
      "start",
    ]),
    ...flowStepForms(flow).flatMap((step) => {
      const head = sexprHead(step);
      const stepName = head === "step" ? resourceName(step) : directCompactStepId(step);
      return collectStepSingletonDiagnostics(step, `${context} step ${stepName ?? "<unknown>"}`);
    }),
  ];
}

function collectRequirementSingletonDiagnostics(
  requirement: SExpr,
): AccountConfigSourceDiagnostic[] {
  return duplicateSingletonDiagnostics(
    requirement,
    sourceResourceLabel("requirement", requirement),
    [
      "scope",
      "scope-attr",
      "validity-days",
      "valid-for",
      "description",
      "help",
      "guard",
      "when",
    ],
  );
}

function collectActionSingletonDiagnostics(action: SExpr): AccountConfigSourceDiagnostic[] {
  const context = sourceResourceLabel("action", action);
  return [
    ...duplicateSingletonDiagnostics(action, context, [
      "label",
      "description",
      "help",
      "applies-to",
      "opens-form",
    ]),
    ...groupedListItems(action, ["field"], "fields").flatMap((field) =>
      collectFieldSingletonDiagnostics(
        field,
        `${context} field ${resourceName(field) ?? "<unknown>"}`,
      )
    ),
  ];
}

function collectEntitySingletonDiagnostics(entity: SExpr): AccountConfigSourceDiagnostic[] {
  return [
    ...duplicateSingletonDiagnostics(entity, sourceResourceLabel("entity", entity), [
      "description",
      "help",
    ]),
    ...groupedListItems(entity, ["attr", "attribute"], "attributes").flatMap((attr) =>
      duplicateSingletonDiagnostics(attr, sourceResourceLabel("attribute", attr), [
        "value-type",
        "cardinality",
        "description",
        "help",
      ])
    ),
    ...groupedListItems(entity, ["form"], "forms").flatMap(collectFormSingletonDiagnostics),
    ...groupedListItems(entity, ["flow"], "flows").flatMap(collectFlowSingletonDiagnostics),
    ...groupedListItems(entity, ["requirement", "requires"], "requirements")
      .flatMap(collectRequirementSingletonDiagnostics),
    ...groupedListItems(entity, ["action"], "actions").flatMap(collectActionSingletonDiagnostics),
  ];
}

function collectAmbiguousSingletonDiagnostics(
  expressions: readonly SExpr[],
): AccountConfigSourceDiagnostic[] {
  return expressions.flatMap((expr) => {
    const head = sexprHead(expr);
    if (head === "account" || head === "tenant") {
      return duplicateSingletonDiagnostics(expr, head, ["slug", "name", "kind"]);
    }
    if (head === "attribute" || head === "attr") {
      return duplicateSingletonDiagnostics(expr, sourceResourceLabel("attribute", expr), [
        "value-type",
        "cardinality",
        "description",
        "help",
      ]);
    }
    if (head === "entity-type") {
      return duplicateSingletonDiagnostics(expr, sourceResourceLabel("entity-type", expr), [
        "attributes",
        "description",
        "help",
      ]);
    }
    if (head === "entity") return collectEntitySingletonDiagnostics(expr);
    if (head === "form") return collectFormSingletonDiagnostics(expr);
    if (head === "flow") return collectFlowSingletonDiagnostics(expr);
    if (head === "requirement" || head === "requires") {
      return collectRequirementSingletonDiagnostics(expr);
    }
    if (head === "action") return collectActionSingletonDiagnostics(expr);
    return [];
  });
}

function diagnosticResourceKey(message: string): string | undefined {
  const formField = /^form ([^\s]+) field ([^\s]+) /.exec(message);
  if (formField) return formFieldKey(formField[1]!, formField[2]!);

  const actionField = /^action ([^\s]+) field ([^\s]+) /.exec(message);
  if (actionField) return actionFieldKey(actionField[1]!, actionField[2]!);

  const flowStep = /^flow ([^\s]+) step ([^\s]+) /.exec(message);
  if (flowStep) return flowStepKey(flowStep[1]!, flowStep[2]!);

  const duplicateFormField = /^duplicate form ([^\s]+) field: (.+)$/.exec(message);
  if (duplicateFormField) return formFieldKey(duplicateFormField[1]!, duplicateFormField[2]!);

  const duplicateActionField = /^duplicate action ([^\s]+) field: (.+)$/.exec(message);
  if (duplicateActionField) return actionFieldKey(duplicateActionField[1]!, duplicateActionField[2]!);

  const duplicateFlowStep = /^duplicate flow ([^\s]+) step: (.+)$/.exec(message);
  if (duplicateFlowStep) return flowStepKey(duplicateFlowStep[1]!, duplicateFlowStep[2]!);

  const duplicate = /^duplicate (attribute|entityType|form|flow|requirement|action): (.+)$/.exec(
    message,
  );
  if (duplicate) return resourceKey(duplicate[1] as ConfigKind, duplicate[2]!);

  const direct = /^(attribute|entityType|form|flow|action) ([^\s]+) /.exec(message);
  if (direct) return resourceKey(direct[1] as ConfigKind, direct[2]!);

  const unknownRequirementForm = /^requirement references unknown form (.+)$/.exec(message);
  if (unknownRequirementForm) return resourceKey("requirement", unknownRequirementForm[1]!);

  const requirement = /^requirement ([^\s]+) /.exec(message);
  if (requirement) return resourceKey("requirement", requirement[1]!);

  return undefined;
}

function isDuplicateDiagnostic(message: string): boolean {
  return /^duplicate /.test(message);
}

function duplicateLineHint(
  message: string,
  expressions: readonly SExpr[] | undefined,
): string {
  if (!isDuplicateDiagnostic(message) || expressions === undefined || expressions.length < 2) {
    return message;
  }
  const first = expressions[0]?.loc?.line;
  const duplicate = expressions[expressions.length - 1]?.loc?.line;
  if (first === undefined || duplicate === undefined || first === duplicate) {
    return message;
  }
  return `${message} (first defined on line ${first}, duplicate on line ${duplicate})`;
}

function attachSourceLocations(
  messages: readonly string[],
  locations: SourceLocationIndex,
): AccountConfigSourceDiagnostic[] {
  return messages.map((message) => {
    const key = diagnosticResourceKey(message);
    const expressions = key === undefined ? undefined : locations.get(key);
    const expr = expressions?.[expressions.length - 1];
    return diagnostic(duplicateLineHint(message, expressions), expr, key);
  });
}

function parseFormaField(form: SExpr): Record<string, unknown> {
  const [nameExpr] = sexprTail(form);
  if (nameExpr === undefined) throw new Error("field missing name");
  const positional = positionalArgs(form);
  const positionalOptions =
    positional[2]?._tag === "Vector"
      ? vectorStrings(positional[2], "field options")
      : undefined;
  const field: Record<string, unknown> = {
    name: scalarString(nameExpr, "field name"),
    label:
      optionalString(listItem(form, "label"), "field label") ??
      optionalString(positional[1], "field label"),
    type:
      optionalString(listItem(form, "type"), "field type") ??
      optionalString(positional[0], "field type"),
    description:
      optionalString(listItem(form, "description") ?? listItem(form, "help"), "field description") ??
      optionalString(
        positionalOptions === undefined ? positional[2] : positional[3],
        "field description",
      ),
  };
  const required = optionalBooleanPart(form, "required", "field required");
  if (required !== undefined) field.required = required;
  const pii = optionalBooleanPart(form, "pii", "field pii");
  if (pii !== undefined) field.pii = pii;
  const options =
    vectorStrings(listItem(form, "options"), "field options") ??
    positionalOptions;
  if (options !== undefined) field.options = options;
  const defaultValue = listItem(form, "default-value") ?? listItem(form, "default");
  if (defaultValue !== undefined) field.defaultValue = sexprValue(defaultValue);
  return Object.fromEntries(
    Object.entries(field).filter(([, value]) => value !== undefined),
  );
}

function parseFormaActionField(form: SExpr): Record<string, unknown> {
  return parseFormaField(form);
}

function parseFormaStep(form: SExpr): Record<string, unknown> {
  const [idExpr] = sexprTail(form);
  if (idExpr === undefined) throw new Error("step missing id");
  const shorthand = firstListWithHead(form, COMPACT_STEP_HEADS);
  const explicitType = listItem(form, "type");
  const explicitConfig = listItem(form, "config");
  if (shorthand !== undefined && (explicitType !== undefined || explicitConfig !== undefined)) {
    throw new Error("step cannot mix compact shorthand with explicit type/config");
  }
  const step: Record<string, unknown> = {
    id: scalarString(idExpr, "step id"),
    type: optionalString(explicitType, "step type"),
  };
  const config = explicitConfig;
  if (config !== undefined) step.config = sexprValue(config);
  if (shorthand !== undefined) {
    const compact = parseCompactStep(shorthand);
    step.type = compact.type;
    if (compact.config !== undefined) step.config = compact.config;
  }
  const compactNext = shorthand === undefined ? undefined : positionalArgs(form)[0];
  const next =
    optionalString(listItem(form, "next"), "step next") ??
    optionalString(compactNext, "step next");
  if (next !== undefined) step.next = next;
  return Object.fromEntries(
    Object.entries(step).filter(([, value]) => value !== undefined),
  );
}

function parseDirectCompactStep(form: SExpr): Record<string, unknown> {
  const head = sexprHead(form);
  const [, idExpr] = form._tag === "List" ? form.items : [];
  if (idExpr === undefined && head !== "done") {
    throw new Error(`${head ?? "compact"} step missing id`);
  }
  const compactForm =
    form._tag === "List"
      ? {
          ...form,
          items: form.items.filter((entry, index) => {
            if (index === 0) return true;
            if (idExpr === undefined && head === "done") return sexprHead(entry) === "next";
            if (index === 1) return false;
            return sexprHead(entry) !== "next";
          }),
        }
      : form;
  const compact = parseCompactStep(compactForm);
  const next = optionalString(listItem(form, "next"), `${head ?? "compact"} step next`);
  const id = idExpr === undefined ? "done" : scalarString(idExpr, `${head ?? "compact"} step id`);
  return Object.fromEntries(
    Object.entries({
      id,
      type: compact.type,
      config: compact.config,
      next,
    }).filter(([, value]) => value !== undefined),
  );
}

function parseCompactStep(form: SExpr): { type: string; config?: Record<string, unknown> } {
  const head = sexprHead(form);
  if (head === "done") return { type: "done" };

  if (head === "collect") {
    const [formExpr] = sexprTail(form);
    if (formExpr === undefined) throw new Error("collect step missing form");
    const positional = positionalArgs(form);
    return {
      type: "collect",
      config: Object.fromEntries(
        Object.entries({
          form: scalarString(formExpr, "collect step form"),
          scopeFrom:
            optionalString(listItem(form, "scope"), "collect step scope") ??
            optionalString(listItem(form, "scope-from"), "collect step scope-from") ??
            optionalString(positional[0], "collect step scope-from"),
          reminderSeconds: optionalNumber(
            listItem(form, "reminder-seconds"),
            "collect step reminder-seconds",
          ),
          escalateSeconds: optionalNumber(
            listItem(form, "escalate-seconds"),
            "collect step escalate-seconds",
          ),
          expireSeconds: optionalNumber(
            listItem(form, "expire-seconds"),
            "collect step expire-seconds",
          ),
        }).filter(([, value]) => value !== undefined),
      ),
    };
  }

  if (head === "notify") {
    const [messageExpr] = sexprTail(form);
    if (messageExpr === undefined) throw new Error("notify step missing message");
    const positional = positionalArgs(form);
    return {
      type: "notify",
      config: Object.fromEntries(
        Object.entries({
          message: scalarString(messageExpr, "notify step message"),
          channel:
            optionalString(listItem(form, "channel"), "notify step channel") ??
            optionalString(positional[0], "notify step channel"),
          to:
            optionalString(listItem(form, "to"), "notify step to") ??
            optionalString(positional[1], "notify step to"),
          template:
            optionalString(listItem(form, "template"), "notify step template") ??
            optionalString(positional[2], "notify step template"),
          delaySeconds: optionalNumber(
            listItem(form, "delay-seconds"),
            "notify step delay-seconds",
          ),
        }).filter(([, value]) => value !== undefined),
      ),
    };
  }

  if (head === "assert") {
    const [attr, value] = parseAttributeValuePair(form, "assert step");
    return {
      type: "assert",
      config: {
        a: attr,
        v: value,
      },
    };
  }

  if (head === "action") {
    const positional = sexprTail(form).filter((entry) => entry._tag !== "List");
    const resultValueExpr = listItem(form, "result-value");
    return {
      type: "action",
      config: Object.fromEntries(
        Object.entries({
          label:
            optionalString(listItem(form, "label"), "action step label") ??
            optionalString(positional[0], "action step label"),
          resultAttr:
            optionalString(listItem(form, "result-attr"), "action step result-attr") ??
            optionalString(positional[1], "action step result-attr"),
          resultValue:
            resultValueExpr === undefined
              ? positional[2] === undefined
                ? undefined
                : sexprValue(positional[2])
              : sexprValue(resultValueExpr),
          delaySeconds: optionalNumber(
            listItem(form, "delay-seconds"),
            "action step delay-seconds",
          ),
        }).filter(([, value]) => value !== undefined),
      ),
    };
  }

  if (head === "branch") {
    const where = listItem(form, "where");
    const positional = sexprTail(form).filter((entry) => entry._tag !== "List");
    return {
      type: "branch",
      config: Object.fromEntries(
        Object.entries({
          where:
            where === undefined
              ? positional[0] === undefined
                ? undefined
                : sexprValue(positional[0])
              : sexprValue(where),
          ifTrue:
            optionalString(listItem(form, "if-true"), "branch step if-true") ??
            optionalString(positional[1], "branch step if-true"),
          ifFalse:
            optionalString(listItem(form, "if-false"), "branch step if-false") ??
            optionalString(positional[2], "branch step if-false"),
          subjectVar:
            optionalString(listItem(form, "subject-var"), "branch step subject-var") ??
            optionalString(positional[3], "branch step subject-var"),
        }).filter(([, value]) => value !== undefined),
      ),
    };
  }

  if (head === "wait" || head === "delay" || head === "pause") {
    const positional = sexprTail(form).filter((entry) => entry._tag !== "List");
    const seconds =
      optionalNumber(listItem(form, "seconds"), "wait step seconds") ??
      optionalNumber(positional[0], "wait step seconds");
    return {
      type: "wait",
      config: Object.fromEntries(
        Object.entries({ seconds }).filter(([, value]) => value !== undefined),
      ),
    };
  }

  throw new Error(`unsupported compact step: ${head ?? "<unknown>"}`);
}

function parseFormaAccount(form: SExpr): Record<string, unknown> {
  const positional = sexprTail(form).filter((entry) => entry._tag !== "List");
  return {
    slug:
      optionalString(listItem(form, "slug"), "account slug") ??
      optionalString(positional[0], "account slug"),
    name:
      optionalString(listItem(form, "name"), "account name") ??
      optionalString(positional[1], "account name"),
    kind:
      optionalString(listItem(form, "kind"), "account kind") ??
      optionalString(positional[2], "account kind"),
  };
}

function parseFormaAttribute(form: SExpr): Record<string, unknown> {
  const [nameExpr] = sexprTail(form);
  if (nameExpr === undefined) throw new Error("attribute missing name");
  const positional = positionalArgs(form);
  const positionalValueType = optionalString(positional[0], "attribute value-type");
  const positionalSecond = optionalString(positional[1], "attribute cardinality or description");
  const positionalCardinality = CARDINALITIES.has(String(positionalSecond))
    ? positionalSecond
    : undefined;
  const positionalDescription = positionalCardinality === undefined
    ? positionalSecond
    : optionalString(positional[2], "attribute description");
  const attr: Record<string, unknown> = {
    name: scalarString(nameExpr, "attribute name"),
    valueType:
      optionalString(listItem(form, "value-type"), "attribute value-type") ??
      positionalValueType,
    cardinality:
      optionalString(listItem(form, "cardinality"), "attribute cardinality") ??
      positionalCardinality ??
      (positionalValueType === undefined ? undefined : "one"),
    description:
      optionalString(listItem(form, "description") ?? listItem(form, "help"), "attribute description") ??
      positionalDescription,
  };
  return Object.fromEntries(
    Object.entries(attr).filter(([, value]) => value !== undefined),
  );
}

function parseFormaEntityType(form: SExpr): Record<string, unknown> {
  const [nameExpr] = sexprTail(form);
  if (nameExpr === undefined) throw new Error("entity-type missing name");
  const positional = positionalArgs(form);
  const positionalAttributes =
    positional[0]?._tag === "Vector"
      ? vectorStrings(positional[0], "entity-type attributes")
      : undefined;
  const entityType: Record<string, unknown> = {
    name: scalarString(nameExpr, "entity-type name"),
    attributes:
      vectorStrings(listItem(form, "attributes"), "entity-type attributes") ??
      positionalAttributes ??
      [],
    description:
      optionalString(listItem(form, "description") ?? listItem(form, "help"), "entity-type description") ??
      optionalString(
        positionalAttributes === undefined ? positional[0] : positional[1],
        "entity-type description",
      ),
  };
  return Object.fromEntries(
    Object.entries(entityType).filter(([, value]) => value !== undefined),
  );
}

function parseInlineEntityAttr(form: SExpr): {
  name: string;
  definition?: Record<string, unknown>;
} {
  const [nameExpr] = sexprTail(form);
  if (nameExpr === undefined) throw new Error("entity attr missing name");
  const name = scalarString(nameExpr, "entity attr name");
  const positional = positionalArgs(form);
  const positionalValueType = optionalString(positional[0], "entity attr value-type");
  const positionalSecond = optionalString(positional[1], "entity attr cardinality or description");
  const positionalCardinality = CARDINALITIES.has(String(positionalSecond))
    ? positionalSecond
    : undefined;
  const positionalDescription = positionalCardinality === undefined
    ? positionalSecond
    : optionalString(positional[2], "entity attr description");
  const valueType =
    optionalString(listItem(form, "value-type"), "entity attr value-type") ??
    positionalValueType;
  const cardinality =
    optionalString(listItem(form, "cardinality"), "entity attr cardinality") ??
    positionalCardinality;
  const description =
    optionalString(listItem(form, "description") ?? listItem(form, "help"), "entity attr description") ??
    positionalDescription;
  if (valueType === undefined && cardinality === undefined && description === undefined) {
    return { name };
  }
  return {
    name,
    definition: Object.fromEntries(
      Object.entries({
        name,
        valueType,
        cardinality: cardinality ?? "one",
        description,
      }).filter(([, value]) => value !== undefined),
    ),
  };
}

function parseFormaEntity(form: SExpr): {
  attributes: Record<string, unknown>[];
  entityType: Record<string, unknown>;
  forms: Record<string, unknown>[];
  flows: Record<string, unknown>[];
  requirements: Record<string, unknown>[];
  actions: Record<string, unknown>[];
} {
  const [nameExpr] = sexprTail(form);
  if (nameExpr === undefined) throw new Error("entity missing name");
  const name = scalarString(nameExpr, "entity name");
  const positional = positionalArgs(form);
  const positionalAttributesExpr = positional.find((entry) => entry._tag === "Vector");
  const positionalAttributes = vectorStrings(positionalAttributesExpr, "entity attributes") ?? [];
  const positionalDescriptionExpr = positional.find((entry) => entry._tag !== "Vector");
  const attrs = groupedListItems(form, ["attr", "attribute"], "attributes")
    .map(parseInlineEntityAttr);
  const attributeNames = [
    ...positionalAttributes,
    ...attrs.map((attr) => attr.name),
  ];
  const definitions = attrs
    .map((attr) => attr.definition)
    .filter((attr): attr is Record<string, unknown> => attr !== undefined);
  const formResources = groupedListItems(form, ["form"], "forms").map(parseFormaFormResource);
  const flows = groupedListItems(form, ["flow"], "flows").map((entry) => parseFormaFlow(entry, name));
  const actions = groupedListItems(form, ["action"], "actions").map((entry) => ({
    appliesTo: name,
    ...parseFormaAction(entry, name),
  }));
  const entityType: Record<string, unknown> = {
    name,
    attributes: attributeNames,
    description:
      optionalString(listItem(form, "description") ?? listItem(form, "help"), "entity description") ??
      optionalString(positionalDescriptionExpr, "entity description"),
  };
  return {
    attributes: definitions,
    entityType: Object.fromEntries(
      Object.entries(entityType).filter(([, value]) => value !== undefined),
    ),
    forms: formResources.map((resource) => resource.form),
    flows,
    requirements: [
      ...formResources.flatMap((resource) => resource.requirements),
      ...groupedListItems(form, ["requirement", "requires"], "requirements").map((entry) =>
        parseFormaRequirement(entry)
      ),
    ],
    actions,
  };
}

function parseFormaFormResource(form: SExpr): {
  form: Record<string, unknown>;
  requirements: Record<string, unknown>[];
} {
  const parsedForm = parseFormaForm(form);
  const formName = parsedForm.form;
  if (typeof formName !== "string") {
    return { form: parsedForm, requirements: [] };
  }
  return {
    form: parsedForm,
    requirements: [
      ...groupedListItems(form, ["requires", "requirement"], "requirements").map((entry) =>
        parseFormaRequirement(entry, formName)
      ),
    ],
  };
}

function parseFormaForm(form: SExpr): Record<string, unknown> {
  const [nameExpr] = sexprTail(form);
  if (nameExpr === undefined) throw new Error("form missing name");
  const positional = positionalArgs(form);
  const parsed: Record<string, unknown> = {
    form: scalarString(nameExpr, "form name"),
    title:
      optionalString(listItem(form, "title"), "form title") ??
      optionalString(positional[0], "form title"),
    description:
      optionalString(listItem(form, "description") ?? listItem(form, "help"), "form description") ??
      optionalString(positional[1], "form description"),
    fields: groupedListItems(form, ["field"], "fields").map(parseFormaField),
  };
  return Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  );
}

function parseFormaFlow(form: SExpr, defaultSubjectType?: string): Record<string, unknown> {
  const [nameExpr] = sexprTail(form);
  if (nameExpr === undefined) throw new Error("flow missing name");
  const positional = positionalArgs(form);
  const explicitSubjectType = optionalString(listItem(form, "subject-type"), "flow subject-type");
  const positionalSubjectType =
    defaultSubjectType === undefined && explicitSubjectType === undefined && positional.length >= 4
      ? optionalString(positional[0], "flow subject-type")
      : undefined;
  const metadataOffset = positionalSubjectType === undefined ? 0 : 1;
  const positionalTitle = optionalString(positional[metadataOffset], "flow title");
  const positionalDescription = optionalString(positional[metadataOffset + 1], "flow description");
  const positionalStart =
    positionalTitle !== undefined && positionalDescription !== undefined
      ? optionalString(positional[metadataOffset + 2], "flow start")
      : undefined;
  const flow: Record<string, unknown> = {
    name: scalarString(nameExpr, "flow name"),
    title:
      optionalString(listItem(form, "title"), "flow title") ??
      positionalTitle,
    description:
      optionalString(listItem(form, "description") ?? listItem(form, "help"), "flow description") ??
      positionalDescription,
    subjectType: explicitSubjectType ?? defaultSubjectType ?? positionalSubjectType,
    startStepId: optionalString(listItem(form, "start"), "flow start") ?? positionalStart,
    steps: flowStepForms(form).map((entry) =>
      sexprHead(entry) === "step"
        ? parseFormaStep(entry)
        : parseDirectCompactStep(entry),
    ),
  };
  return Object.fromEntries(
    Object.entries(flow).filter(([, value]) => value !== undefined),
  );
}

function parseFormaRequirement(form: SExpr, defaultForm?: string): Record<string, unknown> {
  const positionalValues = sexprTail(form).filter((entry) => entry._tag !== "List");
  const [formExpr] = positionalValues;
  if (formExpr === undefined && defaultForm === undefined) throw new Error("requirement missing form");
  const positional = defaultForm === undefined ? positionalValues.slice(1) : positionalValues;
  const explicitScope =
    optionalString(listItem(form, "scope"), "requirement scope") ??
    optionalString(listItem(form, "scope-attr"), "requirement scope-attr");
  const valueOffset = explicitScope === undefined ? 1 : 0;
  const positionalValidity =
    positional[valueOffset]?._tag === "Num"
      ? optionalNumber(positional[valueOffset], "requirement validity-days")
      : undefined;
  const requirement: Record<string, unknown> = {
    form: defaultForm ?? scalarString(formExpr!, "requirement form"),
    scopeAttr:
      explicitScope ??
      optionalString(positional[0], "requirement scope-attr"),
    validityDays:
      optionalNumber(listItem(form, "validity-days"), "requirement validity-days") ??
      optionalNumber(listItem(form, "valid-for"), "requirement valid-for") ??
      positionalValidity,
    description:
      optionalString(
        listItem(form, "description") ?? listItem(form, "help"),
        "requirement description",
      ) ??
      optionalString(
        positionalValidity === undefined
          ? positional[valueOffset]
          : positional[valueOffset + 1],
        "requirement description",
      ),
  };
  const guard = listItems(form, "guard")[0] ?? listItems(form, "when")[0];
  if (guard !== undefined) requirement.guard = parseRequirementGuard(guard);
  return Object.fromEntries(
    Object.entries(requirement).filter(([, value]) => value !== undefined),
  );
}

function parseAttributeValuePair(form: SExpr, context: string): [string, unknown] {
  const [firstExpr, secondExpr] = sexprTail(form);
  if (firstExpr === undefined) {
    throw sourceError(`${context} must include attribute and value`, form);
  }

  if (firstExpr._tag === "Vector") {
    if (firstExpr.items.length !== 2) {
      throw sourceError(`${context} vector must include attribute and value`, firstExpr);
    }
    return [
      scalarString(firstExpr.items[0]!, `${context} attribute`),
      sexprValue(firstExpr.items[1]!),
    ];
  }

  if (firstExpr._tag === "Map") {
    const value = record(sexprValue(firstExpr));
    const attr = ownValue(value, ["attribute", "attr", "a"]);
    const mappedValue = ownValue(value, ["value", "v"]);
    if (
      typeof attr !== "string" ||
      (!Object.prototype.hasOwnProperty.call(value, "value") &&
        !Object.prototype.hasOwnProperty.call(value, "v"))
    ) {
      throw sourceError(`${context} map must include attribute and value`, firstExpr);
    }
    return [attr, mappedValue];
  }

  if (secondExpr === undefined) {
    throw sourceError(`${context} must include attribute and value`, form);
  }
  return [scalarString(firstExpr, `${context} attribute`), sexprValue(secondExpr)];
}

function parseRequirementGuard(guard: SExpr): [string, unknown] {
  return parseAttributeValuePair(guard, "requirement guard");
}

function parseFormaAction(form: SExpr, defaultAppliesTo?: string): Record<string, unknown> {
  const [nameExpr] = sexprTail(form);
  if (nameExpr === undefined) throw new Error("action missing name");
  const positional = positionalArgs(form);
  const positionalAppliesTo = defaultAppliesTo === undefined
    ? optionalString(positional[0], "action applies-to")
    : undefined;
  const positionalLabel = defaultAppliesTo === undefined
    ? optionalString(positional[1], "action label")
    : optionalString(positional[0], "action label");
  const positionalDescription = defaultAppliesTo === undefined
    ? optionalString(positional[2], "action description")
    : optionalString(positional[1], "action description");
  const asserts = Object.fromEntries(
    groupedListItems(form, ["assert"], "asserts").map((entry) => {
      const [attr, value] = parseAttributeValuePair(entry, "action assert");
      return [attr, value];
    }),
  );
  const action: Record<string, unknown> = {
    name: scalarString(nameExpr, "action name"),
    label: optionalString(listItem(form, "label"), "action label") ?? positionalLabel,
    description:
      optionalString(listItem(form, "description") ?? listItem(form, "help"), "action description") ??
      positionalDescription,
    appliesTo: optionalString(listItem(form, "applies-to"), "action applies-to") ?? positionalAppliesTo,
    fields: groupedListItems(form, ["field"], "fields").map(parseFormaActionField),
    asserts,
  };
  const opensForm = parseActionOpensForm(form);
  if (opensForm !== undefined) action.opensForm = opensForm;
  return Object.fromEntries(
    Object.entries(action).filter(([, value]) => {
      if (Array.isArray(value) && value.length === 0) return false;
      if (typeof value === "object" && value !== null && Object.keys(value).length === 0) {
        return false;
      }
      return value !== undefined;
    }),
  );
}

function parseActionOpensForm(form: SExpr): unknown {
  const entry = listItems(form, "opens-form")[0];
  if (entry === undefined) return undefined;
  const [formExpr] = sexprTail(entry);
  if (formExpr === undefined) throw new Error("action opens-form missing form");
  if (formExpr._tag === "Map") return sexprValue(formExpr);
  const positional = positionalArgs(entry);
  return Object.fromEntries(
    Object.entries({
      form: scalarString(formExpr, "action opens-form"),
      scope:
        optionalString(listItem(entry, "scope"), "action opens-form scope") ??
        optionalString(positional[0], "action opens-form scope"),
    }).filter(([, value]) => value !== undefined),
  );
}

function accountConfigFromFormaExpressions(rawExpressions: readonly SExpr[]): Record<string, unknown> {
  const expressions = unwrapAccountConfigExpressions(rawExpressions);
  const unknown = expressions
    .map((expr) => sexprHead(expr))
    .filter(
      (head): head is string =>
        head !== undefined && !isAccountConfigFormHead(head),
    );
  if (unknown.length > 0) {
    throw new Error(unknown.map(unknownAccountConfigFormMessage).join("; "));
  }
  const accountForms = expressions.filter((expr) => {
    const head = sexprHead(expr);
    return head === "account" || head === "tenant";
  });
  const entities = sectionEntries(expressions, "entity").map(parseFormaEntity);
  const forms = sectionEntries(expressions, "form").map(parseFormaFormResource);
  return {
    account:
      accountForms.length === 0
        ? {}
        : parseFormaAccount(accountForms[accountForms.length - 1]!),
    attributes: [
      ...sectionEntries(expressions, "attribute").map(parseFormaAttribute),
      ...sectionEntries(expressions, "attr").map(parseFormaAttribute),
      ...entities.flatMap((entity) => entity.attributes),
    ],
    entityTypes: [
      ...sectionEntries(expressions, "entity-type").map(parseFormaEntityType),
      ...entities.map((entity) => entity.entityType),
    ],
    forms: [
      ...forms.map((resource) => resource.form),
      ...entities.flatMap((entity) => entity.forms),
    ],
    flows: [
      ...sectionEntries(expressions, "flow").map((entry) => parseFormaFlow(entry)),
      ...entities.flatMap((entity) => entity.flows),
    ],
    requirements: [
      ...forms.flatMap((resource) => resource.requirements),
      ...sectionEntries(expressions, "requirement").map((entry) => parseFormaRequirement(entry)),
      ...sectionEntries(expressions, "requires").map((entry) => parseFormaRequirement(entry)),
      ...entities.flatMap((entity) => entity.requirements),
    ],
    actions: [
      ...sectionEntries(expressions, "action").map((entry) => parseFormaAction(entry)),
      ...entities.flatMap((entity) => entity.actions),
    ],
  };
}

export function parseFormaAccountConfigSource(source: string): FormaAccountConfigParseResult {
  const parsed = parse(source);
  if (parsed.errors.length > 0) {
    return {
      config: null,
      diagnostics: parsed.errors.map((error) =>
        diagnosticAtLoc(error.message, error.loc),
      ),
    };
  }

  try {
    const expressions = unwrapAccountConfigExpressions(toSExprMany(parsed.redTree));
    const unknown = expressions.filter((expr) => {
      const head = sexprHead(expr);
      return head !== undefined && !isAccountConfigFormHead(head);
    });
    if (unknown.length > 0) {
      return {
        config: null,
        diagnostics: unknown.map((expr) =>
          diagnostic(unknownAccountConfigFormMessage(sexprHead(expr)), expr),
        ),
      };
    }
    const config = accountConfigFromFormaExpressions(expressions);
    const locations = collectResourceLocations(expressions);
    const ambiguous = collectAmbiguousSingletonDiagnostics(expressions);
    return {
      config,
      diagnostics: [
        ...ambiguous,
        ...attachSourceLocations(validateAccountConfig(config), locations),
      ],
    };
  } catch (error) {
    if (error instanceof FormaSourceError) {
      return {
        config: null,
        diagnostics: [diagnosticAtLoc(error.message, error.loc, error.path)],
      };
    }
    return {
      config: null,
      diagnostics: [diagnostic(error instanceof Error ? error.message : String(error))],
    };
  }
}

export function accountConfigFromFormaSource(source: string): Record<string, unknown> {
  const parsed = parseFormaAccountConfigSource(source);
  if (parsed.config === null || parsed.diagnostics.length > 0) {
    throw new Error(parsed.diagnostics[0]?.message ?? "failed to parse Forma source");
  }
  return parsed.config;
}

export function validateFormaAccountConfigSource(source: string): string[] {
  const parsed = parseFormaAccountConfigSource(source);
  if (parsed.config === null || parsed.diagnostics.length > 0) {
    return parsed.diagnostics.map((entry) => entry.message);
  }
  return validateAccountConfig(parsed.config);
}

function formaValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(formaValue).join(" ")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => `${JSON.stringify(key)} ${formaValue(entry)}`)
      .join(" ")}}`;
  }
  return "null";
}

function formaLine(head: string, name: unknown, parts: string[]): string {
  return `(${head} ${formaValue(String(name))}${parts.length === 0 ? "" : ` ${parts.join(" ")}`})`;
}

function indentForma(part: string): string {
  return part
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function formaBlock(
  head: string,
  name: unknown,
  parts: string[],
  headParts: string[] = [],
): string {
  const prefix = [head, formaValue(String(name)), ...headParts].join(" ");
  if (parts.length === 0) return `(${prefix})`;
  return `(${prefix}\n${parts.map(indentForma).join("\n")}\n)`;
}

function optionalPart(key: string, value: unknown): string | undefined {
  return value === undefined ? undefined : `(${key} ${formaValue(value)})`;
}

function present(parts: readonly (string | undefined)[]): string[] {
  return parts.filter((part): part is string => part !== undefined);
}

function emitFormaField(raw: unknown): string {
  const field = record(raw);
  const compactType = typeof field.type === "string" ? formaValue(field.type) : undefined;
  const compactLabel = typeof field.label === "string" ? formaValue(field.label) : undefined;
  const compactOptions =
    Array.isArray(field.options) && compactType !== undefined && compactLabel !== undefined
      ? formaValue(field.options)
      : undefined;
  const compactDescription =
    compactType !== undefined && compactLabel !== undefined && typeof field.description === "string"
      ? formaValue(field.description)
      : undefined;
  return formaLine(
    "field",
    field.name,
    present([
      compactType,
      compactLabel,
      compactOptions,
      compactDescription,
      field.required === true ? "(required)" : optionalPart("required", field.required),
      field.pii === true ? "(pii)" : optionalPart("pii", field.pii),
      compactOptions === undefined ? optionalPart("options", field.options) : undefined,
      optionalPart("default", field.defaultValue),
      compactDescription === undefined ? optionalPart("description", field.description) : undefined,
    ]),
  );
}

function emitFormaActionField(raw: unknown): string {
  const field = record(raw);
  const compactType = typeof field.type === "string" ? formaValue(field.type) : undefined;
  const compactLabel = typeof field.label === "string" ? formaValue(field.label) : undefined;
  const compactOptions =
    Array.isArray(field.options) && compactType !== undefined && compactLabel !== undefined
      ? formaValue(field.options)
      : undefined;
  const compactDescription =
    compactType !== undefined && compactLabel !== undefined && typeof field.description === "string"
      ? formaValue(field.description)
      : undefined;
  return formaLine(
    "field",
    field.name,
    present([
      compactType,
      compactLabel,
      compactOptions,
      compactDescription,
      field.required === true ? "(required)" : optionalPart("required", field.required),
      compactOptions === undefined ? optionalPart("options", field.options) : undefined,
      optionalPart("default", field.defaultValue),
      compactDescription === undefined ? optionalPart("description", field.description) : undefined,
      optionalPart("pii", field.pii),
    ]),
  );
}

function emitFormaAttribute(head: "attribute" | "attr", raw: unknown): string {
  const attr = record(raw);
  const compactValueType =
    typeof attr.valueType === "string" ? formaValue(attr.valueType) : undefined;
  const compactCardinality =
    typeof attr.cardinality === "string" && attr.cardinality !== "one"
      ? formaValue(attr.cardinality)
      : undefined;
  const compactDescription =
    typeof attr.description === "string" ? formaValue(attr.description) : undefined;
  return formaLine(
    head,
    attr.name,
    present([
      compactValueType,
      compactCardinality,
      compactDescription,
    ]),
  );
}

function emitFormaEntityType(
  raw: unknown,
  attributeDefinitions: Map<string, Record<string, unknown>>,
  emittedAttributes: Set<string>,
  flows: readonly unknown[] = [],
  actions: readonly unknown[] = [],
): string {
  const entityType = record(raw);
  const entityName = typeof entityType.name === "string" ? entityType.name : undefined;
  const attrs = Array.isArray(entityType.attributes)
    ? entityType.attributes.filter((attr): attr is string => typeof attr === "string")
    : [];
  const canRenderAttributeVector = attrs.length > 0 && attrs.every((attr) => {
    const definition = attributeDefinitions.get(attr);
    return definition === undefined || attr === "name" || attr === "type" || emittedAttributes.has(attr);
  });
  return formaBlock(
    "entity",
    entityType.name,
    present([
      ...(canRenderAttributeVector
        ? []
        : attrs.map((attr) => {
            const definition = attributeDefinitions.get(attr);
            if (definition === undefined || attr === "name" || attr === "type") {
              return formaLine("attr", attr, []);
            }
            if (emittedAttributes.has(attr)) return formaLine("attr", attr, []);
            emittedAttributes.add(attr);
            return emitFormaAttribute("attr", definition);
          })),
      ...flows.map((flow) => emitFormaFlow(flow, entityName)),
      ...actions.map((action) => emitFormaAction(action, entityName)),
    ]),
    present([
      canRenderAttributeVector ? formaValue(attrs) : undefined,
      typeof entityType.description === "string"
        ? formaValue(entityType.description)
        : undefined,
    ]),
  );
}

function emitFormaRequirement(raw: unknown, options: { nested?: boolean } = {}): string {
  const requirement = record(raw);
  const compactScope = typeof requirement.scopeAttr === "string";
  const compactValidity = compactScope && typeof requirement.validityDays === "number";
  const compactDescription =
    compactScope && typeof requirement.description === "string";
  const parts = present([
      compactScope ? formaValue(requirement.scopeAttr) : optionalPart("scope-attr", requirement.scopeAttr),
      compactValidity ? formaValue(requirement.validityDays) : optionalPart("validity-days", requirement.validityDays),
      compactDescription ? formaValue(requirement.description) : undefined,
      Array.isArray(requirement.guard) && requirement.guard.length === 2
        ? `(when ${formaValue(requirement.guard[0])} ${formaValue(requirement.guard[1])})`
        : undefined,
      compactDescription ? undefined : optionalPart("description", requirement.description),
    ]);
  if (options.nested === true) {
    return inlineFormaList("requires", undefined, parts);
  }
  return formaLine("requirement", requirement.form, parts);
}

function emitActionOpensForm(raw: unknown): string | undefined {
  const opensForm = record(raw);
  if (typeof opensForm.form !== "string") return undefined;
  return inlineFormaList(
    "opens-form",
    formaValue(opensForm.form),
    present([
      typeof opensForm.scope === "string" ? formaValue(opensForm.scope) : undefined,
    ]),
  );
}

function emitFormaAction(raw: unknown, defaultAppliesTo?: string): string {
  const action = record(raw);
  const asserts = record(action.asserts);
  const compactAppliesTo =
    typeof action.appliesTo === "string" && action.appliesTo !== defaultAppliesTo;
  const compactLabel =
    (compactAppliesTo || defaultAppliesTo !== undefined) && typeof action.label === "string";
  const compactDescription =
    compactLabel && typeof action.description === "string";
  const appliesToPart =
    action.appliesTo === defaultAppliesTo
      ? undefined
      : compactAppliesTo
        ? formaValue(action.appliesTo)
        : optionalPart("applies-to", action.appliesTo);
  return formaLine(
    "action",
    action.name,
    present([
      appliesToPart,
      compactLabel ? formaValue(action.label) : optionalPart("label", action.label),
      compactDescription ? formaValue(action.description) : optionalPart("description", action.description),
      ...(((action.fields as unknown[] | undefined) ?? []).map(emitFormaActionField)),
      ...Object.entries(asserts).map(
        ([attr, value]) => `(assert ${formaValue(attr)} ${formaValue(value)})`,
      ),
      emitActionOpensForm(action.opensForm),
    ]),
  );
}

function emitFormaFlow(raw: unknown, defaultSubjectType?: string): string {
  const flow = record(raw);
  const compactTitle = typeof flow.title === "string";
  const compactDescription = compactTitle && typeof flow.description === "string";
  const compactStart = compactDescription && typeof flow.startStepId === "string";
  const compactTopLevelSubject =
    defaultSubjectType === undefined && compactStart && typeof flow.subjectType === "string";
  return formaBlock(
    "flow",
    flow.name,
    present([
      flow.subjectType === defaultSubjectType || compactTopLevelSubject
        ? undefined
        : optionalPart("subject-type", flow.subjectType),
      compactStart ? undefined : optionalPart("start", flow.startStepId),
      compactDescription ? undefined : optionalPart("description", flow.description),
      ...(((flow.steps as unknown[] | undefined) ?? []).map(emitFormaFlowStep)),
    ]),
    present([
      compactTopLevelSubject ? formaValue(flow.subjectType) : undefined,
      compactTitle ? formaValue(flow.title) : undefined,
      compactDescription ? formaValue(flow.description) : undefined,
      compactStart ? formaValue(flow.startStepId) : undefined,
    ]),
  );
}

function emitFormaFlowStep(raw: unknown): string {
  const step = record(raw);
  const compact = emitCompactStep(step);
  if (compact === undefined || typeof step.id !== "string") {
    return emitFormaStep(raw);
  }
  if (step.type === "done" && step.id === "done" && step.next === undefined) {
    return compact;
  }
  const withoutClose = compact.endsWith(")") ? compact.slice(0, -1) : compact;
  const headEnd = withoutClose.indexOf(" ");
  const base =
    headEnd === -1
      ? `${withoutClose} ${formaValue(step.id)}`
      : `${withoutClose.slice(0, headEnd)} ${formaValue(step.id)} ${withoutClose.slice(headEnd + 1)}`;
  return `${base}${typeof step.next === "string" ? ` (next ${formaValue(step.next)})` : ""})`;
}

function emitFormaStep(raw: unknown): string {
  const step = record(raw);
  const compact = emitCompactStep(step);
  const parts =
    compact === undefined
      ? present([
          optionalPart("type", step.type),
          optionalPart("config", step.config),
          optionalPart("next", step.next),
        ])
      : present([
          compact,
          typeof step.next === "string" ? formaValue(step.next) : optionalPart("next", step.next),
        ]);
  return formaLine(
    "step",
    step.id,
    parts,
  );
}

function emitCompactStep(step: Record<string, unknown>): string | undefined {
  const config = record(step.config);
  if (step.type === "collect" && typeof config.form === "string") {
    const compactScope =
      typeof config.scopeFrom === "string" ? formaValue(config.scopeFrom) : undefined;
    return inlineFormaList(
      "collect",
      formaValue(config.form),
      present([
        compactScope ?? optionalPart("scope-from", config.scopeFrom),
        optionalPart("reminder-seconds", config.reminderSeconds),
        optionalPart("escalate-seconds", config.escalateSeconds),
        optionalPart("expire-seconds", config.expireSeconds),
      ]),
    );
  }
  if (step.type === "branch") {
    if (
      config.where !== undefined &&
      typeof config.ifTrue === "string" &&
      typeof config.ifFalse === "string"
    ) {
      return inlineFormaList(
        "branch",
        formaValue(config.where),
        present([
          formaValue(config.ifTrue),
          formaValue(config.ifFalse),
          typeof config.subjectVar === "string"
            ? formaValue(config.subjectVar)
            : optionalPart("subject-var", config.subjectVar),
        ]),
      );
    }
    return inlineFormaList(
      "branch",
      undefined,
      present([
        optionalPart("where", config.where),
        optionalPart("if-true", config.ifTrue),
        optionalPart("if-false", config.ifFalse),
        optionalPart("subject-var", config.subjectVar),
      ]),
    );
  }
  if (step.type === "assert" && typeof config.a === "string" && "v" in config) {
    return inlineFormaList("assert", `${formaValue(config.a)} ${formaValue(config.v)}`, []);
  }
  if (step.type === "wait") {
    return inlineFormaList(
      "wait",
      typeof config.seconds === "number" ? formaValue(config.seconds) : undefined,
      present([
        typeof config.seconds === "number" ? undefined : optionalPart("seconds", config.seconds),
      ]),
    );
  }
  if (step.type === "action") {
    const compactLabel =
      typeof config.label === "string" ? formaValue(config.label) : undefined;
    const compactResultAttr =
      compactLabel !== undefined && typeof config.resultAttr === "string"
        ? formaValue(config.resultAttr)
        : undefined;
    const compactResultValue =
      compactResultAttr !== undefined && "resultValue" in config
        ? formaValue(config.resultValue)
        : undefined;
    return inlineFormaList(
      "action",
      compactLabel,
      present([
        compactLabel === undefined ? optionalPart("label", config.label) : undefined,
        compactResultAttr ?? optionalPart("result-attr", config.resultAttr),
        compactResultValue ?? optionalPart("result-value", config.resultValue),
        optionalPart("delay-seconds", config.delaySeconds),
      ]),
    );
  }
  if (step.type === "notify" && typeof config.message === "string") {
    const compactChannel =
      typeof config.channel === "string" ? formaValue(config.channel) : undefined;
    const compactTo =
      compactChannel !== undefined && typeof config.to === "string"
        ? formaValue(config.to)
        : undefined;
    const compactTemplate =
      compactTo !== undefined && typeof config.template === "string"
        ? formaValue(config.template)
        : undefined;
    return inlineFormaList(
      "notify",
      formaValue(config.message),
      present([
        compactChannel ?? optionalPart("channel", config.channel),
        compactTo ?? optionalPart("to", config.to),
        compactTemplate ?? optionalPart("template", config.template),
        optionalPart("delay-seconds", config.delaySeconds),
      ]),
    );
  }
  if (step.type === "done") return "(done)";
  return undefined;
}

function inlineFormaList(
  head: string,
  first: string | undefined,
  parts: readonly string[],
): string {
  return `(${[head, first, ...parts].filter((part) => part !== undefined && part !== "").join(" ")})`;
}

export function accountConfigToFormaSource(config: unknown): string {
  const lines: string[] = [];
  const metadata = accountMetadata(config);
  lines.push(
    inlineFormaList(
      "tenant",
      formaValue(metadata.slug),
      [formaValue(metadata.name), formaValue(metadata.kind)],
    ),
  );

  const attributes = section(config, "attributes", []);
  const attributeDefinitions = new Map(
    attributes
      .map((raw) => record(raw))
      .filter((attr): attr is Record<string, unknown> => typeof attr.name === "string")
      .map((attr) => [String(attr.name), attr]),
  );
  const emittedAttributes = new Set<string>();
  const flows = section(config, "flows", []);
  const actions = section(config, "actions", []);
  const requirements = section(config, "requirements", []);
  const flowsBySubject = new Map<string, unknown[]>();
  for (const flow of flows) {
    const subjectType = record(flow).subjectType;
    if (typeof subjectType !== "string") continue;
    const bucket = flowsBySubject.get(subjectType) ?? [];
    bucket.push(flow);
    flowsBySubject.set(subjectType, bucket);
  }
  const actionsByAppliesTo = new Map<string, unknown[]>();
  for (const action of actions) {
    const appliesTo = record(action).appliesTo;
    if (typeof appliesTo !== "string") continue;
    const bucket = actionsByAppliesTo.get(appliesTo) ?? [];
    bucket.push(action);
    actionsByAppliesTo.set(appliesTo, bucket);
  }
  const emittedFlows = new Set<unknown>();
  const emittedActions = new Set<unknown>();
  const emittedRequirements = new Set<unknown>();
  const requirementsByForm = new Map<string, unknown[]>();
  for (const requirement of requirements) {
    const form = record(requirement).form;
    if (typeof form !== "string") continue;
    const bucket = requirementsByForm.get(form) ?? [];
    bucket.push(requirement);
    requirementsByForm.set(form, bucket);
  }

  for (const raw of section(config, "entityTypes", [])) {
    const name = record(raw).name;
    const entityFlows = typeof name === "string" ? flowsBySubject.get(name) ?? [] : [];
    const entityActions = typeof name === "string" ? actionsByAppliesTo.get(name) ?? [] : [];
    for (const flow of entityFlows) emittedFlows.add(flow);
    for (const action of entityActions) emittedActions.add(action);
    lines.push(
      emitFormaEntityType(
        raw,
        attributeDefinitions,
        emittedAttributes,
        entityFlows,
        entityActions,
      ),
    );
  }

  for (const raw of attributes) {
    const attr = record(raw);
    if (typeof attr.name === "string" && emittedAttributes.has(attr.name)) continue;
    lines.push(emitFormaAttribute("attr", raw));
  }

  for (const raw of section(config, "forms", [])) {
    const form = record(raw);
    const formName = typeof form.form === "string" ? form.form : undefined;
    const formRequirements = formName === undefined ? [] : requirementsByForm.get(formName) ?? [];
    for (const requirement of formRequirements) emittedRequirements.add(requirement);
    const compactTitle = typeof form.title === "string";
    const compactDescription = compactTitle && typeof form.description === "string";
    lines.push(
      formaBlock(
        "form",
        form.form,
        present([
          compactDescription ? undefined : optionalPart("description", form.description),
          ...(((form.fields as unknown[] | undefined) ?? []).map(emitFormaField)),
          ...formRequirements.map((requirement) =>
            emitFormaRequirement(requirement, { nested: true })
          ),
        ]),
        present([
          compactTitle ? formaValue(form.title) : undefined,
          compactDescription ? formaValue(form.description) : undefined,
        ]),
      ),
    );
  }

  for (const raw of flows) {
    if (emittedFlows.has(raw)) continue;
    lines.push(emitFormaFlow(raw));
  }

  for (const raw of requirements) {
    if (emittedRequirements.has(raw)) continue;
    lines.push(emitFormaRequirement(raw));
  }

  for (const raw of actions) {
    if (emittedActions.has(raw)) continue;
    lines.push(emitFormaAction(raw));
  }

  return `${lines.join("\n")}\n`;
}

function section(config: unknown, key: string, diagnostics: string[]): unknown[] {
  const value = record(config)[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    diagnostics.push(`${key} must be an array`);
    return [];
  }
  return value;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function outlinePlural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}

function outlineArrayCount(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function outlineDetail(
  parts: readonly (string | undefined)[],
  description: unknown,
): string | undefined {
  const detail = [
    ...parts,
    nonEmptyString(description),
  ]
    .filter((part): part is string => part !== undefined)
    .join(" / ");
  return detail === "" ? undefined : detail;
}

function sourceLineFor(source: string | undefined, candidates: readonly string[]): number | undefined {
  if (source === undefined) return undefined;
  const lines = source.split("\n");
  const index = lines.findIndex((line) =>
    candidates.some((candidate) => line.includes(candidate)),
  );
  return index === -1 ? undefined : index + 1;
}

function sourceIndentation(line: string): number {
  const match = /^\s*/.exec(line);
  return match?.[0].length ?? 0;
}

function sourceQuoted(value: string): string {
  return JSON.stringify(value);
}

function sourceTokenCandidates(value: string): string[] {
  const jsonValue = sourceQuoted(value);
  return jsonValue === value ? [value] : [jsonValue, value];
}

function sourceAccountLine(source: string | undefined): number | undefined {
  return sourceLineFor(source, [
    "(tenant ",
    "(account ",
    '"account"',
    "account:",
  ]);
}

function sourceRequirementLine(
  source: string | undefined,
  requirement: Record<string, unknown>,
): number | undefined {
  const formName = nonEmptyString(requirement.form);
  if (source === undefined || formName === undefined) return undefined;
  const jsonName = sourceQuoted(formName);
  const scopeName = nonEmptyString(requirement.scopeAttr);
  const formTokens = sourceTokenCandidates(formName);
  const scopeTokens = scopeName === undefined ? [] : sourceTokenCandidates(scopeName);
  const scopedCandidates = formTokens.flatMap((formToken) =>
    scopeTokens.flatMap((scopeToken) => [
      `(requirement ${formToken} ${scopeToken}`,
      `(requirement ${formToken} (scope ${scopeToken}`,
      `(requirement ${formToken} (scope-attr ${scopeToken}`,
      `(requires ${formToken} ${scopeToken}`,
      `(requires ${formToken} (scope ${scopeToken}`,
      `(requires ${formToken} (scope-attr ${scopeToken}`,
    ]),
  );
  const direct = sourceLineFor(source, [
    ...(scopeTokens.length > 0
      ? scopedCandidates
      : [
          ...formTokens.flatMap((formToken) => [
            `(requirement ${formToken}`,
            `(requires ${formToken}`,
          ]),
          `"form": ${jsonName}`,
          `form: ${formName}`,
        ]),
  ]);
  if (direct !== undefined) return direct;

  const lines = source.split("\n");
  const formIndex = lines.findIndex((line) =>
    formTokens.some((formToken) => line.includes(`(form ${formToken}`)),
  );
  if (formIndex === -1) return undefined;

  const formIndent = sourceIndentation(lines[formIndex]!);
  for (let index = formIndex + 1; index < lines.length; index++) {
    const line = lines[index]!;
    const trimmed = line.trimStart();
    if (trimmed === "") continue;
    if (sourceIndentation(line) <= formIndent) return undefined;
    if (
      scopeTokens.length > 0 &&
      scopeTokens.some((scopeToken) =>
        trimmed.startsWith(`(requires ${scopeToken}`) ||
        trimmed.startsWith(`(requires (scope ${scopeToken}`) ||
        trimmed.startsWith(`(requires (scope-attr ${scopeToken}`) ||
        trimmed.startsWith(`(requirement ${scopeToken}`) ||
        trimmed.startsWith(`(requirement (scope ${scopeToken}`) ||
        trimmed.startsWith(`(requirement (scope-attr ${scopeToken}`),
      )
    ) {
      return index + 1;
    }
    if (
      scopeTokens.length === 0 &&
      (trimmed.startsWith("(requires ") || trimmed.startsWith("(requirement "))
    ) {
      return index + 1;
    }
  }
  return undefined;
}

function sourceResourceLine(
  source: string | undefined,
  kind: ConfigKind,
  name: string,
): number | undefined {
  if (name === "") return undefined;
  const jsonName = sourceQuoted(name);
  if (kind === "attribute") {
    return sourceLineFor(source, [
      `(attribute ${jsonName}`,
      `(attribute ${name}`,
      `(attr ${jsonName}`,
      `(attr ${name}`,
      `"name": ${jsonName}`,
      `name: ${name}`,
    ]);
  }
  if (kind === "entityType") {
    return sourceLineFor(source, [
      `(entity-type ${jsonName}`,
      `(entity-type ${name}`,
      `(entity ${jsonName}`,
      `(entity ${name}`,
      `"name": ${jsonName}`,
      `name: ${name}`,
    ]);
  }
  if (kind === "form") {
    return sourceLineFor(source, [
      `(form ${jsonName}`,
      `(form ${name}`,
      `"form": ${jsonName}`,
      `form: ${name}`,
    ]);
  }
  return sourceLineFor(source, [
    `(${kind} ${jsonName}`,
    `(${kind} ${name}`,
    `"name": ${jsonName}`,
    `name: ${name}`,
  ]);
}

export function accountConfigSourceOutline(
  config: unknown,
  source?: string,
): AccountConfigSourceOutlineGroup[] {
  const rawAccount = record(config).account;
  const accountRecord = rawAccount === undefined ? undefined : record(rawAccount);
  const account = accountRecord === undefined
    ? []
    : [
        {
          name:
            nonEmptyString(accountRecord.slug) ??
            nonEmptyString(accountRecord.name) ??
            "<account>",
          detail: outlineDetail([
            nonEmptyString(accountRecord.name),
            nonEmptyString(accountRecord.kind),
          ], undefined),
          line: sourceAccountLine(source),
        },
      ];
  const attributes = section(config, "attributes", []).map((raw) => {
    const entry = record(raw);
    const name = nonEmptyString(entry.name) ?? "<unnamed>";
    return {
      name,
      detail: outlineDetail([
        nonEmptyString(entry.valueType),
        nonEmptyString(entry.cardinality),
      ], entry.description),
      line: sourceResourceLine(source, "attribute", name === "<unnamed>" ? "" : name),
    };
  });
  const entityTypes = section(config, "entityTypes", []).map((raw) => {
    const entry = record(raw);
    const name = nonEmptyString(entry.name) ?? "<unnamed>";
    return {
      name,
      detail: outlineDetail(
        [outlinePlural(outlineArrayCount(entry.attributes), "attribute")],
        entry.description,
      ),
      line: sourceResourceLine(source, "entityType", name === "<unnamed>" ? "" : name),
    };
  });
  const forms = section(config, "forms", []).map((raw) => {
    const entry = record(raw);
    const name = nonEmptyString(entry.form) ?? "<unnamed>";
    return {
      name,
      detail: outlineDetail(
        [outlinePlural(outlineArrayCount(entry.fields), "field")],
        entry.description,
      ),
      line: sourceResourceLine(source, "form", name === "<unnamed>" ? "" : name),
    };
  });
  const flows = section(config, "flows", []).map((raw) => {
    const entry = record(raw);
    const name = nonEmptyString(entry.name) ?? "<unnamed>";
    return {
      name,
      detail: outlineDetail([
        nonEmptyString(entry.subjectType),
        outlinePlural(outlineArrayCount(entry.steps), "step"),
      ], entry.description),
      line: sourceResourceLine(source, "flow", name === "<unnamed>" ? "" : name),
    };
  });
  const requirements = section(config, "requirements", []).map((raw) => {
    const entry = record(raw);
    const name = nonEmptyString(entry.form) ?? "<unnamed>";
    return {
      name,
      detail: outlineDetail(
        nonEmptyString(entry.scopeAttr) === undefined
          ? []
          : [`scope ${nonEmptyString(entry.scopeAttr)}`],
        entry.description,
      ),
      line: sourceRequirementLine(source, entry),
    };
  });
  const actions = section(config, "actions", []).map((raw) => {
    const entry = record(raw);
    const name = nonEmptyString(entry.name) ?? "<unnamed>";
    return {
      name,
      detail: outlineDetail(
        nonEmptyString(entry.appliesTo) === undefined
          ? []
          : [`on ${nonEmptyString(entry.appliesTo)}`],
        entry.description,
      ),
      line: sourceResourceLine(source, "action", name === "<unnamed>" ? "" : name),
    };
  });

  return [
    { kind: "account", label: "Account", items: account },
    { kind: "attribute", label: "Attributes", items: attributes },
    { kind: "entityType", label: "Types", items: entityTypes },
    { kind: "form", label: "Forms", items: forms },
    { kind: "flow", label: "Flows", items: flows },
    { kind: "requirement", label: "Requirements", items: requirements },
    { kind: "action", label: "Actions", items: actions },
  ];
}

export function accountConfigSourceNavigationItems(
  outline: readonly AccountConfigSourceOutlineGroup[],
  source?: string,
): AccountConfigSourceNavigationItem[] {
  const sourceLines = source?.split("\n");
  return outline.flatMap((group) =>
    group.items
      .filter((item): item is AccountConfigSourceOutlineItem & { line: number } =>
        item.line !== undefined,
      )
      .map((item) => {
        const sourceLine = sourceLines?.[item.line - 1]?.trim();
        return {
          key: `${group.kind}:${item.name}:${item.line}`,
          label: `${group.label}: ${item.name}`,
          line: item.line,
          ...(item.detail === undefined ? {} : { detail: item.detail }),
          ...(sourceLine === undefined || sourceLine === "" ? {} : { sourceLine }),
        };
      }),
  );
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

export function accountConfigResourceGraph(config: unknown): AccountConfigResourceGraphEdge[] {
  const edges: AccountConfigResourceGraphEdge[] = [];

  for (const raw of section(config, "entityTypes", [])) {
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

  for (const raw of section(config, "flows", [])) {
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
      const scopeFrom = nonEmptyString(configRecord.scopeFrom);
      if (scopeFrom !== undefined) {
        addGraphEdge(edges, {
          fromKind: "flow",
          fromName: flow,
          toKind: "attribute",
          toName: scopeFrom,
          relation: "scope",
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

  for (const raw of section(config, "requirements", [])) {
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
    const guard = Array.isArray(entry.guard) ? entry.guard : [];
    const guardAttr = nonEmptyString(guard[0]);
    if (guardAttr !== undefined) {
      addGraphEdge(edges, {
        fromKind: "requirement",
        fromName: form,
        toKind: "attribute",
        toName: guardAttr,
        relation: "guard",
      });
    }
  }

  for (const raw of section(config, "actions", [])) {
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
    const scope = nonEmptyString(opensForm.scope);
    if (scope !== undefined && !scope.startsWith("$arg.")) {
      addGraphEdge(edges, {
        fromKind: "action",
        fromName: action,
        toKind: "attribute",
        toName: scope,
        relation: "scope",
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

function mermaidNodeIdBase(kind: ConfigKind, name: string): string {
  const normalized = `${kind}_${name}`
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized === "" ? kind : normalized;
}

function mermaidLabel(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "<br/>");
}

function mermaidClassName(kind: ConfigKind): string {
  return kind.replace(/[^a-zA-Z0-9_]/g, "_");
}

export function accountConfigResourceGraphToMermaid(
  edges: AccountConfigResourceGraphEdge[],
  options: AccountConfigResourceGraphMermaidOptions = {},
): string {
  const account = options.account;
  const lines = ["graph LR"];
  if (account?.name !== undefined || account?.slug !== undefined) {
    const label = [account.name, account.slug]
      .filter(Boolean)
      .join(" / ")
      .replace(/\n/g, " ");
    lines.push(`  %% account: ${label}`);
  }

  const nodes = new Map<string, { kind: ConfigKind; name: string }>();
  const nodeIdsByKey = new Map<string, string>();
  const occupiedNodeIds = new Set<string>();
  const nodeIdFor = (kind: ConfigKind, name: string) => {
    const key = `${kind}\u0000${name}`;
    const existing = nodeIdsByKey.get(key);
    if (existing !== undefined) return existing;
    const base = mermaidNodeIdBase(kind, name);
    let candidate = base;
    for (let suffix = 2; occupiedNodeIds.has(candidate); suffix++) {
      candidate = `${base}_${suffix}`;
    }
    occupiedNodeIds.add(candidate);
    nodeIdsByKey.set(key, candidate);
    nodes.set(candidate, { kind, name });
    return candidate;
  };

  for (const edge of edges) {
    nodeIdFor(edge.fromKind, edge.fromName);
    nodeIdFor(edge.toKind, edge.toName);
  }

  for (const [id, node] of nodes.entries()) {
    lines.push(
      `  ${id}["${mermaidLabel(`${node.kind}: ${node.name}`)}"]:::${mermaidClassName(node.kind)}`,
    );
  }

  for (const edge of edges) {
    lines.push(
      `  ${nodeIdFor(edge.fromKind, edge.fromName)} -- "${mermaidLabel(edge.relation)}" --> ${nodeIdFor(edge.toKind, edge.toName)}`,
    );
  }

  lines.push("  classDef attribute fill:#ecfeff,stroke:#0891b2,color:#164e63");
  lines.push("  classDef entityType fill:#f0fdf4,stroke:#16a34a,color:#14532d");
  lines.push("  classDef form fill:#fefce8,stroke:#ca8a04,color:#713f12");
  lines.push("  classDef flow fill:#eef2ff,stroke:#4f46e5,color:#312e81");
  lines.push("  classDef requirement fill:#fff7ed,stroke:#ea580c,color:#7c2d12");
  lines.push("  classDef action fill:#fdf2f8,stroke:#db2777,color:#831843");
  return `${lines.join("\n")}\n`;
}

function duplicateCheck(
  entries: readonly unknown[],
  label: string,
  key: string,
  diagnostics: string[],
): Set<string> {
  const seen = new Set<string>();
  for (const entry of entries) {
    const value = record(entry)[key];
    if (typeof value !== "string" || value.trim() === "") {
      diagnostics.push(`${label} entry missing ${key}`);
      continue;
    }
    if (seen.has(value)) diagnostics.push(`duplicate ${label}: ${value}`);
    seen.add(value);
  }
  return seen;
}

function validateFieldOptions(
  field: Record<string, unknown>,
  label: string,
  diagnostics: string[],
) {
  if (field.type === "select") {
    if (!Array.isArray(field.options) || field.options.length === 0) {
      diagnostics.push(`${label} select field must define non-empty options`);
      return;
    }
    for (const option of field.options) {
      if (typeof option !== "string" || option.trim() === "") {
        diagnostics.push(`${label} select field has non-string option`);
        return;
      }
    }
    return;
  }
  if (field.options !== undefined) {
    diagnostics.push(`${label} options are only valid for select fields`);
  }
}

function validateFormFieldAttributeType(
  field: Record<string, unknown>,
  attrTypes: Map<string, string>,
  label: string,
  diagnostics: string[],
) {
  if (typeof field.name !== "string" || typeof field.type !== "string") return;
  const valueType = attrTypes.get(field.name);
  if (valueType === undefined) return;
  const allowedFieldTypes = valueType === "string"
    ? new Set(["string", "select"])
    : valueType === "number"
      ? new Set(["number"])
      : valueType === "boolean"
        ? new Set(["boolean"])
        : valueType === "date"
          ? new Set(["date"])
          : undefined;
  if (allowedFieldTypes === undefined) return;
  if (!allowedFieldTypes.has(field.type)) {
    diagnostics.push(`${label} type must match ${field.name} attribute valueType ${valueType}`);
  }
}

function validateActionFieldAttributeType(
  field: Record<string, unknown>,
  attrTypes: Map<string, string>,
  label: string,
  diagnostics: string[],
) {
  if (typeof field.name !== "string" || typeof field.type !== "string") return;
  const valueType = attrTypes.get(field.name);
  if (valueType === undefined) return;
  const allowedFieldTypes = valueType === "string"
    ? new Set(["string", "select"])
    : valueType === "number"
      ? new Set(["number"])
      : valueType === "boolean"
        ? new Set(["boolean"])
        : valueType === "date" || valueType === "entityRef"
          ? new Set(["string"])
          : undefined;
  if (allowedFieldTypes === undefined) return;
  if (!allowedFieldTypes.has(field.type)) {
    diagnostics.push(`${label} type must match ${field.name} attribute valueType ${valueType}`);
  }
}

function validateFieldFlags(
  field: Record<string, unknown>,
  label: string,
  diagnostics: string[],
) {
  if (field.required !== undefined && typeof field.required !== "boolean") {
    diagnostics.push(`${label} required must be a boolean`);
  }
  if (field.pii !== undefined && typeof field.pii !== "boolean") {
    diagnostics.push(`${label} pii must be a boolean`);
  }
  if (field.description !== undefined && typeof field.description !== "string") {
    diagnostics.push(`${label} description must be a string`);
  }
}

function validateDescription(
  value: unknown,
  label: string,
  diagnostics: string[],
) {
  if (value !== undefined && typeof value !== "string") {
    diagnostics.push(`${label} description must be a string`);
  }
}

function validateFieldDefault(
  field: Record<string, unknown>,
  label: string,
  diagnostics: string[],
) {
  if (field.defaultValue === undefined) return;
  if (field.type === "string" || field.type === "date") {
    if (typeof field.defaultValue !== "string") {
      diagnostics.push(`${label} defaultValue must be a string`);
    }
    return;
  }
  if (field.type === "number") {
    if (typeof field.defaultValue !== "number" || !Number.isFinite(field.defaultValue)) {
      diagnostics.push(`${label} defaultValue must be a number`);
    }
    return;
  }
  if (field.type === "boolean") {
    if (typeof field.defaultValue !== "boolean") {
      diagnostics.push(`${label} defaultValue must be a boolean`);
    }
    return;
  }
  if (field.type === "select" && Array.isArray(field.options)) {
    if (typeof field.defaultValue !== "string") {
      diagnostics.push(`${label} defaultValue must be a string`);
      return;
    }
    if (!field.options.includes(String(field.defaultValue))) {
      diagnostics.push(`${label} defaultValue must be one of its options`);
    }
  }
}

function validateBranchWhere(
  where: unknown,
  attrNames: Set<string>,
  attrTypes: Map<string, string>,
  label: string,
  diagnostics: string[],
) {
  if (where === undefined) return;
  if (!Array.isArray(where)) {
    diagnostics.push(`${label} where must be an array of clauses`);
    return;
  }
  where.forEach((clause, index) => {
    const clauseLabel = `${label} where clause ${index + 1}`;
    if (!Array.isArray(clause) || clause.length < 3) {
      diagnostics.push(`${clauseLabel} must be [subject, attribute, value]`);
      return;
    }
    const attr = clause[1];
    if (typeof attr !== "string") {
      diagnostics.push(`${clauseLabel} attribute must be a string`);
      return;
    }
    if (!attrNames.has(attr)) {
      diagnostics.push(
        unknownReferenceMessage(
          `${clauseLabel} references unknown attribute ${attr}`,
          attr,
          attrNames,
        ),
      );
      return;
    }
    validateAttributeLiteralValue(attr, clause[2], attrTypes, clauseLabel, diagnostics);
  });
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1]! + 1,
        previous[j]! + 1,
        previous[j - 1]! + cost,
      );
    }
    previous = current;
  }
  return previous[b.length]!;
}

function closeMatchSuggestion(value: string, candidates: Iterable<string>): string | undefined {
  const normalized = value.toLowerCase();
  let best: { value: string; distance: number } | undefined;
  for (const candidate of candidates) {
    if (candidate.trim() === "") continue;
    const distance = editDistance(normalized, candidate.toLowerCase());
    if (distance === 0) return undefined;
    if (best === undefined || distance < best.distance) {
      best = { value: candidate, distance };
    }
  }
  if (best === undefined) return undefined;
  const threshold = Math.max(2, Math.floor(Math.max(value.length, best.value.length) * 0.25));
  return best.distance <= threshold ? best.value : undefined;
}

function unknownReferenceMessage(
  message: string,
  value: unknown,
  candidates: Iterable<string>,
): string {
  if (typeof value !== "string") return message;
  const suggestion = closeMatchSuggestion(value, candidates);
  return suggestion === undefined ? message : `${message}. Did you mean ${suggestion}?`;
}

function invalidValueMessage(
  message: string,
  value: unknown,
  candidates: Iterable<string>,
): string {
  return unknownReferenceMessage(message, value, candidates);
}

function validateOpensFormScope(
  scope: unknown,
  attrNames: Set<string>,
  fieldNames: Set<string>,
  label: string,
  diagnostics: string[],
) {
  if (scope === undefined || typeof scope !== "string") return;
  if (scope.startsWith("$arg.")) {
    const fieldName = scope.slice("$arg.".length);
    if (fieldName.length === 0 || !fieldNames.has(fieldName)) {
      const message = `${label} opensForm scope references unknown action field ${fieldName || "<missing>"}`;
      diagnostics.push(unknownReferenceMessage(message, fieldName, fieldNames));
    }
    return;
  }
  if (!attrNames.has(scope)) {
    const message = `${label} opensForm scope references unknown attribute ${scope}`;
    diagnostics.push(unknownReferenceMessage(message, scope, attrNames));
  }
}

function attributeTypesByName(attributes: readonly unknown[]): Map<string, string> {
  const types = new Map<string, string>();
  for (const raw of attributes) {
    const attr = record(raw);
    if (typeof attr.name === "string" && typeof attr.valueType === "string") {
      types.set(attr.name, attr.valueType);
    }
  }
  return types;
}

function validateAttributeLiteralValue(
  attr: unknown,
  value: unknown,
  attrTypes: Map<string, string>,
  label: string,
  diagnostics: string[],
) {
  if (typeof attr !== "string") return;
  const valueType = attrTypes.get(attr);
  if (valueType === undefined || value === undefined) return;
  if (valueType === "string") {
    if (typeof value !== "string") {
      diagnostics.push(`${label} value for ${attr} must be a string`);
    }
    return;
  }
  if (valueType === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      diagnostics.push(`${label} value for ${attr} must be a number`);
    }
    return;
  }
  if (valueType === "boolean") {
    if (typeof value !== "boolean") {
      diagnostics.push(`${label} value for ${attr} must be a boolean`);
    }
    return;
  }
  if (valueType === "date" || valueType === "entityRef") {
    if (typeof value !== "string") {
      diagnostics.push(`${label} value for ${attr} must be a string`);
    }
  }
}

export function validateAccountConfig(config: unknown): string[] {
  const diagnostics: string[] = [];
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return ["config must be an object"];
  }

  const account = record(record(config).account);
  if (typeof account.slug !== "string" || account.slug.trim() === "") {
    diagnostics.push("account missing slug");
  }
  if (typeof account.name !== "string" || account.name.trim() === "") {
    diagnostics.push("account missing name");
  }
  if (
    account.kind !== undefined &&
    account.kind !== "staffing" &&
    account.kind !== "legal" &&
    account.kind !== "custom"
  ) {
    diagnostics.push(
      invalidValueMessage(
        "account kind must be staffing, legal, or custom",
        account.kind,
        ["staffing", "legal", "custom"],
      ),
    );
  }

  const attributes = section(config, "attributes", diagnostics);
  const entityTypes = section(config, "entityTypes", diagnostics);
  const forms = section(config, "forms", diagnostics);
  const flows = section(config, "flows", diagnostics);
  const requirements = section(config, "requirements", diagnostics);
  const actions = section(config, "actions", diagnostics);

  const attrNames = duplicateCheck(attributes, "attribute", "name", diagnostics);
  const typeNames = duplicateCheck(entityTypes, "entityType", "name", diagnostics);
  const formNames = duplicateCheck(forms, "form", "form", diagnostics);
  duplicateCheck(flows, "flow", "name", diagnostics);
  duplicateCheck(requirements, "requirement", "form", diagnostics);
  duplicateCheck(actions, "action", "name", diagnostics);
  const attrTypes = attributeTypesByName(attributes);

  for (const raw of attributes) {
    const attr = record(raw);
    const name = String(attr.name ?? "<unknown>");
    validateDescription(attr.description, `attribute ${name}`, diagnostics);
    if (!VALUE_TYPES.has(String(attr.valueType))) {
      diagnostics.push(
        invalidValueMessage(
          `attribute ${name} has invalid valueType`,
          attr.valueType,
          VALUE_TYPES,
        ),
      );
    }
    if (!CARDINALITIES.has(String(attr.cardinality))) {
      diagnostics.push(`attribute ${name} has invalid cardinality`);
    }
  }

  for (const raw of entityTypes) {
    const type = record(raw);
    const name = String(type.name ?? "<unknown>");
    validateDescription(type.description, `entityType ${name}`, diagnostics);
    if (type.attributes !== undefined && !Array.isArray(type.attributes)) {
      diagnostics.push(`entityType ${name} attributes must be an array`);
      continue;
    }
    for (const attr of (type.attributes as unknown[] | undefined) ?? []) {
      if (typeof attr !== "string") {
        diagnostics.push(`entityType ${name} has non-string attribute`);
      } else if (!attrNames.has(attr) && attr !== "name" && attr !== "type") {
        const message = `entityType ${name} references unknown attribute ${attr}`;
        diagnostics.push(
          unknownReferenceMessage(message, attr, [...attrNames, "name", "type"]),
        );
      }
    }
  }

  for (const raw of forms) {
    const form = record(raw);
    const name = String(form.form ?? "<unknown>");
    validateDescription(form.description, `form ${name}`, diagnostics);
    if (typeof form.title !== "string" || form.title.trim() === "") {
      diagnostics.push(`form ${name} missing title`);
    }
    if (!Array.isArray(form.fields)) {
      diagnostics.push(`form ${name} fields must be an array`);
      continue;
    }
    duplicateCheck(form.fields, `form ${name} field`, "name", diagnostics);
    for (const rawField of form.fields) {
      const field = record(rawField);
      const fieldName = String(field.name ?? "<unknown>");
      if (typeof field.label !== "string" || field.label.trim() === "") {
        diagnostics.push(`form ${name} field ${fieldName} missing label`);
      }
      if (!FIELD_TYPES.has(String(field.type))) {
        diagnostics.push(
          invalidValueMessage(
            `form ${name} field ${fieldName} has invalid type`,
            field.type,
            FIELD_TYPES,
          ),
        );
      }
      validateFieldFlags(field, `form ${name} field ${fieldName}`, diagnostics);
      validateFieldOptions(field, `form ${name} field ${fieldName}`, diagnostics);
      validateFieldDefault(field, `form ${name} field ${fieldName}`, diagnostics);
      validateFormFieldAttributeType(
        field,
        attrTypes,
        `form ${name} field ${fieldName}`,
        diagnostics,
      );
    }
  }

  for (const raw of flows) {
    const flow = record(raw);
    const name = String(flow.name ?? "<unknown>");
    validateDescription(flow.description, `flow ${name}`, diagnostics);
    if (!typeNames.has(String(flow.subjectType))) {
      const subjectType = String(flow.subjectType ?? "<missing>");
      diagnostics.push(
        unknownReferenceMessage(
          `flow ${name} references unknown subjectType ${subjectType}`,
          flow.subjectType,
          typeNames,
        ),
      );
    }
    if (typeof flow.startStepId !== "string") {
      diagnostics.push(`flow ${name} missing startStepId`);
    }
    if (!Array.isArray(flow.steps)) {
      diagnostics.push(`flow ${name} steps must be an array`);
      continue;
    }
    const stepIds = duplicateCheck(flow.steps, `flow ${name} step`, "id", diagnostics);
    if (flow.startStepId && !stepIds.has(String(flow.startStepId))) {
      diagnostics.push(
        unknownReferenceMessage(
          `flow ${name} startStepId is not a step`,
          flow.startStepId,
          stepIds,
        ),
      );
    }
    for (const rawStep of flow.steps) {
      const step = record(rawStep);
      const stepId = String(step.id ?? "<unknown>");
      const stepType = String(step.type ?? "<missing>");
      const config = record(step.config);
      if (!FLOW_STEP_TYPES.has(stepType)) {
        diagnostics.push(
          invalidValueMessage(
            `flow ${name} step ${stepId} has invalid type`,
            step.type,
            FLOW_STEP_TYPES,
          ),
        );
      }
      if (step.next !== undefined && !stepIds.has(String(step.next))) {
        diagnostics.push(
          unknownReferenceMessage(
            `flow ${name} step ${stepId} next references unknown step ${String(step.next)}`,
            step.next,
            stepIds,
          ),
        );
      }
      if (step.type === "collect") {
        if (!formNames.has(String(config.form))) {
          diagnostics.push(
            unknownReferenceMessage(
              `flow ${name} step ${stepId} collects unknown form ${String(config.form ?? "<missing>")}`,
              config.form,
              formNames,
            ),
          );
        }
        if (
          config.scopeFrom !== undefined &&
          typeof config.scopeFrom === "string" &&
          !attrNames.has(config.scopeFrom)
        ) {
          diagnostics.push(
            unknownReferenceMessage(
              `flow ${name} step ${stepId} scopeFrom references unknown attribute ${config.scopeFrom}`,
              config.scopeFrom,
              attrNames,
            ),
          );
        }
        for (const key of ["reminderSeconds", "escalateSeconds", "expireSeconds"]) {
          if (config[key] !== undefined && typeof config[key] !== "number") {
            diagnostics.push(`flow ${name} step ${stepId} ${key} must be a number`);
          }
        }
      }
      if (step.type === "branch") {
        validateBranchWhere(
          config.where,
          attrNames,
          attrTypes,
          `flow ${name} step ${stepId}`,
          diagnostics,
        );
        if (
          config.subjectVar !== undefined &&
          (typeof config.subjectVar !== "string" || config.subjectVar.length === 0)
        ) {
          diagnostics.push(`flow ${name} step ${stepId} subjectVar must be a string`);
        }
        for (const [key, value] of [
          ["ifTrue", config.ifTrue],
          ["ifFalse", config.ifFalse],
        ] as const) {
          if (value !== undefined && !stepIds.has(String(value))) {
            diagnostics.push(
              unknownReferenceMessage(
                `flow ${name} step ${stepId} ${key} references unknown step ${String(value)}`,
                value,
                stepIds,
              ),
            );
          }
        }
      }
      if (step.type === "assert") {
        if (typeof config.a !== "string" || !attrNames.has(config.a)) {
          diagnostics.push(
            unknownReferenceMessage(
              `flow ${name} step ${stepId} asserts unknown attribute ${String(config.a ?? "<missing>")}`,
              config.a,
              attrNames,
            ),
          );
        } else {
          validateAttributeLiteralValue(
            config.a,
            config.v,
            attrTypes,
            `flow ${name} step ${stepId} assert`,
            diagnostics,
          );
        }
      }
      if (step.type === "action") {
        if (
          config.resultAttr !== undefined &&
          (typeof config.resultAttr !== "string" || !attrNames.has(config.resultAttr))
        ) {
          diagnostics.push(
            unknownReferenceMessage(
              `flow ${name} step ${stepId} resultAttr references unknown attribute ${String(config.resultAttr)}`,
              config.resultAttr,
              attrNames,
            ),
          );
        } else {
          validateAttributeLiteralValue(
            config.resultAttr,
            config.resultValue,
            attrTypes,
            `flow ${name} step ${stepId} action`,
            diagnostics,
          );
        }
        if (config.delaySeconds !== undefined && typeof config.delaySeconds !== "number") {
          diagnostics.push(`flow ${name} step ${stepId} delaySeconds must be a number`);
        }
      }
      if (step.type === "notify") {
        if (typeof config.message !== "string" || config.message.length === 0) {
          diagnostics.push(`flow ${name} step ${stepId} notify message must be a string`);
        }
        for (const key of ["channel", "to", "template"]) {
          if (config[key] !== undefined && typeof config[key] !== "string") {
            diagnostics.push(`flow ${name} step ${stepId} ${key} must be a string`);
          }
        }
        if (config.delaySeconds !== undefined && typeof config.delaySeconds !== "number") {
          diagnostics.push(`flow ${name} step ${stepId} delaySeconds must be a number`);
        }
      }
      if (step.type === "wait" && config.seconds !== undefined && typeof config.seconds !== "number") {
        diagnostics.push(`flow ${name} step ${stepId} seconds must be a number`);
      }
    }
  }

  for (const raw of requirements) {
    const requirement = record(raw);
    const form = String(requirement.form ?? "<unknown>");
    validateDescription(requirement.description, `requirement ${form}`, diagnostics);
    if (!formNames.has(String(requirement.form))) {
      diagnostics.push(
        unknownReferenceMessage(
          `requirement references unknown form ${String(requirement.form ?? "<missing>")}`,
          requirement.form,
          formNames,
        ),
      );
    }
    if (!attrNames.has(String(requirement.scopeAttr))) {
      diagnostics.push(
        unknownReferenceMessage(
          `requirement ${form} references unknown scopeAttr ${String(requirement.scopeAttr ?? "<missing>")}`,
          requirement.scopeAttr,
          attrNames,
        ),
      );
    }
    if (requirement.validityDays !== undefined && typeof requirement.validityDays !== "number") {
      diagnostics.push(`requirement ${form} validityDays must be a number`);
    }
    if (requirement.guard !== undefined) {
      if (
        !Array.isArray(requirement.guard) ||
        requirement.guard.length !== 2 ||
        typeof requirement.guard[0] !== "string"
      ) {
        diagnostics.push(`requirement ${form} guard must be [attribute, value]`);
      } else if (!attrNames.has(requirement.guard[0])) {
        diagnostics.push(
          unknownReferenceMessage(
            `requirement ${form} guard references unknown attribute ${requirement.guard[0]}`,
            requirement.guard[0],
            attrNames,
          ),
        );
      } else {
        validateAttributeLiteralValue(
          requirement.guard[0],
          requirement.guard[1],
          attrTypes,
          `requirement ${form} guard`,
          diagnostics,
        );
      }
    }
  }

  for (const raw of actions) {
    const action = record(raw);
    const name = String(action.name ?? "<unknown>");
    validateDescription(action.description, `action ${name}`, diagnostics);
    if (!typeNames.has(String(action.appliesTo))) {
      diagnostics.push(
        unknownReferenceMessage(
          `action ${name} references unknown appliesTo ${String(action.appliesTo ?? "<missing>")}`,
          action.appliesTo,
          typeNames,
        ),
      );
    }
    if (
      action.asserts !== undefined &&
      (action.asserts === null ||
        typeof action.asserts !== "object" ||
        Array.isArray(action.asserts))
    ) {
      diagnostics.push(`action ${name} asserts must be an object`);
    } else {
      for (const [attr, value] of Object.entries(record(action.asserts))) {
        if (!attrNames.has(attr)) {
          const message = `action ${name} asserts unknown attribute ${attr}`;
          diagnostics.push(unknownReferenceMessage(message, attr, attrNames));
        } else {
          validateAttributeLiteralValue(
            attr,
            value,
            attrTypes,
            `action ${name} assert`,
            diagnostics,
          );
        }
      }
    }
    if (action.fields !== undefined) {
      if (!Array.isArray(action.fields)) {
        diagnostics.push(`action ${name} fields must be an array`);
      } else {
        const fieldNames = duplicateCheck(action.fields, `action ${name} field`, "name", diagnostics);
        for (const rawField of action.fields) {
          const field = record(rawField);
          const fieldName = String(field.name ?? "<unknown>");
          if (typeof field.label !== "string" || field.label.trim() === "") {
            diagnostics.push(`action ${name} field ${fieldName} missing label`);
          }
          if (!ACTION_FIELD_TYPES.has(String(field.type))) {
            diagnostics.push(
              invalidValueMessage(
                `action ${name} field ${fieldName} has invalid type`,
                field.type,
                ACTION_FIELD_TYPES,
              ),
            );
          }
          if (field.pii !== undefined) {
            diagnostics.push(`action ${name} field ${fieldName} pii is only valid for form fields`);
          }
          validateFieldFlags(field, `action ${name} field ${fieldName}`, diagnostics);
          validateFieldOptions(field, `action ${name} field ${fieldName}`, diagnostics);
          validateFieldDefault(field, `action ${name} field ${fieldName}`, diagnostics);
          validateActionFieldAttributeType(
            field,
            attrTypes,
            `action ${name} field ${fieldName}`,
            diagnostics,
          );
        }
      }
    }
    const actionFields = Array.isArray(action.fields)
      ? new Set(
          action.fields
            .map((field) => record(field).name)
            .filter((field): field is string => typeof field === "string"),
        )
      : new Set<string>();
    const opensForm = record(action.opensForm);
    if (
      typeof opensForm.form === "string" &&
      !formNames.has(opensForm.form)
    ) {
      const message = `action ${name} opens unknown form ${opensForm.form}`;
      diagnostics.push(unknownReferenceMessage(message, opensForm.form, formNames));
    }
    validateOpensFormScope(opensForm.scope, attrNames, actionFields, `action ${name}`, diagnostics);
  }

  return diagnostics;
}

function names(entries: unknown[], key: string): string[] {
  return entries
    .map((entry) => record(entry)[key])
    .filter((value): value is string => typeof value === "string")
    .sort();
}

export function accountConfigManifest(config: unknown): AccountConfigManifest {
  const diagnostics: string[] = [];
  return {
    attributes: names(section(config, "attributes", diagnostics), "name"),
    entityTypes: names(section(config, "entityTypes", diagnostics), "name"),
    forms: names(section(config, "forms", diagnostics), "form"),
    flows: names(section(config, "flows", diagnostics), "name"),
    requirements: names(section(config, "requirements", diagnostics), "form"),
    actions: names(section(config, "actions", diagnostics), "name"),
  };
}

export function accountMetadata(config: unknown): AccountMetadata {
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

export function stableJson(value: unknown): string {
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

export function accountConfigDigest(value: unknown): string {
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

export function accountResourceMap(config: unknown): Record<string, unknown> {
  return {
    attributes: Object.fromEntries(
      section(config, "attributes", []).map((entry) => {
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
      section(config, "entityTypes", []).map((entry) => {
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
      section(config, "forms", []).map((entry) => {
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
      section(config, "flows", []).map((entry) => {
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
      section(config, "requirements", []).map((entry) => {
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
      section(config, "actions", []).map((entry) => {
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

export function accountDeployArtifact(config: unknown): AccountDeployArtifact {
  return {
    kind: "metacrdt.account.deploy",
    version: 1,
    account: accountMetadata(config),
    manifest: accountConfigManifest(config),
    resources: accountResourceMap(config),
  };
}

function artifactErrors(artifact: unknown, label: string): string[] {
  const errors: string[] = [];
  const raw = record(artifact);
  if (raw.kind !== "metacrdt.account.deploy") {
    errors.push(`${label} artifact kind must be metacrdt.account.deploy`);
  }
  if (raw.version !== 1) {
    errors.push(`${label} artifact version must be 1`);
  }
  if (raw.resources === null || typeof raw.resources !== "object" || Array.isArray(raw.resources)) {
    errors.push(`${label} artifact resources must be an object`);
  }
  return errors;
}

function resourceBucket(
  artifact: AccountDeployArtifact | null | undefined,
  kind: ConfigKind,
): Record<string, unknown> {
  if (artifact === null || artifact === undefined) return {};
  const value = record(artifact.resources)[RESOURCE_BUCKETS[kind]];
  return record(value);
}

function emptyPlanDiff(): AccountDeployPlanDiff {
  return { added: [], changed: [], removed: [], unchanged: [] };
}

function emptyDiffByKind(): Record<ConfigKind, AccountDeployPlanDiff> {
  return Object.fromEntries(
    CONFIG_KINDS.map((kind) => [kind, emptyPlanDiff()]),
  ) as Record<ConfigKind, AccountDeployPlanDiff>;
}

function dangerousRemoval(kind: ConfigKind, value: string): AccountDeployDangerousChange {
  return {
    kind,
    value,
    reason: `Removing ${kind}:${value} can remove or orphan tenant runtime behavior.`,
  };
}

function diffArtifactResources(
  current: AccountDeployArtifact | null | undefined,
  desired: AccountDeployArtifact,
): {
  byKind: Record<ConfigKind, AccountDeployPlanDiff>;
  changes: AccountDeployResourceChange[];
  dangerous: AccountDeployDangerousChange[];
} {
  const byKind = emptyDiffByKind();
  const changes: AccountDeployResourceChange[] = [];
  const dangerous: AccountDeployDangerousChange[] = [];
  for (const kind of CONFIG_KINDS) {
    const currentBucket = resourceBucket(current, kind);
    const desiredBucket = resourceBucket(desired, kind);
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
  return { byKind, changes, dangerous };
}

function planTotals(
  byKind: Record<ConfigKind, AccountDeployPlanDiff>,
): AccountDeployPlan["totals"] {
  return Object.fromEntries(
    CONFIG_KINDS.map((kind) => [
      kind,
      {
        added: byKind[kind].added.length,
        changed: byKind[kind].changed.length,
        removed: byKind[kind].removed.length,
        unchanged: byKind[kind].unchanged.length,
      },
    ]),
  ) as AccountDeployPlan["totals"];
}

function planIsEmptyByTotals(totals: AccountDeployPlan["totals"]): boolean {
  return Object.values(totals).every(
    (entry) => entry.added === 0 && entry.changed === 0 && entry.removed === 0,
  );
}

function planAccountMetadataChange(
  current: AccountDeployArtifact | null | undefined,
  desired: AccountDeployArtifact,
): AccountDeployAccountChange {
  const before = current?.account ?? null;
  const after = desired.account;
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

export function planAccountDeploy(
  current: AccountDeployArtifact | null | undefined,
  desired: AccountDeployArtifact,
): AccountDeployPlan {
  const errors = [
    ...(current === null || current === undefined ? [] : artifactErrors(current, "current")),
    ...artifactErrors(desired, "desired"),
  ];
  const { byKind, changes, dangerous } = diffArtifactResources(current, desired);
  const totals = planTotals(byKind);
  const accountChange = planAccountMetadataChange(current, desired);
  return {
    valid: errors.length === 0,
    errors,
    empty: planIsEmptyByTotals(totals) && accountChange.action === "unchanged",
    destructive: dangerous.length > 0,
    currentArtifactDigest: current === null || current === undefined
      ? null
      : accountConfigDigest(current),
    desiredArtifactDigest: accountConfigDigest(desired),
    account: desired.account,
    accountChange,
    manifest: desired.manifest,
    byKind,
    totals,
    changes,
    dangerous,
  };
}

export function planAccountDeployFromConfig(
  current: AccountDeployArtifact | null | undefined,
  desiredConfig: unknown,
): AccountDeployPlan {
  return planAccountDeploy(current, accountDeployArtifact(desiredConfig));
}

function shouldRunAsMain(meta: AccountDeployMainMeta, target: AccountDeployIfMainTarget): boolean {
  if (target.isMain !== undefined) return target.isMain;
  return meta.url !== undefined &&
    target.mainModuleUrl !== undefined &&
    meta.url === target.mainModuleUrl;
}

async function emitDeployEvent(
  target: AccountDeployIfMainTarget,
  event: AccountDeployIfMainEvent,
): Promise<void> {
  await target.write?.(event);
}

async function currentDeployArtifact(
  target: AccountDeployIfMainTarget,
): Promise<AccountDeployArtifact | null> {
  if (typeof target.currentArtifact === "function") {
    return await target.currentArtifact();
  }
  return target.currentArtifact ?? null;
}

export async function deployAccountIfMain(
  meta: AccountDeployMainMeta,
  config: unknown,
  target: AccountDeployIfMainTarget = { isMain: true },
): Promise<AccountDeployIfMainResult> {
  if (!shouldRunAsMain(meta, target)) {
    const reason = "module is not the deploy entrypoint";
    await emitDeployEvent(target, { type: "skipped", reason });
    return { skipped: true, reason };
  }

  const dump = dumpAccountDeploy(config);
  await emitDeployEvent(target, { type: "dumped", dump });

  const current = await currentDeployArtifact(target);
  const localPlan = planAccountDeploy(current, dump.prepared.artifact);
  if (!localPlan.valid) {
    await emitDeployEvent(target, { type: "planned", plan: localPlan });
    return { skipped: false, dump, localPlan };
  }

  const remotePlan = target.plan === undefined
    ? undefined
    : await target.plan({
        tenantSlug: target.tenantSlug,
        config,
        artifact: dump.prepared.artifact,
        sourceDigest: dump.source.digest,
        artifactDigest: dump.prepared.digest,
        sourceFormat: target.sourceFormat,
        localPlan,
      });
  await emitDeployEvent(target, { type: "planned", plan: localPlan, remotePlan });

  const approval =
    target.autoApprove === true && target.approve !== undefined && remotePlan !== undefined
      ? await target.approve(remotePlan)
      : undefined;
  if (approval !== undefined) {
    await emitDeployEvent(target, { type: "approved", approval });
  }

  const applyResult =
    target.autoApply === true && target.apply !== undefined && remotePlan !== undefined
      ? await target.apply(remotePlan, approval)
      : undefined;
  if (applyResult !== undefined) {
    await emitDeployEvent(target, { type: "applied", result: applyResult });
  }

  return {
    skipped: false,
    dump,
    localPlan,
    ...(remotePlan === undefined ? {} : { remotePlan }),
    ...(approval === undefined ? {} : { approval }),
    ...(applyResult === undefined ? {} : { applyResult }),
  };
}

export async function applyAccountDeploy(
  tenant: string | { tenantSlug?: string },
  planId: string,
  target: AccountDeployApplyTarget,
  approval?: unknown,
): Promise<unknown> {
  const normalizedPlanId = planId.trim();
  if (normalizedPlanId === "") throw new Error("account deploy plan id is required");
  const tenantSlug = typeof tenant === "string" ? tenant : tenant.tenantSlug;
  const result = await target.applyPlan({
    tenantSlug,
    planId: normalizedPlanId,
    ...(approval === undefined ? {} : { approval }),
  });
  await target.write?.({ type: "applied", result });
  return result;
}

export async function approveAccountDeploy(
  tenant: string | { tenantSlug?: string },
  planId: string,
  target: AccountDeployApproveTarget,
): Promise<unknown> {
  const normalizedPlanId = planId.trim();
  if (normalizedPlanId === "") throw new Error("account deploy plan id is required");
  const tenantSlug = typeof tenant === "string" ? tenant : tenant.tenantSlug;
  const approval = await target.approvePlan({
    tenantSlug,
    planId: normalizedPlanId,
  });
  await target.write?.({ type: "approved", approval });
  return approval;
}

export function dumpAccountDeploy(config: unknown): AccountDeployDump {
  const artifact = accountDeployArtifact(config);
  return {
    version: 1,
    source: {
      format: "account-config-ir",
      config,
      digest: accountConfigDigest(config),
      diagnostics: validateAccountConfig(config),
      account: accountMetadata(config),
      manifest: accountConfigManifest(config),
    },
    prepared: {
      artifact,
      digest: accountConfigDigest(artifact),
    },
  };
}
