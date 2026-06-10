/**
 * @forma/type-level — Forma embedded in the TypeScript type system.
 *
 * The type system acts as a third forma engine (alongside @forma/ts and
 * @forma/ocaml): the runtime value comes from the real @forma/ts evaluator,
 * the *type* of that value is computed entirely at compile time over the same
 * source literal.
 *
 * Two modes:
 *
 *   // typed mode — forma types, widened (the default; composes with bindings)
 *   const n = forma("(+ 1 2)");                       // n: number
 *   const m = forma("(+ a b)", { a: 1, b: 3 });       // m: number, === 4
 *   const v = forma("(map (fn [x] (* x f)) xs)",
 *                   { xs: [1, 2, 3], f: 2 });          // v: number[]
 *
 *   // exact mode — value-level evaluation in the type system
 *   const x = formaExact("(+ 1 2)");                  // x: 3
 *
 *   type A = Ast<"(+ 1 2)">;                          // typed AST, no runtime
 */

import { Effect } from "effect";
import { Builtins, Env, Evaluator, Reader } from "@forma/ts";

export type { Parse, ParseProgram, Node } from "./parse.js";
export type { Eval, EvalProgram } from "./eval.js";
export type { Check, CheckProgram, FormaTypeError } from "./infer.js";
export type { Tokenize } from "./lex.js";

import type { Parse, ParseProgram } from "./parse.js";
import type { EvalProgram } from "./eval.js";
import type { CheckProgram } from "./infer.js";

/** The typed AST of the first form in `S`. */
export type Ast<S extends string> = Parse<S>;

/** The typed ASTs of every top-level form in `S`. */
export type Program<S extends string> = ParseProgram<S>;

/** Exact mode: the literal value `S` evaluates to. `Infer<"(+ 1 2)">` is `3`. */
export type Infer<S extends string> = EvalProgram<ParseProgram<S>>;

/**
 * Map a TS scope type into forma's view of it: primitives widen, arrays
 * become `El[]`, objects become keyword-keyed rows (`{ a: 1 }` is forma's
 * `{:a 1}`, so its row type is `{ ":a": number }`).
 */
export type ToForma<V> = V extends string
  ? string
  : V extends number
    ? number
    : V extends boolean
      ? boolean
      : V extends null
        ? null
        : V extends readonly (infer El)[]
          ? ToForma<El>[]
          : V extends object
            ? { [K in keyof V as `:${K & string}`]: ToForma<V[K]> }
            : never;

type Scope = Record<string, unknown>;

type ToFormaEnv<E extends Scope> = { [K in keyof E]: ToForma<E[K]> };

/**
 * Typed mode: the forma type of `S` under bindings `E`, widened.
 * `TypeOf<"(+ a b)", { a: number; b: number }>` is `number`.
 */
export type TypeOf<S extends string, E extends object = {}> = CheckProgram<ParseProgram<S>, E>;

const opts: Evaluator.KernelOptions = {
  stepLimit: 500_000,
  builtins: Builtins.defaultBuiltins,
};

const preludeLayer = Evaluator.makePreludeLayer(Builtins.defaultBuiltins);

/** Normalize engine KValues to plain JS so they match the type-level shapes. */
function toJS(v: Evaluator.KValue): unknown {
  if (v instanceof Map) {
    return Object.fromEntries([...v.entries()].map(([k, val]) => [k, toJS(val)]));
  }
  if (Array.isArray(v)) return v.map(toJS);
  return v;
}

/** Inverse of toJS: plain JS bindings to KValues (objects → keyword-keyed maps). */
function fromJS(v: unknown): Evaluator.KValue {
  if (Array.isArray(v)) return v.map(fromJS);
  if (v !== null && typeof v === "object") {
    return new Map(Object.entries(v).map(([k, val]) => [`:${k}`, fromJS(val)]));
  }
  return v as Evaluator.KValue;
}

type SExprLike = {
  _tag: string;
  items?: readonly SExprLike[];
  pairs?: readonly (readonly [SExprLike, SExprLike])[];
  name?: string;
  value?: unknown;
  message?: string;
};

function stripLoc(e: SExprLike): unknown {
  switch (e._tag) {
    case "List":
    case "Vector":
      return { _tag: e._tag, items: (e.items ?? []).map(stripLoc) };
    case "Map":
      return { _tag: "Map", pairs: (e.pairs ?? []).map(([k, v]) => [stripLoc(k), stripLoc(v)]) };
    case "Sym":
      return { _tag: "Sym", name: e.name };
    case "Str":
    case "Num":
    case "Bool":
      return { _tag: e._tag, value: e.value };
    default:
      return { _tag: "Error", message: e.message ?? "unknown" };
  }
}

function runEngine(source: string, scope?: Scope): unknown {
  const env =
    scope === undefined
      ? undefined
      : Env.Env.from(
          Object.fromEntries(Object.entries(scope).map(([k, v]) => [k, fromJS(v)])),
        );
  const result = Effect.runSync(
    Effect.provide(Evaluator.evaluate(source, env ? { ...opts, env } : opts), preludeLayer),
  );
  return toJS(result.value);
}

/**
 * Typed mode: evaluate forma source with the real @forma/ts engine under the
 * given bindings; the return type is the forma *type* of the program, widened
 * (`forma("(+ a b)", { a: 1, b: 3 })` has type `number` and value `4`).
 *
 * Bindings are plain TS values; objects become keyword-keyed forma maps, so
 * `{ user: { age: 42 } }` lets the program say `(get user :age)`.
 *
 * Note: a call, not a tagged template — TypeScript types tagged template
 * strings as `TemplateStringsArray`, which erases the literal type the
 * type-level engine needs (microsoft/TypeScript#33304).
 */
export function forma<const S extends string, E extends Scope = {}>(
  source: S,
  env?: E,
): TypeOf<S, ToFormaEnv<E>> {
  return runEngine(source, env) as TypeOf<S, ToFormaEnv<E>>;
}

/**
 * Exact mode: like `forma`, but the return type is the literal *value*
 * computed by the type-level evaluator: `formaExact("(+ 1 2)")` has type `3`.
 * Subject to eval-mode caps (3-digit arithmetic operands, no negatives).
 */
export function formaExact<const S extends string>(source: S): Infer<S> {
  return runEngine(source) as Infer<S>;
}

/**
 * Parse forma source with the real @forma/ts reader (locations stripped); the
 * return type is the type-level AST of the same source.
 */
export function parse<const S extends string>(source: S): Program<S> {
  const exprs = Effect.runSync(Reader.parseManyToSExpr(source));
  return (exprs as readonly SExprLike[]).map(stripLoc) as Program<S>;
}
