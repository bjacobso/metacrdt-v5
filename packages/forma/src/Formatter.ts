/**
 * Lisp Formatter / Pretty Printer
 *
 * Provides canonical pretty-printing for parsed S-expressions and raw
 * source strings.
 */

import { Effect } from "effect";
import { parseManyToSExpr } from "./reader/index.js";
import type { Loc, ParseError, SExpr } from "./reader/index.js";

export interface LispFormatOptions {
  /** Soft wrap column for inline rendering. Default: 80 */
  readonly softWrap?: number;
  /** Indentation width. Default: 2 */
  readonly indentSize?: number;
}

const DEFAULT_SOFT_WRAP = 80;
const DEFAULT_INDENT_SIZE = 2;

function escapeString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

function sym(name: string, loc?: Loc): SExpr {
  return { _tag: "Sym", name, ...(loc ? { loc } : {}) } as SExpr;
}

function list(items: readonly SExpr[], loc?: Loc): SExpr {
  return { _tag: "List", items, ...(loc ? { loc } : {}) } as SExpr;
}

function vector(items: readonly SExpr[], loc?: Loc): SExpr {
  return { _tag: "Vector", items, ...(loc ? { loc } : {}) } as SExpr;
}

function canonicalTypeName(name: string): string {
  switch (name) {
    case "Str":
      return "String";
    case "Num":
      return "Number";
    case "Bool":
      return "Boolean";
    case "Nil":
      return "Unit";
    default:
      return name;
  }
}

function canonicalizeTypeExpr(expr: SExpr): SExpr {
  switch (expr._tag) {
    case "Sym":
      return sym(canonicalTypeName(expr.name), expr.loc);
    case "List": {
      if (expr.items.length === 0) return expr;
      return list(expr.items.map(canonicalizeTypeExpr), expr.loc);
    }
    case "Vector":
      return vector(
        expr.items.map((item) => {
          if (item._tag === "List" && item.items.length >= 2) {
            return list(
              [item.items[0]!, canonicalizeTypeExpr(item.items[1]!), ...item.items.slice(2)],
              item.loc,
            );
          }
          if (item._tag === "Sym" && item.name === "...") {
            return item;
          }
          return canonicalizeTypeExpr(item);
        }),
        expr.loc,
      );
    case "Map":
      return {
        ...expr,
        pairs: expr.pairs.map(
          ([k, v]) => [canonicalizeTypeExpr(k), canonicalizeTypeExpr(v)] as const,
        ),
      };
    case "Set":
      return { ...expr, items: expr.items.map(canonicalizeTypeExpr) };
    default:
      return expr;
  }
}

function canonicalizePublicSyntax(expr: SExpr): SExpr {
  switch (expr._tag) {
    case "List": {
      if (expr.items.length === 0) return expr;
      const [head, ...rest] = expr.items;
      if (head?._tag === "Sym") {
        if (head.name === "def") {
          return list([sym("define", head.loc), ...rest.map(canonicalizePublicSyntax)], expr.loc);
        }
        if (head.name === "defn" && rest.length >= 2) {
          return list(
            [
              sym("define", head.loc),
              canonicalizePublicSyntax(rest[0]!),
              list(
                [
                  sym("fn", head.loc),
                  canonicalizePublicSyntax(rest[1]!),
                  ...rest.slice(2).map(canonicalizePublicSyntax),
                ],
                head.loc,
              ),
            ],
            expr.loc,
          );
        }
        if (head.name === "def-macro") {
          return list(
            [sym("define-macro", head.loc), ...rest.map(canonicalizePublicSyntax)],
            expr.loc,
          );
        }
        if (head.name === "defclass") {
          return list(
            [
              sym("define-typeclass", head.loc),
              ...rest.map((item, idx) => {
                if (idx > 0 && item._tag === "List" && item.items.length === 2) {
                  return list([item.items[0]!, canonicalizeTypeExpr(item.items[1]!)], item.loc);
                }
                return canonicalizePublicSyntax(item);
              }),
            ],
            expr.loc,
          );
        }
        if (head.name === "::" && rest.length === 2) {
          return list(
            [
              sym(":", head.loc),
              canonicalizePublicSyntax(rest[0]!),
              canonicalizeTypeExpr(rest[1]!),
            ],
            expr.loc,
          );
        }
        if (head.name === ":" && rest.length === 2) {
          return list(
            [
              sym(":", head.loc),
              canonicalizePublicSyntax(rest[0]!),
              canonicalizeTypeExpr(rest[1]!),
            ],
            expr.loc,
          );
        }
        if (head.name === "deftype" || head.name === "data" || head.name === "define-type") {
          const typeHead = rest[0];
          if (typeHead?._tag === "List") {
            return list(
              [
                sym("define-type", head.loc),
                canonicalizePublicSyntax(typeHead),
                ...rest
                  .slice(1)
                  .map((ctor) =>
                    ctor._tag === "List"
                      ? list(
                          [ctor.items[0]!, ...ctor.items.slice(1).map(canonicalizeTypeExpr)],
                          ctor.loc,
                        )
                      : canonicalizePublicSyntax(ctor),
                  ),
              ],
              expr.loc,
            );
          }
          if (rest.length === 2) {
            return list(
              [
                sym("define-type", head.loc),
                canonicalizePublicSyntax(rest[0]!),
                canonicalizeTypeExpr(rest[1]!),
              ],
              expr.loc,
            );
          }
        }
      }
      return list(expr.items.map(canonicalizePublicSyntax), expr.loc);
    }
    case "Vector":
      return vector(expr.items.map(canonicalizePublicSyntax), expr.loc);
    case "Map":
      return {
        ...expr,
        pairs: expr.pairs.map(
          ([k, v]) => [canonicalizePublicSyntax(k), canonicalizePublicSyntax(v)] as const,
        ),
      };
    case "Set":
      return { ...expr, items: expr.items.map(canonicalizeTypeExpr) };
    default:
      return expr;
  }
}

function flat(expr: SExpr): string {
  switch (expr._tag) {
    case "Num":
      return String(expr.value);
    case "Str":
      return `"${escapeString(expr.value)}"`;
    case "Bool":
      return expr.value ? "true" : "false";
    case "Sym":
      return expr.name;
    case "Error":
      return `<error: ${expr.message}>`;
    case "List": {
      const items = expr.items.map(flat).join(" ");
      return `(${items})`;
    }
    case "Vector": {
      const items = expr.items.map(flat).join(" ");
      return `[${items}]`;
    }
    case "Map": {
      const pairs = expr.pairs.map(([k, v]) => `${flat(k)} ${flat(v)}`).join(" ");
      return `{${pairs}}`;
    }
    case "Set": {
      const items = expr.items.map(flat).join(" ");
      return `{${items}}`;
    }
  }
}

function lines(
  expr: SExpr,
  indent: number,
  softWrap: number,
  indentSize: number,
): readonly string[] {
  const pad = " ".repeat(indent);

  switch (expr._tag) {
    case "Num":
      return [`${pad}${expr.value}`];
    case "Str":
      return [`${pad}"${escapeString(expr.value)}"`];
    case "Bool":
      return [`${pad}${expr.value ? "true" : "false"}`];
    case "Sym":
      return [`${pad}${expr.name}`];
    case "Error":
      return [`${pad}<error: ${expr.message}>`];

    case "List": {
      if (expr.items.length === 0) return [`${pad}()`];

      const oneLine = flat(expr);
      if (indent + oneLine.length <= softWrap) {
        return [`${pad}${oneLine}`];
      }

      const head = expr.items[0]!;
      const headFlat = flat(head);
      const result: string[] = [`${pad}(${headFlat}`];

      for (let i = 1; i < expr.items.length; i++) {
        result.push(...lines(expr.items[i]!, indent + indentSize, softWrap, indentSize));
      }

      result[result.length - 1] += ")";
      return result;
    }

    case "Vector": {
      if (expr.items.length === 0) return [`${pad}[]`];

      const oneLine = flat(expr);
      if (indent + oneLine.length <= softWrap) {
        return [`${pad}${oneLine}`];
      }

      const result: string[] = [`${pad}[`];
      for (const item of expr.items) {
        result.push(...lines(item, indent + indentSize, softWrap, indentSize));
      }
      result[result.length - 1] += "]";
      return result;
    }

    case "Map": {
      if (expr.pairs.length === 0) return [`${pad}{}`];

      const oneLine = flat(expr);
      if (indent + oneLine.length <= softWrap) {
        return [`${pad}${oneLine}`];
      }

      const result: string[] = [`${pad}{`];
      for (const [k, v] of expr.pairs) {
        const keyFlat = flat(k);
        const valueFlat = flat(v);

        if (indent + indentSize + keyFlat.length + 1 + valueFlat.length <= softWrap) {
          result.push(`${" ".repeat(indent + indentSize)}${keyFlat} ${valueFlat}`);
        } else {
          result.push(`${" ".repeat(indent + indentSize)}${keyFlat}`);
          result.push(...lines(v, indent + indentSize * 2, softWrap, indentSize));
        }
      }

      result[result.length - 1] += "}";
      return result;
    }

    case "Set": {
      if (expr.items.length === 0) return [`${pad}{}`];

      const oneLine = flat(expr);
      if (indent + oneLine.length <= softWrap) {
        return [`${pad}${oneLine}`];
      }

      const result: string[] = [`${pad}{`];
      for (const item of expr.items) {
        result.push(...lines(item, indent + indentSize, softWrap, indentSize));
      }
      result[result.length - 1] += "}";
      return result;
    }
  }
}

/**
 * Pretty-print a single S-expression.
 */
export function formatSExpr(expr: SExpr, options?: LispFormatOptions): string {
  const softWrap = options?.softWrap ?? DEFAULT_SOFT_WRAP;
  const indentSize = options?.indentSize ?? DEFAULT_INDENT_SIZE;
  const canonical = canonicalizePublicSyntax(expr);

  const oneLine = flat(canonical);
  if (oneLine.length <= softWrap) return oneLine;

  return lines(canonical, 0, softWrap, indentSize).join("\n");
}

/**
 * Pretty-print multiple top-level S-expressions.
 */
export function formatSExprMany(exprs: readonly SExpr[], options?: LispFormatOptions): string {
  const softWrap = options?.softWrap ?? DEFAULT_SOFT_WRAP;
  const indentSize = options?.indentSize ?? DEFAULT_INDENT_SIZE;

  const rendered = exprs.map((expr) => {
    const canonical = canonicalizePublicSyntax(expr);
    const oneLine = flat(canonical);
    if (oneLine.length <= softWrap) return oneLine;
    return lines(canonical, 0, softWrap, indentSize).join("\n");
  });

  return rendered.join("\n").trimEnd() + "\n";
}

/**
 * Parse and pretty-print raw Lisp source.
 */
export function formatLispSource(
  source: string,
  options?: LispFormatOptions,
): Effect.Effect<string, ParseError> {
  return Effect.gen(function* () {
    const exprs = yield* parseManyToSExpr(source);
    return formatSExprMany(exprs, options);
  });
}
