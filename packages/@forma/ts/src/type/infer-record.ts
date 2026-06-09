/**
 * Inference for records and field access.
 */
import { Effect, Ref } from "effect";
import type { Type, Row } from "./types.js";
import { TRow, REmpty, RExtend, tUnknown } from "./types.js";
import { applyType, applyEnv, type TypeEnv } from "./substitution.js";
import { unify } from "./unify.js";
import { InferContext } from "./context.js";
import { InferenceError } from "./errors.js";
import type { CoreExpr } from "./core-expr.js";
import { originOf } from "./infer-core.js";
import type { InferFn } from "./infer-binding.js";

// ---------------------------------------------------------------------------
// Record
// ---------------------------------------------------------------------------

export const inferRecord = (
  env: TypeEnv,
  expr: CoreExpr & { _tag: "Record" },
  inferExpr: InferFn,
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;
    let row: Row = REmpty;

    // Build row bottom-up (fields in reverse order so first field is outermost)
    const fieldTypes: Array<{ label: string; type: Type }> = [];
    for (const field of expr.fields) {
      const s = yield* Ref.get(ctx.subst);
      const envN = applyEnv(s, env);
      const ft = yield* inferExpr(envN, field.value);
      fieldTypes.push({ label: field.label, type: ft });
    }

    for (let i = fieldTypes.length - 1; i >= 0; i--) {
      const { label, type } = fieldTypes[i]!;
      const s = yield* Ref.get(ctx.subst);
      row = RExtend(label, applyType(s, type), row);
    }

    return TRow(row);
  });

// ---------------------------------------------------------------------------
// Get (record field access)
// ---------------------------------------------------------------------------

export const inferGet = (
  env: TypeEnv,
  expr: CoreExpr & { _tag: "Get" },
  inferExpr: InferFn,
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;

    const recT = yield* inferExpr(env, expr.record);

    // If the record type is Unknown (e.g., $input), allow field access and return Unknown.
    // This supports patterns like (get $input :paramName) where $input is dynamically typed.
    const resolved = applyType(yield* Ref.get(ctx.subst), recT);
    if (resolved._tag === "TCon" && resolved.name === "Unknown") {
      return tUnknown;
    }

    // The record type should be { label: resultT | restRow }
    const resultT = yield* ctx.freshTVar;
    const restRow = yield* ctx.freshRowVar;
    const expectedRecT = TRow(RExtend(expr.label, resultT, restRow));

    yield* unify(resolved, expectedRecT, originOf(expr, "get"));

    const s = yield* Ref.get(ctx.subst);
    return applyType(s, resultT);
  });
