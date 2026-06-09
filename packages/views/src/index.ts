import type { ViewAction, ViewActionOrList } from "./generated/view-action.generated.js";
import type { ViewStateDecl } from "./generated/view-state.generated.js";
import {
  normalizeGeneratedViewNode,
  VIEW_SPEC_COMPONENT_CATALOG,
  type ViewNode,
  type ViewComponentType,
} from "./generated/view-node.generated.js";
import {
  type ViewCapabilities,
  type ViewInputParam,
  type ViewQueryBinding,
  ViewSpec,
  type ViewTheme,
} from "./generated/view-spec.generated.js";
import { isRecord } from "./runtime.js";

// The effect-free runtime (expression/value eval, state init, path helpers, and
// the plain types) lives in `./runtime.js` so render targets can import it
// without pulling the Effect Schema IR. `@metacrdt/views` is a superset that
// adds `normalizeViewSpec` / `validateViewSpecStructure` (which consume generated
// runtime values) plus the full Schema IR.
export {
  evaluateExpr,
  evaluateValue,
  evaluateViewExpression,
  evaluateViewValue,
  getValueAtPath,
  initializeStateValue,
  initializeViewState,
  patchValueAtPath,
  setValueAtPath,
} from "./runtime.js";
export type {
  EvaluationContext,
  Primitive,
  ViewExpressionContext,
  ViewValue,
} from "./runtime.js";

export * from "./generated/view-expression.generated.js";
export * from "./generated/view-action.generated.js";
export * from "./generated/view-event.generated.js";
export * from "./generated/view-state.generated.js";
export * from "./generated/view-node.generated.js";
export * from "./generated/view-spec.generated.js";

// =============================================================================
// Inputs, Queries, Theme, Capabilities, Spec
// =============================================================================

export type ViewSpecType = typeof ViewSpec.Type;

// =============================================================================
// Normalization
// =============================================================================

export function normalizeStateDecl(input: unknown): ViewStateDecl | undefined {
  if (!isRecord(input)) return undefined;

  const kind = input["kind"];
  if (
    kind === "string" ||
    kind === "number" ||
    kind === "boolean" ||
    kind === "null" ||
    kind === "list" ||
    kind === "object" ||
    kind === "json" ||
    kind === "component"
  ) {
    return {
      kind,
      ...(input["initial"] !== undefined ? { initial: input["initial"] } : {}),
    } as ViewStateDecl;
  }

  return {
    kind: "json",
    ...(input["initial"] !== undefined ? { initial: input["initial"] } : {}),
  };
}

export const normalizeViewNode = normalizeGeneratedViewNode;

function normalizeQueryBinding(binding: unknown): ViewQueryBinding | undefined {
  const input = isRecord(binding) ? binding : {};
  const params = isRecord(input["params"])
    ? (input["params"] as Record<string, unknown>)
    : undefined;
  const dependsOn = Array.isArray(input["dependsOn"])
    ? input["dependsOn"].filter((value): value is string => typeof value === "string")
    : undefined;

  if (input["query"] !== undefined) {
    return {
      query: input["query"],
      ...(params ? { params } : {}),
      ...(dependsOn ? { dependsOn } : {}),
    };
  }

  const queryRef =
    typeof input["queryRef"] === "string"
      ? input["queryRef"]
      : typeof input["ref"] === "string"
        ? input["ref"]
        : undefined;
  if (queryRef) {
    return {
      queryRef,
      ...(params ? { params } : {}),
      ...(dependsOn ? { dependsOn } : {}),
    };
  }

  return undefined;
}

export function normalizeViewSpec(input: unknown): ViewSpec {
  const spec = isRecord(input) ? input : {};
  const result: {
    $viewSpec: { version: "2" };
    description?: string;
    input?: Record<string, ViewInputParam>;
    state?: Record<string, ViewStateDecl>;
    queries?: Record<string, ViewQueryBinding>;
    defs?: Record<string, ViewNode>;
    theme?: ViewTheme;
    capabilities?: ViewCapabilities;
    onMount?: ViewActionOrList;
    keyBindings?: Record<string, ViewActionOrList>;
    root: ViewNode;
  } = {
    $viewSpec: { version: "2" },
    root: normalizeViewNode(spec["root"]),
  };

  if (typeof spec["description"] === "string") {
    result.description = spec["description"];
  }
  if (isRecord(spec["input"])) {
    result.input = spec["input"] as Record<string, ViewInputParam>;
  }
  if (isRecord(spec["state"])) {
    result.state = Object.fromEntries(
      Object.entries(spec["state"])
        .map(([key, value]) => [key, normalizeStateDecl(value)])
        .filter((entry): entry is [string, ViewStateDecl] => entry[1] !== undefined),
    );
  }
  if (isRecord(spec["queries"])) {
    result.queries = Object.fromEntries(
      Object.entries(spec["queries"])
        .map(([key, value]) => [key, normalizeQueryBinding(value)])
        .filter((entry): entry is [string, ViewQueryBinding] => entry[1] !== undefined),
    );
  }
  if (isRecord(spec["defs"])) {
    result.defs = Object.fromEntries(
      Object.entries(spec["defs"]).map(([key, value]) => [key, normalizeViewNode(value)]),
    );
  }
  if (isRecord(spec["theme"])) {
    result.theme = spec["theme"] as ViewTheme;
  }
  if (isRecord(spec["capabilities"])) {
    result.capabilities = spec["capabilities"] as ViewCapabilities;
  }
  if (spec["onMount"] !== undefined) {
    result.onMount = spec["onMount"] as ViewActionOrList;
  }
  if (isRecord(spec["keyBindings"])) {
    result.keyBindings = spec["keyBindings"] as Record<string, ViewActionOrList>;
  }

  return result;
}

// `initializeStateValue` / `initializeViewState` are re-exported from `./runtime.js`.

// =============================================================================
// Structural Validation
// =============================================================================

export type ViewSpecIssueCode =
  | "unknown_component"
  | "invalid_child"
  | "invalid_parent"
  | "unsupported_event"
  | "missing_def"
  | "unknown_custom_component"
  | "missing_query"
  | "missing_query_dependency"
  | "query_dependency_cycle";

export interface ViewSpecIssue {
  readonly severity: "error" | "warning";
  readonly code: ViewSpecIssueCode;
  readonly message: string;
  readonly path?: string | undefined;
  readonly nodeType?: string | undefined;
}

export interface ViewSpecValidationResult {
  readonly valid: boolean;
  readonly issues: readonly ViewSpecIssue[];
}

export interface ValidateViewSpecStructureOptions {
  readonly checkCustomComponents?: boolean | undefined;
  readonly customComponents?: ReadonlySet<string> | readonly string[] | undefined;
  readonly isCustomComponentRegistered?: ((name: string) => boolean) | undefined;
}

interface ChildGroup {
  readonly field: string;
  readonly children: readonly ViewNode[];
}

const VIEW_SPEC_COMPONENT_TYPE_SET = new Set<string>(Object.keys(VIEW_SPEC_COMPONENT_CATALOG));

function pushIssue(issues: ViewSpecIssue[], issue: ViewSpecIssue): void {
  issues.push(issue);
}

function pathJoin(path: string, field: string, index?: number): string {
  return index === undefined ? `${path}.${field}` : `${path}.${field}[${index}]`;
}

function isViewComponentType(value: string): value is ViewComponentType {
  return VIEW_SPEC_COMPONENT_TYPE_SET.has(value);
}

function normalizeCustomComponentSet(
  customComponents: ReadonlySet<string> | readonly string[] | undefined,
): ReadonlySet<string> | undefined {
  if (!customComponents) return undefined;
  return customComponents instanceof Set ? customComponents : new Set(customComponents);
}

function childGroupsForNode(node: ViewNode): readonly ChildGroup[] {
  const catalog = VIEW_SPEC_COMPONENT_CATALOG[node.type];
  const record = node as unknown as Record<string, unknown>;
  const groups: ChildGroup[] = [];

  if (Array.isArray(record["children"])) {
    groups.push({ field: "children", children: record["children"] as readonly ViewNode[] });
  }

  for (const slot of catalog.slots) {
    if (slot.kind !== "node-list" || slot.field === "children") continue;
    const value = record[slot.field];
    if (Array.isArray(value)) {
      groups.push({ field: slot.field, children: value as readonly ViewNode[] });
    }
  }

  return groups;
}

function visitViewActions(
  actionOrList: ViewActionOrList | undefined,
  path: string,
  queryNames: ReadonlySet<string>,
  issues: ViewSpecIssue[],
): void {
  if (!actionOrList) return;
  const actions = Array.isArray(actionOrList) ? actionOrList : [actionOrList];
  actions.forEach((action, index) =>
    visitViewAction(action, `${path}[${index}]`, queryNames, issues),
  );
}

function visitViewAction(
  action: ViewAction,
  path: string,
  queryNames: ReadonlySet<string>,
  issues: ViewSpecIssue[],
): void {
  if (action.action === "runQuery" && !queryNames.has(action.query)) {
    pushIssue(issues, {
      severity: "error",
      code: "missing_query",
      message: `Action references missing query '${action.query}'.`,
      path,
    });
  }

  if (action.action === "runQueries") {
    for (const query of action.queries) {
      if (!queryNames.has(query)) {
        pushIssue(issues, {
          severity: "error",
          code: "missing_query",
          message: `Action references missing query '${query}'.`,
          path,
        });
      }
    }
  }

  visitViewActions(action.onSuccess, `${path}.onSuccess`, queryNames, issues);
  visitViewActions(action.onError, `${path}.onError`, queryNames, issues);
  visitViewActions(action.onFinally, `${path}.onFinally`, queryNames, issues);
}

function validateQueryDependencies(
  spec: ViewSpec,
  queryNames: ReadonlySet<string>,
  issues: ViewSpecIssue[],
): void {
  const queries = spec.queries ?? {};
  const visiting = new Set<string>();
  const visited = new Set<string>();

  for (const [name, binding] of Object.entries(queries)) {
    for (const dep of binding.dependsOn ?? []) {
      if (!queryNames.has(dep)) {
        pushIssue(issues, {
          severity: "error",
          code: "missing_query_dependency",
          message: `Query '${name}' depends on missing query '${dep}'.`,
          path: `queries.${name}.dependsOn`,
        });
      }
    }
  }

  const visit = (name: string, stack: readonly string[]) => {
    if (visited.has(name)) return;
    if (visiting.has(name)) {
      pushIssue(issues, {
        severity: "error",
        code: "query_dependency_cycle",
        message: `Query dependency cycle detected: ${[...stack, name].join(" -> ")}.`,
        path: `queries.${name}.dependsOn`,
      });
      return;
    }

    visiting.add(name);
    const binding = queries[name];
    for (const dep of binding?.dependsOn ?? []) {
      if (queryNames.has(dep)) visit(dep, [...stack, name]);
    }
    visiting.delete(name);
    visited.add(name);
  };

  for (const name of queryNames) visit(name, []);
}

export function validateViewSpecStructure(
  spec: ViewSpec,
  options: ValidateViewSpecStructureOptions = {},
): ViewSpecValidationResult {
  const issues: ViewSpecIssue[] = [];
  const defNames = new Set(Object.keys(spec.defs ?? {}));
  const queryNames = new Set(Object.keys(spec.queries ?? {}));
  const customComponentSet = normalizeCustomComponentSet(options.customComponents);
  const shouldCheckCustomComponents =
    options.checkCustomComponents === true ||
    customComponentSet !== undefined ||
    options.isCustomComponentRegistered !== undefined;

  const isCustomComponentRegistered = (name: string): boolean => {
    if (options.isCustomComponentRegistered) return options.isCustomComponentRegistered(name);
    return customComponentSet?.has(name) ?? false;
  };

  const visitNode = (node: ViewNode, path: string, parentType?: ViewComponentType) => {
    const nodeType = node.type;
    if (!isViewComponentType(nodeType)) {
      pushIssue(issues, {
        severity: "error",
        code: "unknown_component",
        message: `Unknown ViewSpec component type '${nodeType}'.`,
        path,
        nodeType,
      });
      return;
    }

    const catalog = VIEW_SPEC_COMPONENT_CATALOG[nodeType];
    if (catalog.parents.length > 0 && (!parentType || !catalog.parents.includes(parentType))) {
      pushIssue(issues, {
        severity: "error",
        code: "invalid_parent",
        message: `'${nodeType}' must appear directly under ${catalog.parents
          .map((type) => `'${type}'`)
          .join(", ")}.`,
        path,
        nodeType,
      });
    }

    const record = node as unknown as Record<string, unknown>;
    const events = isRecord(record["events"]) ? record["events"] : {};
    for (const eventName of Object.keys(events)) {
      if (!catalog.events.includes(eventName)) {
        pushIssue(issues, {
          severity: "error",
          code: "unsupported_event",
          message: `'${nodeType}' does not support event '${eventName}'.`,
          path: pathJoin(path, "events"),
          nodeType,
        });
      }
    }
    for (const [eventName, actionOrList] of Object.entries(events)) {
      visitViewActions(
        actionOrList as ViewActionOrList,
        pathJoin(path, `events.${eventName}`),
        queryNames,
        issues,
      );
    }

    if (node.type === "use" && !defNames.has(node.name)) {
      pushIssue(issues, {
        severity: "error",
        code: "missing_def",
        message: `Use node references missing def '${node.name}'.`,
        path,
        nodeType,
      });
    }

    if (
      node.type === "custom" &&
      shouldCheckCustomComponents &&
      !isCustomComponentRegistered(node.componentName)
    ) {
      pushIssue(issues, {
        severity: "error",
        code: "unknown_custom_component",
        message: `Custom node references unregistered component '${node.componentName}'.`,
        path,
        nodeType,
      });
    }

    for (const group of childGroupsForNode(node)) {
      group.children.forEach((child, index) => {
        if (
          group.field === "children" &&
          catalog.children.kind === "only" &&
          !catalog.children.types?.includes(child.type)
        ) {
          pushIssue(issues, {
            severity: "error",
            code: "invalid_child",
            message: `'${nodeType}' only accepts ${catalog.children.types
              ?.map((type) => `'${type}'`)
              .join(", ")} children, not '${child.type}'.`,
            path: pathJoin(path, group.field, index),
            nodeType: child.type,
          });
        }
        visitNode(child, pathJoin(path, group.field, index), nodeType);
      });
    }
  };

  validateQueryDependencies(spec, queryNames, issues);
  visitViewActions(spec.onMount, "onMount", queryNames, issues);
  for (const [key, actionOrList] of Object.entries(spec.keyBindings ?? {})) {
    visitViewActions(actionOrList, `keyBindings.${key}`, queryNames, issues);
  }

  visitNode(spec.root, "root");
  for (const [name, node] of Object.entries(spec.defs ?? {})) {
    visitNode(node, `defs.${name}`);
  }

  return {
    valid: issues.every((issue) => issue.severity !== "error"),
    issues,
  };
}

export function formatViewSpecIssues(issues: readonly ViewSpecIssue[]): string {
  return issues
    .map((issue) => {
      const location = issue.path ? ` at ${issue.path}` : "";
      return `${issue.severity.toUpperCase()} ${issue.code}${location}: ${issue.message}`;
    })
    .join("\n");
}
