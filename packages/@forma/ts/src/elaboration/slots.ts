/**
 * Slot Evaluation
 *
 * Evaluates slots based on their mode:
 * - immediate: Evaluate at compile time
 * - deferred: Type-check only
 * - quoted: Pass through AST
 * - pattern: Extract from pattern
 */

import { Effect } from "effect";
import type { SExpr } from "../reader/index.js";
import type { SlotDefinition, EvaluatedSlot } from "./types.js";
import { EvaluatedSlots } from "./types.js";
import type { CompileContext, CompileError } from "./context.js";
import { evaluate } from "../evaluator/eval.js";
import { PreludeEnv } from "../expander/prelude.js";
import type { Type } from "../type/types.js";
import { tUnknown } from "../type/types.js";

/**
 * Evaluate a single slot based on its definition.
 */
export function evaluateSlot(
  ast: SExpr,
  def: SlotDefinition,
  ctx: CompileContext,
): Effect.Effect<EvaluatedSlot, CompileError, PreludeEnv> {
  return Effect.gen(function* () {
    switch (def.mode) {
      case "immediate": {
        // Evaluate at compile time
        const result = yield* Effect.mapError(
          evaluate(astToSource(ast), {
            stepLimit: ctx.stepLimit,
            builtins: ctx.builtins,
            env: ctx.env,
          }),
          (e) => ctx.error(`Evaluation error in ${def.name}: ${e.message}`, ast.loc),
        );

        return { mode: "immediate" as const, value: result.value };
      }

      case "deferred": {
        // Preserve AST for runtime evaluation
        // Type checking can be added via HM inferSource if needed
        const type = def.type ?? tUnknown;

        return { mode: "deferred" as const, ast, type };
      }

      case "quoted": {
        // Pass through unchanged
        return { mode: "quoted" as const, ast };
      }

      case "pattern": {
        // Pass through for pattern matching
        return { mode: "pattern" as const, ast };
      }
    }
  });
}

/**
 * Evaluate all slots for a form based on slot definitions.
 *
 * This is a simplified implementation that assumes slots appear
 * in order as children of the form. More sophisticated extraction
 * can be done with custom extractSlots methods on handlers.
 */
export function evaluateSlots(
  expr: SExpr,
  defs: readonly SlotDefinition[],
  ctx: CompileContext,
): Effect.Effect<EvaluatedSlots, CompileError, PreludeEnv> {
  return Effect.gen(function* () {
    const slots = new EvaluatedSlots();

    // For list forms, children are the items after the form name
    if (expr._tag !== "List" || expr.items.length === 0) {
      return slots;
    }

    const items = expr.items.slice(1); // Skip form name

    // Simple positional matching for now
    // A more sophisticated implementation would use pattern matching
    for (let i = 0; i < defs.length && i < items.length; i++) {
      const def = defs[i]!;
      const item = items[i]!;
      const slot = yield* evaluateSlot(item, def, ctx);
      slots.set(def.name, slot);
    }

    // Check required slots
    for (const def of defs) {
      if (def.required && !slots.has(def.name)) {
        ctx.addError(ctx.error(`Missing required slot: ${def.name}`, expr.loc));
      }
    }

    return slots;
  });
}

/**
 * Convert an AST node back to source code (simplified).
 * This is used for immediate evaluation of slot values.
 */
function astToSource(ast: SExpr): string {
  switch (ast._tag) {
    case "Num":
      return String(ast.value);
    case "Str":
      return JSON.stringify(ast.value);
    case "Bool":
      return String(ast.value);
    case "Sym":
      return ast.name;
    case "Vector":
      return `[${ast.items.map(astToSource).join(" ")}]`;
    case "List":
      return `(${ast.items.map(astToSource).join(" ")})`;
    case "Map":
      return `{${ast.pairs.map(([k, v]) => `${astToSource(k)} ${astToSource(v)}`).join(" ")}}`;
    case "Set":
      return `{${ast.items.map(astToSource).join(" ")}}`;
    case "Error":
      return `<error: ${ast.message}>`;
  }
}

/**
 * Extract the type for a slot from its definition or infer it.
 */
export function getSlotType(slot: EvaluatedSlot, def: SlotDefinition): Type {
  if (def.type) {
    return def.type;
  }

  if (slot.mode === "deferred") {
    return slot.type;
  }

  return tUnknown;
}
