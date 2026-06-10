/**
 * Type-level evaluator: an AST (from ./parse) in, a TypeScript type out.
 *
 * `EvalProgram<ParseProgram<"(+ 1 2)">>` is the literal type `3`.
 *
 * Semantics mirror the @forma/ts runtime engine for the supported subset:
 *   - literals: numbers, strings, booleans, `nil` → null, keywords → ":kw" strings
 *   - vectors → tuple types, map literals → object types (keys keep the ":")
 *   - special forms: if, cond, let, do, fn, define/def (top level)
 *   - arithmetic: + - * (exact on non-negative integer literals, else `number`)
 *   - comparison: = < > <= >=, not, and, or
 *   - strings: str
 *   - collections: count, nth, first, rest, concat, conj, get, map, filter, reduce
 *
 * Unsupported forms or unbound symbols surface as `{ __formaTypeError: ... }`
 * so failures are visible in the hover, not silently `any`.
 */

import type { Add, Sub, Mul, Lt, Gt, Lte, Gte } from "./nat.js";

export type FormaTypeError<M extends string> = { __formaTypeError: M };

type Flatten<T> = { [K in keyof T]: T[K] } & {};

type Bind<E extends object, K extends string, V> = Flatten<Omit<E, K> & { [P in K]: V }>;

type Closure = { _tag: "Closure"; params: string[]; body: unknown[]; env: object };

/** Forma truthiness: only `false` and `nil` are falsy. */
type Truthy<V> = [V] extends [false | null] ? false : true;

/** Structural equality via mutual assignability (non-distributive). */
type Eq<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

type ToStr<V> = V extends string
  ? V
  : V extends number | boolean
    ? `${V}`
    : V extends null
      ? ""
      : string;

type StrLen<S extends string, Acc extends unknown[] = []> = S extends `${string}${infer R}`
  ? StrLen<R, [...Acc, unknown]>
  : Acc["length"];

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

export type Eval<E, Env extends object = {}> = E extends { _tag: "Num"; value: infer V }
  ? V
  : E extends { _tag: "Str"; value: infer V }
    ? V
    : E extends { _tag: "Bool"; value: infer V }
      ? V
      : E extends { _tag: "Sym"; name: infer N extends string }
        ? EvalSym<N, Env>
        : E extends { _tag: "Vector"; items: infer Items extends unknown[] }
          ? EvalItems<Items, Env>
          : E extends { _tag: "Map"; pairs: infer Pairs extends unknown[] }
            ? EvalMapLit<Pairs, Env>
            : E extends { _tag: "List"; items: infer Items extends unknown[] }
              ? EvalList<Items, Env>
              : E extends { _tag: "Error"; message: infer M extends string }
                ? FormaTypeError<`parse error: ${M}`>
                : FormaTypeError<"unsupported expression">;

type EvalSym<N extends string, Env extends object> = N extends `:${string}`
  ? N // keywords self-evaluate to strings, colon included
  : N extends "nil"
    ? null
    : N extends keyof Env
      ? Env[N]
      : FormaTypeError<`unbound symbol: ${N}`>;

type EvalItems<Items extends unknown[], Env extends object, Acc extends unknown[] = []> = Items extends [
  infer H,
  ...infer R extends unknown[],
]
  ? EvalItems<R, Env, [...Acc, Eval<H, Env>]>
  : Acc;

type EvalMapLit<Pairs extends unknown[], Env extends object, Acc extends object = {}> = Pairs extends [
  [infer K, infer V],
  ...infer R extends unknown[],
]
  ? EvalMapLit<R, Env, Acc & { [P in Eval<K, Env> & string]: Eval<V, Env> }>
  : Flatten<Acc>;

type EvalList<Items extends unknown[], Env extends object> = Items extends [
  { _tag: "Sym"; name: infer Op extends string },
  ...infer Args extends unknown[],
]
  ? EvalForm<Op, Args, Env>
  : Items extends [infer H, ...infer Args extends unknown[]]
    ? Apply<Eval<H, Env>, EvalItems<Args, Env>>
    : null; // () — empty list

// ---------------------------------------------------------------------------
// Special forms and builtins
// ---------------------------------------------------------------------------

type EvalForm<Op extends string, Args extends unknown[], Env extends object> = Op extends "if"
  ? EvalIf<Args, Env>
  : Op extends "cond"
    ? EvalCond<Args, Env>
    : Op extends "let"
      ? Args extends [{ _tag: "Vector"; items: infer B extends unknown[] }, ...infer Body extends unknown[]]
        ? EvalLet<B, Body, Env>
        : FormaTypeError<"let expects a binding vector">
      : Op extends "fn"
        ? Args extends [{ _tag: "Vector"; items: infer P extends unknown[] }, ...infer Body extends unknown[]]
          ? { _tag: "Closure"; params: ParamNames<P>; body: Body; env: Env }
          : FormaTypeError<"fn expects a parameter vector">
        : Op extends "do"
          ? EvalDo<Args, Env>
          : Op extends "+"
            ? FoldAdd<Args, Env, 0>
            : Op extends "*"
              ? FoldMul<Args, Env, 1>
              : Op extends "-"
                ? EvalSubtract<Args, Env>
                : Op extends "/"
                  ? number
                  : Op extends "=" | "<" | ">" | "<=" | ">="
                    ? EvalCompare<Op, Args, Env>
                    : Op extends "not"
                      ? Truthy<Eval<Args[0], Env>> extends true
                        ? false
                        : true
                      : Op extends "and"
                        ? FoldAnd<Args, Env>
                        : Op extends "or"
                          ? FoldOr<Args, Env>
                          : Op extends "str"
                            ? FoldStr<Args, Env>
                            : Op extends "count"
                              ? EvalCount<Eval<Args[0], Env>>
                              : Op extends "nth"
                                ? EvalNth<Eval<Args[0], Env>, Eval<Args[1], Env>>
                                : Op extends "first"
                                  ? Eval<Args[0], Env> extends [infer H, ...unknown[]]
                                    ? H
                                    : null
                                  : Op extends "rest"
                                    ? Eval<Args[0], Env> extends [unknown, ...infer R]
                                      ? R
                                      : []
                                    : Op extends "concat"
                                      ? FoldConcat<Args, Env>
                                      : Op extends "conj"
                                        ? FoldConj<Args, Env>
                                        : Op extends "get"
                                          ? EvalGet<Eval<Args[0], Env>, Eval<Args[1], Env>>
                                          : Op extends "map"
                                            ? Eval<Args[1], Env> extends infer Xs extends unknown[]
                                              ? MapList<Eval<Args[0], Env>, Xs>
                                              : FormaTypeError<"map expects a list">
                                            : Op extends "filter"
                                              ? Eval<Args[1], Env> extends infer Xs extends unknown[]
                                                ? FilterList<Eval<Args[0], Env>, Xs>
                                                : FormaTypeError<"filter expects a list">
                                              : Op extends "reduce"
                                                ? Eval<Args[2], Env> extends infer Xs extends unknown[]
                                                  ? ReduceList<Eval<Args[0], Env>, Eval<Args[1], Env>, Xs>
                                                  : FormaTypeError<"reduce expects a list">
                                                : ApplyNamed<Op, Args, Env>;

/** Head symbol is not a special form or builtin: look it up and apply. */
type ApplyNamed<Op extends string, Args extends unknown[], Env extends object> = EvalSym<
  Op,
  Env
> extends infer F
  ? F extends Closure
    ? Apply<F, EvalItems<Args, Env>>
    : F extends FormaTypeError<string>
      ? F
      : FormaTypeError<`not a function: ${Op}`>
  : never;

type Apply<F, Vals extends unknown[]> = F extends {
  _tag: "Closure";
  params: infer P extends string[];
  body: infer B extends unknown[];
  env: infer E extends object;
}
  ? EvalDo<B, BindAll<P, Vals, E>>
  : F extends FormaTypeError<string>
    ? F
    : FormaTypeError<"not a function">;

type BindAll<P extends string[], Vals extends unknown[], E extends object> = P extends [
  infer N extends string,
  ...infer PR extends string[],
]
  ? Vals extends [infer V, ...infer VR extends unknown[]]
    ? BindAll<PR, VR, Bind<E, N, V>>
    : BindAll<PR, [], Bind<E, N, null>>
  : E;

type ParamNames<P extends unknown[], Acc extends string[] = []> = P extends [
  { _tag: "Sym"; name: infer N extends string },
  ...infer R extends unknown[],
]
  ? ParamNames<R, [...Acc, N]>
  : Acc;

type EvalIf<Args extends unknown[], Env extends object> = Args extends [
  infer C,
  infer T,
  ...infer F extends unknown[],
]
  ? Truthy<Eval<C, Env>> extends true
    ? Eval<T, Env>
    : F extends [infer E]
      ? Eval<E, Env>
      : null
  : FormaTypeError<"if expects a condition and a then-branch">;

type EvalCond<Args extends unknown[], Env extends object> = Args extends [
  infer Test,
  infer Val,
  ...infer Rest extends unknown[],
]
  ? Truthy<Eval<Test, Env>> extends true
    ? Eval<Val, Env>
    : EvalCond<Rest, Env>
  : null;

type EvalLet<Bindings extends unknown[], Body extends unknown[], Env extends object> = Bindings extends [
  { _tag: "Sym"; name: infer N extends string },
  infer V,
  ...infer Rest extends unknown[],
]
  ? EvalLet<Rest, Body, Bind<Env, N, Eval<V, Env>>>
  : EvalDo<Body, Env>;

type EvalDo<Forms extends unknown[], Env extends object> = Forms extends [infer H]
  ? Eval<H, Env>
  : Forms extends [unknown, ...infer R extends unknown[]]
    ? EvalDo<R, Env>
    : null;

// ---------------------------------------------------------------------------
// Arithmetic, comparison, strings
// ---------------------------------------------------------------------------

type FoldAdd<Args extends unknown[], Env extends object, Acc extends number> = Args extends [
  infer H,
  ...infer R extends unknown[],
]
  ? Eval<H, Env> extends infer V
    ? V extends number
      ? FoldAdd<R, Env, Add<Acc, V> & number>
      : FormaTypeError<"+ expects numbers">
    : never
  : Acc;

type FoldMul<Args extends unknown[], Env extends object, Acc extends number> = Args extends [
  infer H,
  ...infer R extends unknown[],
]
  ? Eval<H, Env> extends infer V
    ? V extends number
      ? FoldMul<R, Env, Mul<Acc, V> & number>
      : FormaTypeError<"* expects numbers">
    : never
  : Acc;

type EvalSubtract<Args extends unknown[], Env extends object> = Args extends [infer A, infer B]
  ? Eval<A, Env> extends infer X
    ? Eval<B, Env> extends infer Y
      ? X extends number
        ? Y extends number
          ? Sub<X, Y>
          : FormaTypeError<"- expects numbers">
        : FormaTypeError<"- expects numbers">
      : never
    : never
  : FormaTypeError<"- expects exactly two arguments">;

type EvalCompare<Op extends string, Args extends unknown[], Env extends object> = Args extends [
  infer A,
  infer B,
]
  ? Eval<A, Env> extends infer X
    ? Eval<B, Env> extends infer Y
      ? Op extends "="
        ? Eq<X, Y>
        : X extends number
          ? Y extends number
            ? Op extends "<"
              ? Lt<X, Y>
              : Op extends ">"
                ? Gt<X, Y>
                : Op extends "<="
                  ? Lte<X, Y>
                  : Gte<X, Y>
            : FormaTypeError<"comparison expects numbers">
          : FormaTypeError<"comparison expects numbers">
      : never
    : never
  : FormaTypeError<"comparison expects exactly two arguments">;

type FoldAnd<Args extends unknown[], Env extends object, Last = true> = Args extends [
  infer H,
  ...infer R extends unknown[],
]
  ? Eval<H, Env> extends infer V
    ? Truthy<V> extends true
      ? FoldAnd<R, Env, V>
      : V
    : never
  : Last;

type FoldOr<Args extends unknown[], Env extends object> = Args extends [
  infer H,
  ...infer R extends unknown[],
]
  ? Eval<H, Env> extends infer V
    ? Truthy<V> extends true
      ? V
      : FoldOr<R, Env>
    : never
  : null;

type FoldStr<Args extends unknown[], Env extends object, Acc extends string = ""> = Args extends [
  infer H,
  ...infer R extends unknown[],
]
  ? FoldStr<R, Env, `${Acc}${ToStr<Eval<H, Env>>}`>
  : Acc;

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

type EvalCount<V> = V extends readonly unknown[]
  ? V["length"]
  : V extends string
    ? StrLen<V>
    : V extends null
      ? 0
      : number;

type EvalNth<Xs, I> = I extends number
  ? Xs extends Record<`${I}`, infer V>
    ? V
    : null
  : FormaTypeError<"nth expects a number index">;

type EvalGet<M, K> = K extends keyof M ? M[K] : null;

type FoldConcat<Args extends unknown[], Env extends object, Acc extends unknown[] = []> = Args extends [
  infer H,
  ...infer R extends unknown[],
]
  ? Eval<H, Env> extends infer V extends readonly unknown[]
    ? FoldConcat<R, Env, [...Acc, ...V]>
    : FormaTypeError<"concat expects lists">
  : Acc;

type FoldConj<Args extends unknown[], Env extends object> = Args extends [
  infer Coll,
  ...infer Items extends unknown[],
]
  ? Eval<Coll, Env> extends infer V extends readonly unknown[]
    ? [...V, ...EvalItems<Items, Env>]
    : FormaTypeError<"conj expects a list">
  : FormaTypeError<"conj expects a list and items">;

type MapList<F, Xs extends unknown[], Acc extends unknown[] = []> = Xs extends [
  infer H,
  ...infer R extends unknown[],
]
  ? MapList<F, R, [...Acc, Apply<F, [H]>]>
  : Acc;

type FilterList<F, Xs extends unknown[], Acc extends unknown[] = []> = Xs extends [
  infer H,
  ...infer R extends unknown[],
]
  ? Truthy<Apply<F, [H]>> extends true
    ? FilterList<F, R, [...Acc, H]>
    : FilterList<F, R, Acc>
  : Acc;

type ReduceList<F, Acc, Xs extends unknown[]> = Xs extends [infer H, ...infer R extends unknown[]]
  ? ReduceList<F, Apply<F, [Acc, H]>, R>
  : Acc;

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

/**
 * Evaluate a whole program: top-level `define`/`def` extends the environment,
 * the value of the last form is the program's value (matching the runtime
 * engine's behavior for the conformance suite).
 */
export type EvalProgram<Forms extends unknown[], Env extends object = {}, Last = null> = Forms extends [
  infer H,
  ...infer R extends unknown[],
]
  ? H extends {
      _tag: "List";
      items: [
        { _tag: "Sym"; name: "define" | "def" },
        { _tag: "Sym"; name: infer N extends string },
        infer V,
      ];
    }
    ? Eval<V, Env> extends infer Val
      ? EvalProgram<R, Bind<Env, N, Val>, Val>
      : never
    : EvalProgram<R, Env, Eval<H, Env>>
  : Last;
