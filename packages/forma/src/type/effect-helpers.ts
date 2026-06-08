/**
 * Effect row helpers for ambient effect tracking during inference.
 */
import { Effect, Ref } from "effect";
import type { ERow } from "./types.js";
import { EEmpty, EExtend } from "./types.js";
import { applyERow, type Subst } from "./substitution.js";
import { unifyERows } from "./unify.js";
import { InferContext } from "./context.js";
import type { AmbientEffectState } from "./context.js";
import type { Origin } from "./errors.js";
import { InferenceError } from "./errors.js";

export function closeInternalEffectVars(effect: ERow, internalVars: ReadonlySet<string>): ERow {
  switch (effect._tag) {
    case "EEmpty":
      return effect;
    case "EVar":
      return internalVars.has(effect.id) ? EEmpty : effect;
    case "EExtend":
      return EExtend(effect.label, closeInternalEffectVars(effect.tail, internalVars));
  }
}

export function resolveAmbientEffect(state: AmbientEffectState, subst: Subst): ERow {
  if (!state.touched) return EEmpty;
  return closeInternalEffectVars(applyERow(subst, state.row), state.internalVars);
}

export const makeAmbientEffectState = (): Effect.Effect<AmbientEffectState, never, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;
    const root = yield* ctx.freshEVar;
    return {
      row: root,
      touched: false,
      internalVars: root._tag === "EVar" ? new Set([root.id]) : new Set(),
    };
  });

export const withAmbientEffectScope = <A, E>(
  effect: Effect.Effect<A, E, InferContext>,
): Effect.Effect<{ value: A; effect: ERow }, E, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;
    const previous = yield* Ref.get(ctx.ambientEffects);
    const scopedState = yield* makeAmbientEffectState();
    yield* Ref.set(ctx.ambientEffects, scopedState);

    try {
      const value = yield* effect;
      const current = yield* Ref.get(ctx.ambientEffects);
      const subst = yield* Ref.get(ctx.subst);
      return {
        value,
        effect: resolveAmbientEffect(current, subst),
      };
    } finally {
      yield* Ref.set(ctx.ambientEffects, previous);
    }
  });

export const openAmbientEffect = (
  effect: ERow,
): Effect.Effect<{ row: ERow; internalVars: Set<string> }, never, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;

    switch (effect._tag) {
      case "EEmpty":
        return { row: EEmpty, internalVars: new Set<string>() };
      case "EVar":
        return { row: effect, internalVars: new Set<string>() };
      case "EExtend": {
        let openedTail: { row: ERow; internalVars: Set<string> };
        if (effect.tail._tag === "EEmpty") {
          const tail = yield* ctx.freshEVar;
          openedTail = {
            row: tail,
            internalVars: tail._tag === "EVar" ? new Set([tail.id]) : new Set<string>(),
          };
        } else {
          openedTail = yield* openAmbientEffect(effect.tail);
        }
        return {
          row: EExtend(effect.label, openedTail.row),
          internalVars: openedTail.internalVars,
        };
      }
    }
  });

export const emitAmbientEffect = (
  effect: ERow,
  origin: Origin,
): Effect.Effect<void, InferenceError, InferContext> =>
  Effect.gen(function* () {
    if (effect._tag === "EEmpty") return;

    const ctx = yield* InferContext;
    const current = yield* Ref.get(ctx.ambientEffects);
    const opened = yield* openAmbientEffect(effect);
    yield* unifyERows(current.row, opened.row, origin);
    yield* Ref.set(ctx.ambientEffects, {
      row: current.row,
      touched: true,
      internalVars: new Set([...current.internalVars, ...opened.internalVars]),
    });
  });

export function removeHandledEffects(effect: ERow, handledEffects: ReadonlySet<string>): ERow {
  switch (effect._tag) {
    case "EEmpty":
    case "EVar":
      return effect;
    case "EExtend": {
      const tail = removeHandledEffects(effect.tail, handledEffects);
      return handledEffects.has(effect.label) ? tail : EExtend(effect.label, tail);
    }
  }
}
