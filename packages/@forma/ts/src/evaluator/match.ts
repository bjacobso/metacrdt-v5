import type { SExpr } from "../reader/index.js";
import { KernelTypeError } from "../diagnostic/errors.js";
import { sourceTraceOf, type SourceTrace } from "./source-trace.js";
import { kEquals, type KValue } from "./types.js";

export type MatchPattern =
  | { readonly _tag: "Literal"; readonly value: KValue }
  | { readonly _tag: "Wildcard" }
  | { readonly _tag: "Binding"; readonly bindingIndex: number }
  | { readonly _tag: "Seq"; readonly items: readonly MatchPattern[] }
  | {
      readonly _tag: "Map";
      readonly entries: readonly {
        readonly key: string;
        readonly pattern: MatchPattern;
      }[];
    };

export interface CompiledMatchPattern {
  readonly pattern: MatchPattern;
  readonly bindingNames: readonly string[];
}

const patternCache = new WeakMap<SExpr, CompiledMatchPattern>();
const UNBOUND = Symbol("metacrdt/forma/match-unbound");

export function compileMatchPattern(
  expr: SExpr,
  trace: SourceTrace = sourceTraceOf(expr),
): CompiledMatchPattern {
  const cached = patternCache.get(expr);
  if (cached) {
    return cached;
  }

  const bindingNames: string[] = [];
  const bindingIndices = new Map<string, number>();
  const pattern = compilePatternNode(expr, bindingNames, bindingIndices, trace);
  const compiled = { pattern, bindingNames } satisfies CompiledMatchPattern;
  patternCache.set(expr, compiled);
  return compiled;
}

export function matchCompiledPattern(
  compiled: CompiledMatchPattern,
  value: KValue,
): readonly KValue[] | null {
  const bindings = new Array<KValue | typeof UNBOUND>(compiled.bindingNames.length).fill(UNBOUND);
  return matchPatternNode(compiled.pattern, value, bindings)
    ? (bindings as readonly KValue[])
    : null;
}

function compilePatternNode(
  expr: SExpr,
  bindingNames: string[],
  bindingIndices: Map<string, number>,
  trace: SourceTrace,
): MatchPattern {
  switch (expr._tag) {
    case "Num":
      return { _tag: "Literal", value: expr.value };

    case "Str":
      return { _tag: "Literal", value: expr.value };

    case "Bool":
      return { _tag: "Literal", value: expr.value };

    case "Sym": {
      if (expr.name === "_") {
        return { _tag: "Wildcard" };
      }
      if (expr.name === "nil") {
        return { _tag: "Literal", value: null };
      }
      if (expr.name === "true") {
        return { _tag: "Literal", value: true };
      }
      if (expr.name === "false") {
        return { _tag: "Literal", value: false };
      }
      if (expr.name.startsWith(":")) {
        return { _tag: "Literal", value: expr.name };
      }

      const existingIndex = bindingIndices.get(expr.name);
      if (existingIndex !== undefined) {
        return { _tag: "Binding", bindingIndex: existingIndex };
      }

      const bindingIndex = bindingNames.length;
      bindingNames.push(expr.name);
      bindingIndices.set(expr.name, bindingIndex);
      return { _tag: "Binding", bindingIndex };
    }

    case "List":
      return {
        _tag: "Seq",
        items: expr.items.map((item) =>
          compilePatternNode(item, bindingNames, bindingIndices, trace),
        ),
      };

    case "Vector":
      return {
        _tag: "Seq",
        items: expr.items.map((item) =>
          compilePatternNode(item, bindingNames, bindingIndices, trace),
        ),
      };

    case "Map":
      return {
        _tag: "Map",
        entries: expr.pairs.map(([keyExpr, valueExpr]) => ({
          key: compileMapPatternKey(keyExpr, trace),
          pattern: compilePatternNode(valueExpr, bindingNames, bindingIndices, trace),
        })),
      };

    case "Set":
      throw new KernelTypeError({
        message: "match patterns do not support set literals",
        expected: "literal, symbol, list, vector, or map pattern",
        got: "set literal",
        loc: trace.loc,
        ...(trace.macroOrigins ? { macroOrigins: trace.macroOrigins } : {}),
      });

    case "Error":
      throw new KernelTypeError({
        message: `Invalid match pattern: ${expr.message}`,
        expected: "valid pattern",
        got: "parse error",
        loc: trace.loc,
        ...(trace.macroOrigins ? { macroOrigins: trace.macroOrigins } : {}),
      });
  }
}

function compileMapPatternKey(expr: SExpr, trace: SourceTrace): string {
  if (expr._tag === "Str") {
    return expr.value;
  }
  if (expr._tag === "Sym" && expr.name.startsWith(":")) {
    return expr.name;
  }

  throw new KernelTypeError({
    message: "match map pattern keys must be string or keyword literals",
    expected: "string or keyword literal",
    got: expr._tag === "Sym" ? expr.name : expr._tag,
    loc: trace.loc,
    ...(trace.macroOrigins ? { macroOrigins: trace.macroOrigins } : {}),
  });
}

function matchPatternNode(
  pattern: MatchPattern,
  value: KValue,
  bindings: (KValue | typeof UNBOUND)[],
): boolean {
  switch (pattern._tag) {
    case "Literal":
      return kEquals(pattern.value, value);

    case "Wildcard":
      return true;

    case "Binding": {
      const existing = bindings[pattern.bindingIndex];
      if (existing === UNBOUND) {
        bindings[pattern.bindingIndex] = value;
        return true;
      }
      return kEquals(existing as KValue, value);
    }

    case "Seq":
      return (
        Array.isArray(value) &&
        value.length === pattern.items.length &&
        pattern.items.every((item, index) => matchPatternNode(item, value[index]!, bindings))
      );

    case "Map":
      return (
        value instanceof Map &&
        pattern.entries.every((entry) => {
          if (!value.has(entry.key)) {
            return false;
          }
          return matchPatternNode(entry.pattern, value.get(entry.key) ?? null, bindings);
        })
      );
  }
}
