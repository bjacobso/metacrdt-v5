/**
 * Core inference dispatch: inferExpr, inferExprInner (the switch), inferLit, inferVar,
 * inferApp, inferLam. Also helper functions used across inference modules.
 */
import { Effect, Ref } from "effect";
import type { Type, Row, ERow } from "./types.js";
import {
  TCon,
  TApp,
  TFun,
  TVariadic,
  TRow,
  REmpty,
  RExtend,
  EEmpty,
  EExtend,
  tNum,
  tStr,
  tBool,
  tNil,
  tList,
  tMeta,
  mono,
  fnType,
  variadicFnType,
  showType,
} from "./types.js";
import { applyType, applyEnv, type TypeEnv, applyERow } from "./substitution.js";
import { unify } from "./unify.js";
import { InferContext } from "./context.js";
import type { Origin } from "./errors.js";
import { InferenceError } from "./errors.js";
import type { CoreExpr, TypeExpr } from "./core-expr.js";
import { WELL_KNOWN_KEYWORDS } from "./builtin-schemes.js";
import { instantiate, instantiateWithConstraints } from "./scheme-ops.js";
import { emitAmbientEffect, withAmbientEffectScope } from "./effect-helpers.js";
import { inferLet } from "./infer-binding.js";
import { inferIf } from "./infer-control.js";
import { inferMatch } from "./infer-control.js";
import { inferRecord, inferGet } from "./infer-record.js";
import { inferDef } from "./infer-binding.js";
import { inferAscribe, inferDSLForm } from "./infer-dsl.js";
import { inferTypeDef, inferDefClass, inferInstance, inferDefService } from "./infer-typedef.js";

// ---------------------------------------------------------------------------
// Origin helper
// ---------------------------------------------------------------------------

export function originOf(expr: CoreExpr, kind: string): Origin {
  return {
    nodeId: expr.id,
    span: expr.span,
    kind,
    ...(expr.span.macroOrigins ? { macroOrigins: expr.span.macroOrigins } : {}),
  };
}

export function fnTypeWithEffect(params: readonly Type[], ret: Type, effect: ERow): Type {
  let result = ret;
  for (let i = params.length - 1; i >= 0; i--) {
    result = TFun(params[i]!, result, i === params.length - 1 ? effect : undefined);
  }
  return result;
}

export function variadicFnTypeWithEffect(
  params: readonly Type[],
  rest: Type,
  ret: Type,
  effect: ERow,
): Type {
  return variadicFnType(params, rest, ret, effect);
}

export const applyFnWithEffect = (
  fnT: Type,
  argT: Type,
  origin: Origin,
): Effect.Effect<{ result: Type; effect: ERow }, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;
    const retT = yield* ctx.freshTVar;
    const effectT = yield* ctx.freshEVar;
    yield* unify(fnT, TFun(argT, retT, effectT), origin);
    const s = yield* Ref.get(ctx.subst);
    return {
      result: applyType(s, retT),
      effect: applyERow(s, effectT),
    };
  });

export function attachEffectToOperationType(opType: Type, effectName: string): Type {
  if (opType._tag === "TVariadic") {
    return TVariadic(opType.rest, opType.res, EExtend(effectName, opType.effect ?? EEmpty));
  }
  if (opType._tag !== "TFun") {
    return opType;
  }
  if (opType.res._tag === "TFun" || opType.res._tag === "TVariadic") {
    return TFun(
      opType.arg,
      attachEffectToOperationType(opType.res, effectName),
      opType.effect,
      opType.rest,
    );
  }
  return TFun(opType.arg, opType.res, EExtend(effectName, opType.effect ?? EEmpty), opType.rest);
}

// ---------------------------------------------------------------------------
// TypeExpr → Type conversion
// ---------------------------------------------------------------------------

/** Well-known type names that map to TCon — both canonical and legacy spellings */
const typeConNames = new Set([
  // Canonical internal names
  "Number",
  "String",
  "Boolean",
  "Unit",
  // Legacy spellings still accepted in type annotations
  "Num",
  "Str",
  "Bool",
  "Nil",
  "List",
  "Map",
]);

/** Check if a name is a type variable (lowercase first letter) or type constant */
export function isTypeVar(name: string): boolean {
  if (name.length === 0) return false;
  // Keywords starting with : are not type vars
  if (name.startsWith(":")) return false;
  // Well-known type constructors
  if (typeConNames.has(name)) return false;
  // Type variables are lowercase
  const firstChar = name[0]!;
  return firstChar >= "a" && firstChar <= "z";
}

/**
 * Convert a TypeExpr (parsed type annotation) to an internal Type.
 *
 * Type variables (lowercase names like 'a', 'b') are converted to fresh type variables,
 * reusing the same variable for the same name within the expression.
 *
 * Returns the type and the set of free type/row variable names.
 */
export const typeExprToType = (
  texpr: TypeExpr,
  tvarMap: Map<string, Type>,
  rvarMap: Map<string, Row>,
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;

    switch (texpr._tag) {
      case "TESym": {
        const name = texpr.name;

        // Check for type variable
        if (isTypeVar(name)) {
          const existing = tvarMap.get(name);
          if (existing) return existing;
          const tv = yield* ctx.freshTVar;
          tvarMap.set(name, tv);
          return tv;
        }

        // Known type constants
        switch (name) {
          case "Num":
          case "Number":
            return tNum;
          case "Str":
          case "String":
            return tStr;
          case "Bool":
          case "Boolean":
            return tBool;
          case "Nil":
          case "Unit":
            return tNil;
          case "List":
            return tList;
          default: {
            // Check type aliases
            const aliases = yield* Ref.get(ctx.typeAliases);
            const alias = aliases.get(name);
            if (alias) {
              if (alias._tag === "TESym" && alias.name === name) {
                return TCon(name);
              }
              return yield* typeExprToType(alias, tvarMap, rvarMap);
            }
            // Treat as a type constructor (e.g., custom types in the future)
            return TCon(name);
          }
        }
      }

      case "TEFun": {
        // (-> A B C) means A -> B -> C
        const paramTypes: Type[] = [];
        for (const param of texpr.params) {
          paramTypes.push(yield* typeExprToType(param, tvarMap, rvarMap));
        }
        const retType = yield* typeExprToType(texpr.ret, tvarMap, rvarMap);

        return fnType(paramTypes, retType);
      }

      case "TEApp": {
        if (
          texpr.con._tag === "TESym" &&
          (texpr.con.name === "ErrorSet" || texpr.con.name === "RequirementSet")
        ) {
          return TApp(
            TCon(texpr.con.name),
            texpr.args.map((arg) => (arg._tag === "TESym" ? TCon(arg.name) : TCon("Unknown"))),
          );
        }

        // (List Num), (Map Str Num)
        const con = yield* typeExprToType(texpr.con, tvarMap, rvarMap);
        const args: Type[] = [];
        for (const arg of texpr.args) {
          args.push(yield* typeExprToType(arg, tvarMap, rvarMap));
        }
        return TApp(con, args);
      }

      case "TERow": {
        // {:name Str :age Num} or {:name Str | r}
        let tail: Row;
        if (texpr.tail) {
          // Open record with row variable
          const existing = rvarMap.get(texpr.tail);
          if (existing) {
            tail = existing;
          } else {
            const rv = yield* ctx.freshRowVar;
            rvarMap.set(texpr.tail, rv);
            tail = rv;
          }
        } else {
          // Closed record
          tail = REmpty;
        }

        // Build row from fields (reverse order so first field is outermost)
        let row: Row = tail;
        for (let i = texpr.fields.length - 1; i >= 0; i--) {
          const field = texpr.fields[i]!;
          const fieldType = yield* typeExprToType(field.type, tvarMap, rvarMap);
          row = RExtend(field.label, fieldType, row);
        }

        return TRow(row);
      }
    }
  });

/**
 * Detect if a condition expression is a type predicate call on a variable.
 * Returns the variable name and narrowed type, or undefined.
 */
export function detectTypeNarrowing(
  cond: CoreExpr,
): { varName: string; narrowedType: Type } | undefined {
  /** Map type predicate names to the types they narrow to */
  const TYPE_PREDICATE_NARROWING: Record<string, Type> = {
    "is-nil": tNil,
    "is-string": tStr,
    "is-number": tNum,
    "is-boolean": tBool,
  };

  if (
    cond._tag === "App" &&
    cond.fn._tag === "Var" &&
    cond.args.length === 1 &&
    cond.args[0]!._tag === "Var"
  ) {
    const narrowedType = TYPE_PREDICATE_NARROWING[cond.fn.name];
    if (narrowedType) {
      return { varName: cond.args[0]!.name, narrowedType };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Infer
// ---------------------------------------------------------------------------

export const inferExpr = (
  env: TypeEnv,
  expr: CoreExpr,
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;
    const t = yield* inferExprInner(env, expr);
    // Record the node type after inference
    yield* ctx.recordType(expr.id, t);
    return t;
  });

const inferExprInner = (
  env: TypeEnv,
  expr: CoreExpr,
): Effect.Effect<Type, InferenceError, InferContext> => {
  switch (expr._tag) {
    case "Lit":
      return inferLit(expr);
    case "Var":
      return inferVar(env, expr);
    case "Lam":
      return inferLam(env, expr);
    case "App":
      return inferApp(env, expr);
    case "Let":
      return inferLet(env, expr, inferExpr);
    case "EffectDo":
      return inferEffectDo(env, expr);
    case "If":
      return inferIf(env, expr, inferExpr);
    case "Record":
      return inferRecord(env, expr, inferExpr);
    case "Get":
      return inferGet(env, expr, inferExpr);
    case "Def":
      return inferDef(env, expr, inferExpr);
    case "Ascribe":
      return inferAscribe(env, expr, inferExpr);
    case "DSLForm":
      return inferDSLForm(env, expr, inferExpr);
    case "TypeDef":
      return inferTypeDef(expr);
    case "Match":
      return inferMatch(env, expr, inferExpr);
    case "DefClass":
      return inferDefClass(expr);
    case "Instance":
      return inferInstance(env, expr, inferExpr);
    case "DefService":
      return inferDefService(expr);
  }
};

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

const inferOperationalSucceed = (
  env: TypeEnv,
  expr: CoreExpr & { _tag: "App" },
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;
    if (expr.args.length !== 1) {
      return yield* ctx.fail(originOf(expr, "succeed"), {
        message: "succeed expects exactly one value.",
      });
    }

    const valueType = yield* inferExpr(env, expr.args[0]!);
    return operationalEffectType(applyType(yield* Ref.get(ctx.subst), valueType), [], []);
  });

const inferOperationalFail = (
  expr: CoreExpr & { _tag: "App" },
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;
    if (expr.args.length !== 1 || expr.args[0]!._tag !== "Var") {
      return yield* ctx.fail(originOf(expr, "fail"), {
        message: "fail expects exactly one error type name.",
      });
    }

    const success = yield* ctx.freshTVar;
    const errorName = expr.args[0]!.name;
    return operationalEffectType(success, [TCon(errorName)], []);
  });

const inferEffectDo = (
  env: TypeEnv,
  expr: CoreExpr & { _tag: "EffectDo" },
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;
    let currentEnv = new Map(env);
    let accumulatedErrors: readonly Type[] = [];
    let accumulatedRequirements: readonly Type[] = [];

    for (const binding of expr.bindings) {
      const s = yield* Ref.get(ctx.subst);
      currentEnv = new Map(applyEnv(s, currentEnv));
      const bindingType = yield* inferExpr(currentEnv, binding.expr);
      const resolvedBindingType = applyType(yield* Ref.get(ctx.subst), bindingType);
      const parts = operationalEffectParts(resolvedBindingType);
      if (!parts) {
        return yield* ctx.fail(
          {
            nodeId: binding.id,
            span: binding.span,
            kind: "effect-bind",
          },
          { message: `Effect bind expects Effect, received ${showType(resolvedBindingType)}.` },
        );
      }

      accumulatedErrors = mergeTypeSets(accumulatedErrors, parts.errors);
      accumulatedRequirements = mergeTypeSets(accumulatedRequirements, parts.requirements);
      currentEnv.set(binding.name, mono(parts.success));
    }

    const bodyType = applyType(yield* Ref.get(ctx.subst), yield* inferExpr(currentEnv, expr.body));
    const bodyParts = operationalEffectParts(bodyType);
    if (bodyParts) {
      return operationalEffectType(
        bodyParts.success,
        mergeTypeSets(accumulatedErrors, bodyParts.errors),
        mergeTypeSets(accumulatedRequirements, bodyParts.requirements),
      );
    }

    return operationalEffectType(bodyType, accumulatedErrors, accumulatedRequirements);
  });

// ---------------------------------------------------------------------------
// Lit
// ---------------------------------------------------------------------------

const inferLit = (expr: CoreExpr & { _tag: "Lit" }): Effect.Effect<Type, never, InferContext> =>
  Effect.gen(function* () {
    // Warn when a non-namespaced keyword (no "/") appears as a bare literal.
    // These are often accidental value literals rather than variable references.
    // Well-known keywords like :else are excluded.
    if (expr.lit._tag === "LKeyword") {
      const kw = expr.lit.value;
      if (!kw.includes("/") && !WELL_KNOWN_KEYWORDS.has(kw)) {
        const ctx = yield* InferContext;
        yield* ctx.addDiagnostic({
          message: `Keyword ${kw} used as a value. Keywords are self-evaluating literals, not variable references.`,
          span: expr.span,
          severity: "warning",
          source: "hm",
        });
      }
      return tStr;
    }

    return expr.lit._tag === "LInt"
      ? tNum
      : expr.lit._tag === "LString"
        ? tStr
        : expr.lit._tag === "LBool"
          ? tBool
          : tNil;
  });

// ---------------------------------------------------------------------------
// Var
// ---------------------------------------------------------------------------

const inferVar = (
  env: TypeEnv,
  expr: CoreExpr & { _tag: "Var" },
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const scheme = env.get(expr.name);
    if (scheme) {
      const t = yield* instantiateWithConstraints(scheme, originOf(expr, "var"));
      return t;
    }

    const ctx = yield* InferContext;
    const bt = ctx.builtinScheme(expr.name);
    if (bt) return yield* instantiate(bt);

    const hostLiteralType = ctx.unboundSymbolType(expr.name);
    if (hostLiteralType) return hostLiteralType;

    return yield* ctx.fail(originOf(expr, "var"), {
      message: `Unbound variable: ${expr.name}`,
    });
  });

// ---------------------------------------------------------------------------
// Lam
// ---------------------------------------------------------------------------

const inferLam = (
  env: TypeEnv,
  expr: CoreExpr & { _tag: "Lam" },
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;
    const paramTypes: Type[] = [];
    const lamEnv = new Map(env);
    let restElemType: Type | undefined;

    for (const param of expr.params) {
      const tv = yield* ctx.freshTVar;
      paramTypes.push(tv);
      lamEnv.set(param.name, mono(tv));
    }
    if (expr.restParam) {
      restElemType = yield* ctx.freshTVar;
      lamEnv.set(expr.restParam.name, mono(TApp(tList, [restElemType])));
    }

    const { value: bodyT, effect: bodyEffect } = yield* withAmbientEffectScope(
      inferExpr(lamEnv, expr.body),
    );
    const s = yield* Ref.get(ctx.subst);
    const resolvedParams = paramTypes.map((p) => applyType(s, p));
    const resolvedBody = applyType(s, bodyT);
    const resolvedEffect = applyERow(s, bodyEffect);
    const resolvedRest = restElemType ? applyType(s, restElemType) : undefined;

    if (resolvedRest) {
      if (resolvedEffect._tag === "EEmpty") {
        return variadicFnType(resolvedParams, resolvedRest, resolvedBody);
      }
      return variadicFnTypeWithEffect(resolvedParams, resolvedRest, resolvedBody, resolvedEffect);
    }
    if (resolvedEffect._tag === "EEmpty") {
      return fnType(resolvedParams, resolvedBody);
    }
    return fnTypeWithEffect(resolvedParams, resolvedBody, resolvedEffect);
  });

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const inferApp = (
  env: TypeEnv,
  expr: CoreExpr & { _tag: "App" },
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;

    // Special: __vector(args) → List<elemType>
    if (expr.fn._tag === "Var" && expr.fn.name === "__vector") {
      return yield* inferVector(env, expr);
    }
    if (expr.fn._tag === "Var" && expr.fn.name === "succeed") {
      return yield* inferOperationalSucceed(env, expr);
    }
    if (expr.fn._tag === "Var" && expr.fn.name === "fail" && expr.args[0]?._tag === "Var") {
      return yield* inferOperationalFail(expr);
    }
    if (expr.fn._tag === "Var" && expr.fn.name === "apply") {
      return yield* inferApply(env, expr);
    }
    if (expr.fn._tag === "Var" && expr.fn.name === "meta") {
      for (const arg of expr.args) {
        const s = yield* Ref.get(ctx.subst);
        const envN = applyEnv(s, env);
        yield* inferExpr(envN, arg);
      }
      return tMeta;
    }

    let fnT = yield* inferExpr(env, expr.fn);
    const argTypes: Type[] = [];

    for (const arg of expr.args) {
      const s = yield* Ref.get(ctx.subst);
      const envN = applyEnv(s, env);
      argTypes.push(yield* inferExpr(envN, arg));
    }

    for (let i = 0; i < argTypes.length; i++) {
      const argT = argTypes[i]!;
      const sBefore = yield* Ref.get(ctx.subst);
      const current = applyType(sBefore, fnT);
      const currentArg = applyType(sBefore, argT);

      if (current._tag === "TFun") {
        yield* unify(current.arg, currentArg, originOf(expr, "app"));
        const sAfter = yield* Ref.get(ctx.subst);
        yield* emitAmbientEffect(
          applyERow(sAfter, current.effect ?? EEmpty),
          originOf(expr, "app"),
        );

        if (current.rest) {
          const restT = applyType(sAfter, current.rest);
          for (let j = i + 1; j < argTypes.length; j++) {
            const restArgS = yield* Ref.get(ctx.subst);
            yield* unify(restT, applyType(restArgS, argTypes[j]!), originOf(expr, "app"));
          }
          const sFinal = yield* Ref.get(ctx.subst);
          return applyType(sFinal, current.res);
        }

        fnT = applyType(sAfter, current.res);
        continue;
      }

      if (current._tag === "TVariadic") {
        yield* unify(current.rest, currentArg, originOf(expr, "app"));
        for (let j = i + 1; j < argTypes.length; j++) {
          const restArgS = yield* Ref.get(ctx.subst);
          yield* unify(current.rest, applyType(restArgS, argTypes[j]!), originOf(expr, "app"));
        }
        const sAfter = yield* Ref.get(ctx.subst);
        yield* emitAmbientEffect(
          applyERow(sAfter, current.effect ?? EEmpty),
          originOf(expr, "app"),
        );
        return applyType(sAfter, current.res);
      }

      const applied = yield* applyFnWithEffect(current, currentArg, originOf(expr, "app"));
      yield* emitAmbientEffect(applied.effect, originOf(expr, "app"));
      fnT = applied.result;
    }

    const sFinal = yield* Ref.get(ctx.subst);
    const resolved = applyType(sFinal, fnT);
    return resolved._tag === "TVariadic" ? applyType(sFinal, resolved.res) : resolved;
  });

const inferVector = (
  env: TypeEnv,
  expr: CoreExpr & { _tag: "App" },
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;

    if (expr.args.length === 0) {
      const elemT = yield* ctx.freshTVar;
      return TApp(tList, [elemT]);
    }

    let elemT = yield* inferExpr(env, expr.args[0]!);

    for (let i = 1; i < expr.args.length; i++) {
      const s = yield* Ref.get(ctx.subst);
      const envN = applyEnv(s, env);
      const argT = yield* inferExpr(envN, expr.args[i]!);
      yield* unify(
        applyType(yield* Ref.get(ctx.subst), elemT),
        applyType(yield* Ref.get(ctx.subst), argT),
        originOf(expr, "vector"),
      );
    }

    const s = yield* Ref.get(ctx.subst);
    return TApp(tList, [applyType(s, elemT)]);
  });

const inferApply = (
  env: TypeEnv,
  expr: CoreExpr & { _tag: "App" },
): Effect.Effect<Type, InferenceError, InferContext> =>
  Effect.gen(function* () {
    const ctx = yield* InferContext;
    if (expr.args.length < 2) {
      return yield* ctx.fail(originOf(expr, "app"), {
        message: "apply expects a function and a trailing list of args",
      });
    }

    let fnT = yield* inferExpr(env, expr.args[0]!);
    const prefixArgTypes: Type[] = [];
    for (let i = 1; i < expr.args.length - 1; i++) {
      const s = yield* Ref.get(ctx.subst);
      const envN = applyEnv(s, env);
      prefixArgTypes.push(yield* inferExpr(envN, expr.args[i]!));
    }

    const lastArgExpr = expr.args[expr.args.length - 1]!;
    const sBeforeList = yield* Ref.get(ctx.subst);
    const listEnv = applyEnv(sBeforeList, env);
    const listArgT = yield* inferExpr(listEnv, lastArgExpr);
    const restElemT = yield* ctx.freshTVar;
    yield* unify(
      applyType(yield* Ref.get(ctx.subst), listArgT),
      TApp(tList, [restElemT]),
      originOf(expr, "app"),
    );

    for (const prefixArgT of prefixArgTypes) {
      const sBefore = yield* Ref.get(ctx.subst);
      const current = applyType(sBefore, fnT);
      const currentArg = applyType(sBefore, prefixArgT);
      if (current._tag === "TFun") {
        yield* unify(current.arg, currentArg, originOf(expr, "app"));
        const sAfter = yield* Ref.get(ctx.subst);
        yield* emitAmbientEffect(
          applyERow(sAfter, current.effect ?? EEmpty),
          originOf(expr, "app"),
        );
        fnT = current.rest
          ? TVariadic(applyType(sAfter, current.rest), applyType(sAfter, current.res))
          : applyType(sAfter, current.res);
        continue;
      }
      if (current._tag === "TVariadic") {
        yield* unify(current.rest, currentArg, originOf(expr, "app"));
        fnT = applyType(yield* Ref.get(ctx.subst), current);
        continue;
      }
      const applied = yield* applyFnWithEffect(current, currentArg, originOf(expr, "app"));
      yield* emitAmbientEffect(applied.effect, originOf(expr, "app"));
      fnT = applied.result;
    }

    let current = applyType(yield* Ref.get(ctx.subst), fnT);
    const listElemT = applyType(yield* Ref.get(ctx.subst), restElemT);

    while (true) {
      if (current._tag === "TFun") {
        yield* unify(current.arg, listElemT, originOf(expr, "app"));
        const sAfter = yield* Ref.get(ctx.subst);
        yield* emitAmbientEffect(
          applyERow(sAfter, current.effect ?? EEmpty),
          originOf(expr, "app"),
        );
        if (current.rest) {
          yield* unify(applyType(sAfter, current.rest), listElemT, originOf(expr, "app"));
          return applyType(yield* Ref.get(ctx.subst), current.res);
        }
        current = applyType(sAfter, current.res);
        continue;
      }

      if (current._tag === "TVariadic") {
        yield* unify(current.rest, listElemT, originOf(expr, "app"));
        const sAfter = yield* Ref.get(ctx.subst);
        yield* emitAmbientEffect(
          applyERow(sAfter, current.effect ?? EEmpty),
          originOf(expr, "app"),
        );
        return applyType(sAfter, current.res);
      }

      const applied = yield* applyFnWithEffect(current, listElemT, originOf(expr, "app"));
      yield* emitAmbientEffect(applied.effect, originOf(expr, "app"));
      current = applyType(yield* Ref.get(ctx.subst), applied.result);
      return current;
    }
  });
