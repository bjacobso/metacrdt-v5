/**
 * Destructuring helpers: map destructure, sequential destructure, pattern dispatch.
 */
import type { SExpr } from "../reader/index.js";
import type { CoreExpr, Span } from "./core-expr.js";
import { CVar, CApp, CGet, CLit, LInt, mkBinding } from "./core-expr.js";
import { spanOf, freshInternalBinding } from "./lower-core.js";

/**
 * Lower map destructuring pattern {:keys [a b c]} into CGet bindings.
 * Produces bindings: a = (get placeholder :a), b = (get placeholder :b), etc.
 */
export function lowerMapDestructure(
  span: Span,
  mapExpr: SExpr & { _tag: "Map" },
  sourceExpr: CoreExpr,
  bindings: ReturnType<typeof mkBinding>[],
): void {
  for (const [k, v] of mapExpr.pairs) {
    if (k._tag === "Sym" && k.name === ":keys" && v._tag === "Vector") {
      for (const key of v.items) {
        if (key._tag !== "Sym") {
          continue;
        }
        lowerDestructurePattern(span, key, CGet(span, sourceExpr, `:${key.name}`), bindings);
      }
      continue;
    }
    if (k._tag === "Sym" && k.name === ":as" && v._tag === "Sym") {
      bindings.push(mkBinding(spanOf(v), v.name, sourceExpr));
      continue;
    }
    const label = k._tag === "Sym" ? k.name : k._tag === "Str" ? k.value : null;
    if (label !== null) {
      lowerDestructurePattern(span, v, CGet(span, sourceExpr, label), bindings);
    }
  }
}

/**
 * Lower sequential destructuring pattern [a b & rest] into nth/rest bindings.
 * Produces bindings: a = (nth placeholder 0), b = (nth placeholder 1), rest = (rest (rest placeholder))
 */
export function lowerSeqDestructure(
  span: Span,
  vecExpr: SExpr & { _tag: "Vector" },
  sourceExpr: CoreExpr,
  bindings: ReturnType<typeof mkBinding>[],
): void {
  for (let i = 0; i < vecExpr.items.length; i++) {
    const item = vecExpr.items[i]!;
    if (item._tag === "Sym" && item.name === "&") {
      // Rest binding
      if (i + 1 < vecExpr.items.length) {
        // Build nested rest calls: (rest (rest ... placeholder))
        let expr: CoreExpr = sourceExpr;
        for (let j = 0; j < i; j++) {
          expr = CApp(span, CVar(span, "rest"), [expr]);
        }
        lowerDestructurePattern(span, vecExpr.items[i + 1]!, expr, bindings);
      }
      break;
    }
    lowerDestructurePattern(
      span,
      item,
      CApp(span, CVar(span, "nth"), [sourceExpr, CLit(span, LInt(i))]),
      bindings,
    );
  }
}

export function lowerDestructurePattern(
  span: Span,
  pattern: SExpr,
  valueExpr: CoreExpr,
  bindings: ReturnType<typeof mkBinding>[],
): void {
  switch (pattern._tag) {
    case "Sym":
      bindings.push(mkBinding(spanOf(pattern), pattern.name, valueExpr));
      return;
    case "Map": {
      const placeholder = freshInternalBinding("destructure_map");
      const placeholderExpr = CVar(spanOf(pattern), placeholder);
      bindings.push(mkBinding(spanOf(pattern), placeholder, valueExpr));
      lowerMapDestructure(span, pattern, placeholderExpr, bindings);
      return;
    }
    case "Vector": {
      const placeholder = freshInternalBinding("destructure_seq");
      const placeholderExpr = CVar(spanOf(pattern), placeholder);
      bindings.push(mkBinding(spanOf(pattern), placeholder, valueExpr));
      lowerSeqDestructure(span, pattern, placeholderExpr, bindings);
      return;
    }
    default:
      return;
  }
}
