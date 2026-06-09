import type { SExpr, Loc } from "../reader/index.js";
import type { Env } from "../Env.js";
import type { KValue } from "./types.js";

// ---------------------------------------------------------------------------
// Destructuring helpers
// ---------------------------------------------------------------------------

/**
 * Expand map destructuring pattern `{:keys [a b c]}` into let-binding pairs
 * for use in fn param desugaring. Produces SExpr pairs: [name-sym, (get placeholder :name)]
 */
export function expandMapDestructure(
  mapExpr: SExpr & { _tag: "Map" },
  placeholder: SExpr,
  loc: Loc,
  bindings: SExpr[],
): void {
  for (const [k, v] of mapExpr.pairs) {
    if (k._tag === "Sym" && k.name === ":keys" && v._tag === "Vector") {
      // {:keys [a b c]} — extract each key
      for (const key of v.items) {
        if (key._tag !== "Sym") {
          continue;
        }
        bindDestructurePattern(
          key,
          {
            _tag: "List" as const,
            items: [
              { _tag: "Sym" as const, name: "get", loc },
              placeholder,
              { _tag: "Sym" as const, name: `:${key.name}`, loc: key.loc },
            ],
            loc,
          },
          loc,
          bindings,
        );
      }
      continue;
    }
    if (k._tag === "Sym" && k.name === ":as" && v._tag === "Sym") {
      // {:as whole} — bind the whole value
      bindings.push({ _tag: "Sym" as const, name: v.name, loc: v.loc });
      bindings.push(placeholder);
      continue;
    }
    bindDestructurePattern(
      v,
      {
        _tag: "List" as const,
        items: [{ _tag: "Sym" as const, name: "get", loc }, placeholder, k],
        loc,
      },
      loc,
      bindings,
    );
  }
}

/**
 * Expand sequential destructuring pattern `[a b & rest]` into let-binding pairs.
 */
export function expandSeqDestructure(
  vecExpr: SExpr & { _tag: "Vector" },
  placeholder: SExpr,
  loc: Loc,
  bindings: SExpr[],
): void {
  let restIdx = -1;
  for (let i = 0; i < vecExpr.items.length; i++) {
    const item = vecExpr.items[i]!;
    if (item._tag === "Sym" && item.name === "&") {
      restIdx = i;
      break;
    }
    bindDestructurePattern(
      item,
      {
        _tag: "List" as const,
        items: [
          { _tag: "Sym" as const, name: "nth", loc },
          placeholder,
          { _tag: "Num" as const, value: i, loc },
        ],
        loc,
      },
      loc,
      bindings,
    );
  }
  // Rest binding: name = (drop placeholder restIdx)
  if (restIdx >= 0 && restIdx + 1 < vecExpr.items.length) {
    // Desugar to repeated (rest ...) calls to skip past positional args
    let expr: SExpr = placeholder;
    for (let j = 0; j < restIdx; j++) {
      expr = {
        _tag: "List" as const,
        items: [{ _tag: "Sym" as const, name: "rest", loc }, expr],
        loc,
      };
    }
    bindDestructurePattern(vecExpr.items[restIdx + 1]!, expr, loc, bindings);
  }
}

export function bindDestructurePattern(
  pattern: SExpr,
  valueExpr: SExpr,
  loc: Loc,
  bindings: SExpr[],
): void {
  switch (pattern._tag) {
    case "Sym":
      bindings.push({ _tag: "Sym" as const, name: pattern.name, loc: pattern.loc });
      bindings.push(valueExpr);
      return;
    case "Map": {
      const placeholder = `__destructure_map_${bindings.length / 2}`;
      const placeholderExpr = { _tag: "Sym" as const, name: placeholder, loc: pattern.loc };
      bindings.push(placeholderExpr, valueExpr);
      expandMapDestructure(pattern, placeholderExpr, loc, bindings);
      return;
    }
    case "Vector": {
      const placeholder = `__destructure_seq_${bindings.length / 2}`;
      const placeholderExpr = { _tag: "Sym" as const, name: placeholder, loc: pattern.loc };
      bindings.push(placeholderExpr, valueExpr);
      expandSeqDestructure(pattern, placeholderExpr, loc, bindings);
      return;
    }
    default:
      return;
  }
}

/**
 * Apply map destructuring at runtime in let bindings.
 * Value must be a Map; keys are extracted and bound.
 */
export function applyMapDestructureRuntime(
  mapExpr: SExpr & { _tag: "Map" },
  val: KValue,
  env: Env,
): Env {
  let result = env;
  const map = val instanceof Map ? (val as ReadonlyMap<string, KValue>) : null;

  for (const [k, v] of mapExpr.pairs) {
    if (k._tag === "Sym" && k.name === ":keys" && v._tag === "Vector") {
      for (const key of v.items) {
        if (key._tag !== "Sym") {
          continue;
        }
        const extracted = map?.get(`:${key.name}`) ?? map?.get(key.name) ?? null;
        result = applyDestructureRuntime(key, extracted, result);
      }
      continue;
    }
    if (k._tag === "Sym" && k.name === ":as" && v._tag === "Sym") {
      result = result.bind(v.name, val);
      continue;
    }
    const mapKey = k._tag === "Sym" ? k.name : k._tag === "Str" ? k.value : null;
    const extracted = mapKey === null ? null : (map?.get(mapKey) ?? null);
    result = applyDestructureRuntime(v, extracted, result);
  }
  return result;
}

/**
 * Apply sequential destructuring at runtime in let bindings.
 * Value must be a list (array); elements are bound positionally.
 */
export function applySeqDestructureRuntime(
  vecExpr: SExpr & { _tag: "Vector" },
  val: KValue,
  env: Env,
): Env {
  let result = env;
  const arr = Array.isArray(val) ? (val as readonly KValue[]) : [];

  for (let i = 0; i < vecExpr.items.length; i++) {
    const item = vecExpr.items[i]!;
    if (item._tag === "Sym" && item.name === "&") {
      // Rest binding
      if (i + 1 < vecExpr.items.length) {
        result = applyDestructureRuntime(vecExpr.items[i + 1]!, arr.slice(i), result);
      }
      break;
    }
    result = applyDestructureRuntime(item, arr[i] ?? null, result);
  }
  return result;
}

export function applyDestructureRuntime(pattern: SExpr, val: KValue, env: Env): Env {
  switch (pattern._tag) {
    case "Sym":
      return env.bind(pattern.name, val);
    case "Map":
      return applyMapDestructureRuntime(pattern, val, env);
    case "Vector":
      return applySeqDestructureRuntime(pattern, val, env);
    default:
      return env;
  }
}
