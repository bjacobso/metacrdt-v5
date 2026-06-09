/**
 * Inference for control flow: if (with type narrowing) and match (with exhaustiveness).
 */
import { Effect, Ref } from "effect";
import type { Type, Scheme } from "./types.js";
import { TApp, TCon, tNil, tStr, mono, showType } from "./types.js";
import { applyType, applyEnv, type TypeEnv } from "./substitution.js";
import { unify } from "./unify.js";
import { InferContext } from "./context.js";
import { InferenceError } from "./errors.js";
import type { CoreExpr } from "./core-expr.js";
import { originOf, detectTypeNarrowing } from "./infer-core.js";
import { instantiate } from "./scheme-ops.js";
import type { InferFn } from "./infer-binding.js";

// ---------------------------------------------------------------------------
// If
// ---------------------------------------------------------------------------

export const inferIf = (
  env: TypeEnv,
  expr: CoreExpr & { _tag: "If" },
  inferExpr: InferFn,
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;

    yield* inferExpr(env, expr.cond);

    // Detect type narrowing from predicate conditions
    const narrowing = detectTypeNarrowing(expr.cond);

    const s1 = yield* Ref.get(ctx.subst);
    let thenEnv = applyEnv(s1, env);

    if (narrowing) {
      // Narrow the variable's type in the then-branch
      const narrowedEnv = new Map(thenEnv);
      narrowedEnv.set(narrowing.varName, mono(narrowing.narrowedType));
      thenEnv = narrowedEnv;
    }

    const thenT = yield* inferExpr(thenEnv, expr.then);

    const s2 = yield* Ref.get(ctx.subst);
    const elseT = yield* inferExpr(applyEnv(s2, env), expr.else_);

    // Check for LNil literals introduced by when/unless/if-without-else sugar.
    const isNilThen = expr.then._tag === "Lit" && expr.then.lit._tag === "LNil";
    const isNilElse = expr.else_._tag === "Lit" && expr.else_.lit._tag === "LNil";

    if (isNilThen) {
      const sFinal = yield* Ref.get(ctx.subst);
      return applyType(sFinal, elseT);
    }

    if (!isNilElse) {
      const subst = yield* Ref.get(ctx.subst);
      const resolvedThen = applyType(subst, thenT);
      const resolvedElse = applyType(subst, elseT);
      const thenEffect = operationalEffectParts(resolvedThen);
      const elseEffect = operationalEffectParts(resolvedElse);

      if (thenEffect || elseEffect) {
        const thenSuccess = thenEffect?.success ?? resolvedThen;
        const elseSuccess = elseEffect?.success ?? resolvedElse;
        yield* unify(thenSuccess, elseSuccess, originOf(expr, "if-branches"));
        const mergedSubst = yield* Ref.get(ctx.subst);
        return operationalEffectType(
          applyType(mergedSubst, thenSuccess),
          mergeTypeSets(thenEffect?.errors ?? [], elseEffect?.errors ?? []),
          mergeTypeSets(thenEffect?.requirements ?? [], elseEffect?.requirements ?? []),
        );
      }

      yield* unify(resolvedThen, resolvedElse, originOf(expr, "if-branches"));
    }

    const sFinal = yield* Ref.get(ctx.subst);
    return applyType(sFinal, thenT);
  });

interface OperationalEffectParts {
  readonly success: Type;
  readonly errors: readonly Type[];
  readonly requirements: readonly Type[];
}

function namedTypeApp(type: Type, name: string): readonly Type[] | undefined {
  if (type._tag !== "TApp" || type.con._tag !== "TCon" || type.con.name !== name) {
    return undefined;
  }
  return type.args;
}

function operationalEffectParts(type: Type): OperationalEffectParts | undefined {
  if (type._tag !== "TApp" || type.con._tag !== "TCon" || type.con.name !== "Effect") {
    return undefined;
  }
  const [success, errors, requirements] = type.args;
  if (!success || !errors || !requirements || type.args.length !== 3) {
    return undefined;
  }
  const errorItems = namedTypeApp(errors, "ErrorSet");
  const requirementItems = namedTypeApp(requirements, "RequirementSet");
  if (!errorItems || !requirementItems) {
    return undefined;
  }
  return { success, errors: errorItems, requirements: requirementItems };
}

function mergeTypeSets(left: readonly Type[], right: readonly Type[]): readonly Type[] {
  const seen = new Set<string>();
  const merged: Type[] = [];
  for (const type of [...left, ...right]) {
    const key = showType(type);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(type);
  }
  return merged;
}

function operationalEffectType(
  success: Type,
  errors: readonly Type[],
  requirements: readonly Type[],
): Type {
  return TApp(TCon("Effect"), [
    success,
    TApp(TCon("ErrorSet"), errors),
    TApp(TCon("RequirementSet"), requirements),
  ]);
}

// ---------------------------------------------------------------------------
// Match (pattern matching)
// ---------------------------------------------------------------------------

export const inferMatch = (
  env: TypeEnv,
  expr: CoreExpr & { _tag: "Match" },
  inferExpr: InferFn,
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;

    // Infer the scrutinee type
    const scrutT = yield* inferExpr(env, expr.scrutinee);

    // Infer each arm
    let resultT: Type | undefined;
    let resultHasOperationalEffect = false;
    let accumulatedErrors: readonly Type[] = [];
    let accumulatedRequirements: readonly Type[] = [];

    for (const arm of expr.arms) {
      const s = yield* Ref.get(ctx.subst);
      const envN = applyEnv(s, env);
      const scrut = applyType(s, scrutT);

      let armEnv: Map<string, Scheme>;

      if (arm.pattern._tag === "PWild") {
        armEnv = new Map(envN);
      } else if (arm.pattern.name.startsWith(":") && arm.pattern.vars.length === 0) {
        yield* unify(tStr, scrut, originOf(expr, "match-pattern"));
        armEnv = envN;
      } else {
        // Constructor pattern
        const conName = arm.pattern.name;

        // Look up constructor scheme in the environment
        const conScheme = envN.get(conName) ?? ctx.builtinScheme(conName);
        if (!conScheme) {
          return yield* ctx.fail(originOf(expr, "match"), {
            message: `Unknown constructor: ${conName}`,
          });
        }

        // Instantiate the constructor scheme
        const conT = yield* instantiate(conScheme);

        if (arm.pattern.vars.length === 0) {
          // Nullary constructor: conT should unify with scrutinee
          yield* unify(conT, scrut, originOf(expr, "match-pattern"));
          armEnv = envN;
        } else {
          // Constructor with fields: conT is field1 -> field2 -> ... -> ResultType
          // Extract field types by peeling off TFun layers
          const fieldTypes: Type[] = [];
          let cur = conT;
          for (let i = 0; i < arm.pattern.vars.length; i++) {
            if (cur._tag !== "TFun") {
              return yield* ctx.fail(originOf(expr, "match"), {
                message: `Constructor ${conName} expects ${i} field(s) but pattern has ${arm.pattern.vars.length}`,
              });
            }
            fieldTypes.push(cur.arg);
            cur = cur.res;
          }
          // cur is now the result type — unify with scrutinee
          yield* unify(
            cur,
            applyType(yield* Ref.get(ctx.subst), scrut),
            originOf(expr, "match-pattern"),
          );

          // Bind pattern variables
          armEnv = new Map(applyEnv(yield* Ref.get(ctx.subst), envN));
          for (let i = 0; i < arm.pattern.vars.length; i++) {
            const varName = arm.pattern.vars[i]!;
            const fieldT = applyType(yield* Ref.get(ctx.subst), fieldTypes[i]!);
            armEnv.set(varName, mono(fieldT));
          }
        }
      }

      // Infer the arm body
      const bodyS = yield* Ref.get(ctx.subst);
      const bodyEnv = applyEnv(bodyS, armEnv);
      const bodyT = yield* inferExpr(bodyEnv, arm.body);
      const resolvedBodyT = applyType(yield* Ref.get(ctx.subst), bodyT);
      const bodyEffect = operationalEffectParts(resolvedBodyT);

      // Unify all arm result types
      if (resultT === undefined) {
        if (bodyEffect) {
          resultT = bodyEffect.success;
          resultHasOperationalEffect = true;
          accumulatedErrors = mergeTypeSets(accumulatedErrors, bodyEffect.errors);
          accumulatedRequirements = mergeTypeSets(accumulatedRequirements, bodyEffect.requirements);
        } else {
          resultT = resolvedBodyT;
        }
      } else {
        const currentResult = applyType(yield* Ref.get(ctx.subst), resultT);
        if (resultHasOperationalEffect || bodyEffect) {
          const bodySuccess = bodyEffect?.success ?? resolvedBodyT;
          yield* unify(currentResult, bodySuccess, originOf(expr, "match-arms"));
          accumulatedErrors = mergeTypeSets(accumulatedErrors, bodyEffect?.errors ?? []);
          accumulatedRequirements = mergeTypeSets(
            accumulatedRequirements,
            bodyEffect?.requirements ?? [],
          );
          resultHasOperationalEffect = true;
          resultT = applyType(yield* Ref.get(ctx.subst), currentResult);
        } else {
          yield* unify(currentResult, resolvedBodyT, originOf(expr, "match-arms"));
          resultT = applyType(yield* Ref.get(ctx.subst), currentResult);
        }
      }
    }

    // -----------------------------------------------------------------------
    // Exhaustiveness & redundancy checking
    // -----------------------------------------------------------------------
    const sFinal = yield* Ref.get(ctx.subst);
    const resolvedScrut = applyType(sFinal, scrutT);

    // Find the ADT name from the scrutinee type
    let adtName: string | undefined;
    if (resolvedScrut._tag === "TCon") {
      adtName = resolvedScrut.name;
    } else if (resolvedScrut._tag === "TApp" && resolvedScrut.con._tag === "TCon") {
      adtName = resolvedScrut.con.name;
    }

    if (adtName) {
      const registry = yield* Ref.get(ctx.adtRegistry);
      const adtInfo = registry.get(adtName);

      if (adtInfo) {
        const allConstructors = new Set(adtInfo.constructors.keys());
        const matchedConstructors = new Set<string>();
        let hasWildcard = false;
        let wildcardIndex = -1;

        for (let i = 0; i < expr.arms.length; i++) {
          const arm = expr.arms[i]!;
          if (arm.pattern._tag === "PWild") {
            hasWildcard = true;
            wildcardIndex = i;
          } else {
            matchedConstructors.add(arm.pattern.name);
          }
        }

        // Redundancy: warn on arms after a wildcard
        if (hasWildcard && wildcardIndex < expr.arms.length - 1) {
          yield* ctx.addDiagnostic({
            message: "Unreachable match arm(s) after wildcard pattern",
            span: expr.span,
            severity: "warning",
            source: "hm",
          });
        }

        // Redundancy: warn on duplicate constructor patterns
        const seen = new Set<string>();
        for (const arm of expr.arms) {
          if (arm.pattern._tag === "PCon") {
            if (seen.has(arm.pattern.name)) {
              yield* ctx.addDiagnostic({
                message: `Duplicate match arm for constructor '${arm.pattern.name}'`,
                span: expr.span,
                severity: "warning",
                source: "hm",
              });
            }
            seen.add(arm.pattern.name);
          }
        }

        // Exhaustiveness: check all constructors are covered
        if (!hasWildcard) {
          const missing: string[] = [];
          for (const con of allConstructors) {
            if (!matchedConstructors.has(con)) {
              missing.push(con);
            }
          }
          if (missing.length > 0) {
            yield* ctx.addDiagnostic({
              message: `Non-exhaustive match: missing constructor(s) ${missing.join(", ")}`,
              span: expr.span,
              severity: "warning",
              source: "hm",
            });
          }
        }
      }
    }

    const result = applyType(sFinal, resultT ?? tNil);
    if (resultHasOperationalEffect) {
      return operationalEffectType(result, accumulatedErrors, accumulatedRequirements);
    }
    return result;
  });
