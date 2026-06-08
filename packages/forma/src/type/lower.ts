/**
 * Lower SExpr -> CoreExpr — entry point.
 *
 * Desugars Lisp surface syntax into the typed core IR:
 *  - (fn [params] body...) -> Lam { params, body: Do(exprs) }
 *  - (let [x e ...] body...) -> Let { bindings, body }
 *  - (define name expr) -> Def { name, expr }
 *  - (if c t e) -> If { cond, then, else }
 *  - (do e1 e2 ...) -> nested Let or last expr
 *  - {k1 v1 k2 v2} -> Record
 *  - (get rec :label) -> Get
 *  - (f args...) -> App
 *  - symbols -> Var
 *  - literals -> Lit
 *
 * Sugar forms (not, when, cond, and, or, ->, ->>) are expanded at the
 * SExpr level by expand.ts BEFORE lowering, so the lowerer only handles
 * core forms.
 */
import type { SExpr } from "../reader/index.js";
import type { CoreExpr } from "./core-expr.js";
import { CDef } from "./core-expr.js";
import { InferenceError } from "./errors.js";
import type { DSLTypeProvider } from "./dsl-provider.js";
import { defaultBuiltins } from "../builtins/index.js";
import { expandKernelExprsSync } from "../evaluator/frontend.js";
import {
  lower,
  setDslProvider,
  setInternalBindingCounter,
  getInternalBindingCounter,
  getDslProvider,
} from "./lower-core.js";
import { parseTypeExpr } from "./type-parser.js";

// Re-export for consumers
export { lower } from "./lower-core.js";
export { parseTypeExpr } from "./type-parser.js";

// ---------------------------------------------------------------------------
// Program lowering with type signature support
// ---------------------------------------------------------------------------

/**
 * Check if an SExpr is a canonical type signature form (: name Type).
 */
function isTypeSig(expr: SExpr): expr is SExpr & { _tag: "List" } {
  return (
    expr._tag === "List" &&
    expr.items.length === 3 &&
    expr.items[0]?._tag === "Sym" &&
    expr.items[0].name === ":" &&
    expr.items[1]?._tag === "Sym"
  );
}

/**
 * Check if an SExpr is a canonical define form (define name expr).
 */
function isDef(expr: SExpr): expr is SExpr & { _tag: "List" } {
  return (
    expr._tag === "List" &&
    expr.items.length >= 3 &&
    expr.items[0]?._tag === "Sym" &&
    (expr.items[0].name === "define" || expr.items[0].name === "define-operation")
  );
}

/**
 * Lower a sequence of top-level SExprs into CoreExprs.
 *
 * Handles (: name Type) signatures that must immediately precede a matching
 * define form.
 *
 * @param exprs The parsed SExprs to lower
 * @param dslProvider Optional DSL type provider for recognizing DSL forms.
 *   When provided, forms like (entity ...) are lowered to CDSLForm nodes
 *   instead of CApp nodes (which would fail with "Unbound variable").
 */
export function lowerProgram(exprs: readonly SExpr[], dslProvider?: DSLTypeProvider): CoreExpr[] {
  // Set the module-level provider for use by lower/lowerList/lowerDSLForm
  const prevProvider = getDslProvider();
  const prevInternalBindingCounter = getInternalBindingCounter();
  setDslProvider(dslProvider);
  setInternalBindingCounter(0);
  const expanded = expandKernelExprsSync(exprs, { builtins: defaultBuiltins }).expanded;

  try {
    const result: CoreExpr[] = [];
    let i = 0;

    while (i < expanded.length) {
      const expr = expanded[i]!;

      // Check for type signature
      if (isTypeSig(expr)) {
        const sigItems = expr.items;
        const sigNameSym = sigItems[1]!;
        if (sigNameSym._tag !== "Sym") {
          throw new InferenceError({ message: "(:) name must be a symbol" });
        }
        const sigName = sigNameSym.name;
        const typeExpr = parseTypeExpr(sigItems[2]!);

        // Must be immediately followed by matching define
        const next = expanded[i + 1];
        if (!next || !isDef(next)) {
          throw new InferenceError({
            message: `Type signature for '${sigName}' must be immediately followed by (define ${sigName} ...) or (define-operation ${sigName} ...)`,
          });
        }

        const defItems = next.items;
        const defNameExpr = defItems[1]!;
        const defName =
          defNameExpr._tag === "Sym"
            ? defNameExpr.name
            : defNameExpr._tag === "List" && defNameExpr.items[0]?._tag === "Sym"
              ? defNameExpr.items[0].name
              : undefined;
        if (defName !== sigName) {
          throw new InferenceError({
            message: `Type signature for '${sigName}' must be followed by a matching definition, found ${defName ?? "?"}`,
          });
        }

        // Lower define with signature attached
        const lowered = lower(next);
        if (lowered._tag !== "Def") {
          throw new InferenceError({
            message: `Type signature for '${sigName}' must be followed by a definition`,
          });
        }
        result.push(CDef(lowered.span, sigName, lowered.expr, typeExpr));
        i += 2; // Skip both signature and definition
      } else {
        result.push(lower(expr));
        i++;
      }
    }

    return result;
  } finally {
    // Restore previous provider (for safety in nested calls)
    setDslProvider(prevProvider);
    setInternalBindingCounter(prevInternalBindingCounter);
  }
}
