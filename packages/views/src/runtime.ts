// =============================================================================
// @metacrdt/views/runtime — the EFFECT-FREE runtime.
//
// Expression / value evaluation, state initialization, and path helpers, plus
// the plain TypeScript types. This module imports ONLY types from the generated
// Schema IR — never the Schema consts — so importing it does not pull the Effect
// `Schema` runtime into a host bundle. Render targets (e.g. an inline renderer or
// a future @metacrdt/views-react) should import from here.
//
// `normalizeViewSpec` / `validateViewSpecStructure` live in the main entry
// (`@metacrdt/views`) because they consume generated runtime values (the
// component catalog and node normalizer) that currently co-reside with the
// Schema consts. Splitting those out of the generator would let them move here
// too; until then, keep this entry strictly effect-free.
// =============================================================================

import type {
  ViewExprBinary,
  ViewExprNode,
  ViewExprSource,
} from "./generated/view-expression.generated.js";
import type { ViewStateDecl } from "./generated/view-state.generated.js";

// Re-export the plain types render targets commonly need, effect-free.
export type {
  ViewExpr,
  ViewExprNode,
} from "./generated/view-expression.generated.js";
export type { ViewStateDecl } from "./generated/view-state.generated.js";
export type {
  ViewNode,
  ViewTableColumn,
  ViewComponentType,
} from "./generated/view-node.generated.js";
export type { ViewSpec } from "./generated/view-spec.generated.js";

export type Primitive = string | number | boolean | null;

export type ViewValue = unknown;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// =============================================================================
// State initialization
// =============================================================================

export function initializeStateValue(decl: ViewStateDecl): unknown {
  if (decl.initial !== undefined) return decl.initial;

  switch (decl.kind) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "null":
      return null;
    case "list":
      return [];
    case "object":
      return {};
    case "json":
      return null;
    case "component":
      return null;
  }
}

export function initializeViewState(
  state: Record<string, ViewStateDecl> | undefined,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, decl] of Object.entries(state ?? {})) {
    result[key] = initializeStateValue(decl);
  }
  return result;
}

// =============================================================================
// Expression evaluation
// =============================================================================

export interface ViewExpressionContext {
  readonly state: Record<string, unknown>;
  readonly query: Record<string, unknown>;
  readonly input: Record<string, unknown>;
  readonly $row?: Record<string, unknown> | undefined;
  readonly $item?: unknown;
  readonly $index?: number | undefined;
  readonly $event?: unknown;
  readonly $result?: unknown;
  readonly $error?: unknown;
  readonly $db?: string | undefined;
  readonly $host?: Record<string, unknown> | undefined;
}

export type EvaluationContext = ViewExpressionContext;

function isViewExprNode(value: unknown): value is ViewExprNode {
  if (!isRecord(value)) return false;
  switch (value["kind"]) {
    case "literal":
    case "var":
    case "binary":
    case "unary":
    case "conditional":
    case "pipe":
      return true;
    default:
      return false;
  }
}

export function evaluateViewExpression(expr: unknown, ctx: ViewExpressionContext): unknown {
  if (!isViewExprNode(expr)) {
    return expr;
  }

  switch (expr.kind) {
    case "literal":
      return expr.value;
    case "var": {
      const root = resolveExprRoot(expr.source, ctx);
      return readPath(root, expr.path ?? []);
    }
    case "binary": {
      const left = evaluateViewExpression(expr.left, ctx);
      const right = evaluateViewExpression(expr.right, ctx);
      return applyBinary(expr.op, left, right);
    }
    case "unary": {
      const value = evaluateViewExpression(expr.value, ctx);
      return expr.op === "!" ? !value : -(Number(value) || 0);
    }
    case "conditional":
      return evaluateViewExpression(expr.condition, ctx)
        ? evaluateViewExpression(expr.then, ctx)
        : evaluateViewExpression(expr.else, ctx);
    case "pipe": {
      const value = evaluateViewExpression(expr.value, ctx);
      const args = (expr.args ?? []).map((arg) => evaluateViewExpression(arg, ctx));
      return applyPipe(expr.name, value, args);
    }
  }
}

export function evaluateViewValue(value: ViewValue, ctx: ViewExpressionContext): unknown {
  if (isViewExprNode(value)) {
    return evaluateViewExpression(value, ctx);
  }
  if (Array.isArray(value)) {
    return value.map((item) => evaluateViewValue(item, ctx));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, evaluateViewValue(entry, ctx)]),
    );
  }
  return value;
}

export const evaluateExpr = evaluateViewExpression;
export const evaluateValue = evaluateViewValue;

function resolveExprRoot(source: ViewExprSource, ctx: ViewExpressionContext): unknown {
  switch (source) {
    case "state":
      return ctx.state;
    case "query":
      return ctx.query;
    case "input":
      return ctx.input;
    case "row":
      return ctx.$row;
    case "db":
      return ctx.$db;
    case "item":
      return ctx.$item;
    case "index":
      return ctx.$index;
    case "event":
      return ctx.$event;
    case "result":
      return ctx.$result;
    case "error":
      return ctx.$error;
    case "host":
      return ctx.$host;
  }
}

function readPath(root: unknown, path: readonly string[]): unknown {
  let current = root;
  for (const segment of path) {
    if (current === null || current === undefined) return null;
    if (Array.isArray(current) && /^\d+$/.test(segment)) {
      current = current[Number(segment)];
      continue;
    }
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[segment];
      continue;
    }
    if (segment === "length" && typeof current === "string") return current.length;
    return null;
  }
  return current ?? null;
}

function applyBinary(op: ViewExprBinary["op"], left: unknown, right: unknown): unknown {
  switch (op) {
    case "===":
      return left === right;
    case "!==":
      return left !== right;
    case ">":
      return Number(left) > Number(right);
    case ">=":
      return Number(left) >= Number(right);
    case "<":
      return Number(left) < Number(right);
    case "<=":
      return Number(left) <= Number(right);
    case "+":
      return typeof left === "string" || typeof right === "string"
        ? `${left ?? ""}${right ?? ""}`
        : Number(left ?? 0) + Number(right ?? 0);
    case "-":
      return Number(left ?? 0) - Number(right ?? 0);
    case "*":
      return Number(left ?? 0) * Number(right ?? 0);
    case "/":
      return Number(left ?? 0) / Number(right ?? 0);
    case "&&":
      return Boolean(left) && Boolean(right);
    case "||":
      return Boolean(left) || Boolean(right);
  }
}

function applyPipe(name: string, value: unknown, args: readonly unknown[]): unknown {
  switch (name) {
    case "default":
      return value === null || value === undefined || value === "" ? (args[0] ?? null) : value;
    case "length":
      return Array.isArray(value) || typeof value === "string" ? value.length : 0;
    case "join":
      return Array.isArray(value) ? value.join(String(args[0] ?? ", ")) : String(value ?? "");
    case "upper":
      return String(value ?? "").toUpperCase();
    case "lower":
      return String(value ?? "").toLowerCase();
    case "title":
      return String(value ?? "").replace(/\b\w/g, (match) => match.toUpperCase());
    case "number":
      return typeof value === "number"
        ? value.toLocaleString(undefined, { maximumFractionDigits: Number(args[0] ?? 2) })
        : String(value ?? "");
    case "currency":
      return typeof value === "number"
        ? value.toLocaleString(undefined, {
            style: "currency",
            currency: String(args[0] ?? "USD"),
          })
        : String(value ?? "");
    case "percent":
      return typeof value === "number"
        ? `${(value * 100).toLocaleString(undefined, {
            maximumFractionDigits: Number(args[0] ?? 0),
          })}%`
        : String(value ?? "");
    case "date":
      return formatDateLike(value, { dateStyle: "medium" });
    case "datetime":
      return formatDateLike(value, { dateStyle: "medium", timeStyle: "short" });
    case "relative":
      return formatRelative(value);
    case "truncate": {
      const max = Number(args[0] ?? 24);
      const text = String(value ?? "");
      return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
    }
    default:
      return value;
  }
}

function formatDateLike(value: unknown, options: Intl.DateTimeFormatOptions): string {
  const date = coerceDate(value);
  return date ? date.toLocaleString(undefined, options) : String(value ?? "");
}

function formatRelative(value: unknown): string {
  const date = coerceDate(value);
  if (!date) return String(value ?? "");
  const deltaMs = date.getTime() - Date.now();
  const deltaHours = Math.round(deltaMs / 3_600_000);
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  if (Math.abs(deltaHours) < 24) return rtf.format(deltaHours, "hour");
  return rtf.format(Math.round(deltaHours / 24), "day");
}

function coerceDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

// =============================================================================
// State Path Helpers
// =============================================================================

export function getValueAtPath(root: unknown, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  return readPath(root, parts);
}

export function setValueAtPath(root: unknown, path: string, value: unknown): unknown {
  const parts = path.split(".").filter(Boolean);
  if (parts.length === 0) return value;

  const clone = deepClone(root);
  if (!isRecord(clone) && !Array.isArray(clone)) {
    return setValueAtPath({}, path, value);
  }

  let current: unknown = clone;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const next = parts[i + 1];
    if (part === undefined || next === undefined) continue;

    if (Array.isArray(current)) {
      const index = Number(part);
      if (Number.isNaN(index)) return clone;
      const existing = current[index];
      current[index] = deepClone(existing) ?? (isIndex(next) ? [] : {});
      current = current[index];
      continue;
    }

    if (!isRecord(current)) return clone;
    current[part] = deepClone(current[part]) ?? (isIndex(next) ? [] : {});
    current = current[part];
  }

  const leaf = parts[parts.length - 1];
  if (leaf === undefined) return clone;

  if (Array.isArray(current)) {
    const index = Number(leaf);
    if (Number.isNaN(index)) return clone;
    current[index] = value;
    return clone;
  }

  if (!isRecord(current)) return clone;
  current[leaf] = value;
  return clone;
}

export function patchValueAtPath(root: unknown, path: string, value: unknown): unknown {
  const existing = getValueAtPath(root, path);
  if (isRecord(existing) && isRecord(value)) {
    return setValueAtPath(root, path, { ...existing, ...value });
  }
  return setValueAtPath(root, path, value);
}

function deepClone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => deepClone(item));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, deepClone(entry)]));
  }
  return value;
}

function isIndex(segment: string): boolean {
  return /^\d+$/.test(segment);
}
