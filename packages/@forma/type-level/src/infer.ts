/**
 * Type-level *checker*: an AST (from ./parse) in, a widened TypeScript type
 * out — `number`, not `3`. This is the forma-type view of the program rather
 * than the forma-value view that ./eval computes.
 *
 * Widening makes everything radically simpler and removes eval's caps:
 *   - no tuple-counter arithmetic (no 3-digit operand limit, negatives and
 *     floats are fine) — `(+ a b)` just checks both sides against `number`
 *   - vectors infer as `El[]` (forma's `List<T>`), so `map`/`filter`/`reduce`
 *     apply their closure to the *element type* once, not once per element
 *   - programs of any value size typecheck; only source length is bounded
 *
 * What stays literal: keywords (they are row labels — `(get m :b)` needs the
 * key ":b" to index the map's object type). Everything else widens:
 * `Num → number`, `Str → string`, `Bool → boolean`, `nil → null`.
 *
 * An environment of TS types can seed the checker (see `ToForma` in index.ts):
 * `Check<Ast, { a: number; b: number }>` types `(+ a b)` as `number`.
 */

export type FormaTypeError<M extends string> = { __formaTypeError: M };

type Flatten<T> = { [K in keyof T]: T[K] } & {};

type Bind<E extends object, K extends string, V> = Flatten<Omit<E, K> & { [P in K]: V }>;

type Closure = { _tag: "Closure"; params: string[]; body: unknown[]; env: object };

/**
 * Truthiness over widened types: `false`/`null` are definitely falsy, string
 * literals (keywords) and structural values are definitely truthy, `boolean`
 * and nullable unions are unknown — `if`/`cond` then produce a branch union.
 */
type Truthy<V> = [V] extends [null | false]
  ? false
  : boolean extends V
    ? boolean
    : [V] extends [boolean]
      ? boolean
      : null extends V
        ? boolean
        : true;

// ---------------------------------------------------------------------------
// Core dispatch
// ---------------------------------------------------------------------------

export type Check<E, Env extends object = {}> = E extends { _tag: "Num" }
  ? number
  : E extends { _tag: "Str" }
    ? string
    : E extends { _tag: "Bool" }
      ? boolean
      : E extends { _tag: "Sym"; name: infer N extends string }
        ? CheckSym<N, Env>
        : E extends { _tag: "Vector"; items: infer Items extends unknown[] }
          ? ItemsUnion<Items, Env>[]
          : E extends { _tag: "Map"; pairs: infer Pairs extends unknown[] }
            ? CheckMapLit<Pairs, Env>
            : E extends { _tag: "List"; items: infer Items extends unknown[] }
              ? CheckList<Items, Env>
              : E extends { _tag: "Error"; message: infer M extends string }
                ? FormaTypeError<`parse error: ${M}`>
                : FormaTypeError<"unsupported expression">;

type CheckSym<N extends string, Env extends object> = N extends `:${string}`
  ? N // keywords stay literal: they are row labels
  : N extends "nil"
    ? null
    : N extends keyof Env
      ? Env[N]
      : FormaTypeError<`unbound symbol: ${N}`>;

type ItemsUnion<Items extends unknown[], Env extends object, Acc = never> = Items extends [
  infer H,
  ...infer R extends unknown[],
]
  ? ItemsUnion<R, Env, Acc | Check<H, Env>>
  : Acc;

type CheckItems<Items extends unknown[], Env extends object, Acc extends unknown[] = []> = Items extends [
  infer H,
  ...infer R extends unknown[],
]
  ? CheckItems<R, Env, [...Acc, Check<H, Env>]>
  : Acc;

type CheckMapLit<Pairs extends unknown[], Env extends object, Acc extends object = {}> = Pairs extends [
  [infer K, infer V],
  ...infer R extends unknown[],
]
  ? CheckMapLit<R, Env, Acc & { [P in Check<K, Env> & string]: Check<V, Env> }>
  : Flatten<Acc>;

type CheckList<Items extends unknown[], Env extends object> = Items extends [
  { _tag: "Sym"; name: infer Op extends string },
  ...infer Args extends unknown[],
]
  ? CheckForm<Op, Args, Env>
  : Items extends [infer H, ...infer Args extends unknown[]]
    ? Apply<Check<H, Env>, CheckItems<Args, Env>>
    : null;

// ---------------------------------------------------------------------------
// Special forms and builtins
// ---------------------------------------------------------------------------

type CheckForm<Op extends string, Args extends unknown[], Env extends object> = Op extends "if"
  ? CheckIf<Args, Env>
  : Op extends "cond"
    ? CheckCond<Args, Env>
    : Op extends "let"
      ? Args extends [{ _tag: "Vector"; items: infer B extends unknown[] }, ...infer Body extends unknown[]]
        ? CheckLet<B, Body, Env>
        : FormaTypeError<"let expects a binding vector">
      : Op extends "fn"
        ? Args extends [{ _tag: "Vector"; items: infer P extends unknown[] }, ...infer Body extends unknown[]]
          ? { _tag: "Closure"; params: ParamNames<P>; body: Body; env: Env }
          : FormaTypeError<"fn expects a parameter vector">
        : Op extends "do"
          ? CheckDo<Args, Env>
          : Op extends "+" | "-" | "*" | "/"
            ? NumFold<Args, Env>
            : Op extends "=" | "not"
              ? boolean
              : Op extends "<" | ">" | "<=" | ">="
                ? NumFold<Args, Env> extends number
                  ? boolean
                  : FormaTypeError<"comparison expects numbers">
                : Op extends "and" | "or"
                  ? ItemsUnion<Args, Env>
                  : Op extends "str"
                    ? string
                    : Op extends "count"
                      ? number
                      : Op extends "nth" | "first"
                        ? Check<Args[0], Env> extends readonly (infer El)[]
                          ? El
                          : FormaTypeError<`${Op} expects a list`>
                        : Op extends "rest"
                          ? Check<Args[0], Env> extends readonly (infer El)[]
                            ? El[]
                            : FormaTypeError<"rest expects a list">
                          : Op extends "concat"
                            ? ConcatUnion<Args, Env>[]
                            : Op extends "conj"
                              ? Args extends [infer Coll, ...infer Items extends unknown[]]
                                ? Check<Coll, Env> extends readonly (infer El)[]
                                  ? (El | ItemsUnion<Items, Env>)[]
                                  : FormaTypeError<"conj expects a list">
                                : FormaTypeError<"conj expects a list and items">
                              : Op extends "get"
                                ? CheckGet<Check<Args[0], Env>, Check<Args[1], Env>>
                                : Op extends "map"
                                  ? Check<Args[1], Env> extends readonly (infer El)[]
                                    ? Apply<Check<Args[0], Env>, [El]>[]
                                    : FormaTypeError<"map expects a list">
                                  : Op extends "filter"
                                    ? Check<Args[1], Env> extends readonly (infer El)[]
                                      ? El[]
                                      : FormaTypeError<"filter expects a list">
                                    : Op extends "reduce"
                                      ? Check<Args[2], Env> extends readonly (infer El)[]
                                        ? Check<Args[1], Env> extends infer Init
                                          ? Init | Apply<Check<Args[0], Env>, [Init, El]>
                                          : never
                                        : FormaTypeError<"reduce expects a list">
                                      : ApplyNamed<Op, Args, Env>;

type ApplyNamed<Op extends string, Args extends unknown[], Env extends object> = CheckSym<
  Op,
  Env
> extends infer F
  ? F extends Closure
    ? Apply<F, CheckItems<Args, Env>>
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
  ? CheckDo<B, BindAll<P, Vals, E>>
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

type CheckIf<Args extends unknown[], Env extends object> = Args extends [
  infer C,
  infer T,
  ...infer F extends unknown[],
]
  ? Truthy<Check<C, Env>> extends true
    ? Check<T, Env>
    : Truthy<Check<C, Env>> extends false
      ? F extends [infer E]
        ? Check<E, Env>
        : null
      : Check<T, Env> | (F extends [infer E] ? Check<E, Env> : null)
  : FormaTypeError<"if expects a condition and a then-branch">;

type CheckCond<Args extends unknown[], Env extends object> = Args extends [
  infer Test,
  infer Val,
  ...infer Rest extends unknown[],
]
  ? Truthy<Check<Test, Env>> extends true
    ? Check<Val, Env>
    : Truthy<Check<Test, Env>> extends false
      ? CheckCond<Rest, Env>
      : Check<Val, Env> | CheckCond<Rest, Env>
  : null;

type CheckLet<Bindings extends unknown[], Body extends unknown[], Env extends object> = Bindings extends [
  { _tag: "Sym"; name: infer N extends string },
  infer V,
  ...infer Rest extends unknown[],
]
  ? CheckLet<Rest, Body, Bind<Env, N, Check<V, Env>>>
  : CheckDo<Body, Env>;

type CheckDo<Forms extends unknown[], Env extends object> = Forms extends [infer H]
  ? Check<H, Env>
  : Forms extends [unknown, ...infer R extends unknown[]]
    ? CheckDo<R, Env>
    : null;

// ---------------------------------------------------------------------------
// Builtin helpers
// ---------------------------------------------------------------------------

/** All args must check as numbers; the result is `number`. */
type NumFold<Args extends unknown[], Env extends object> = Args extends [
  infer H,
  ...infer R extends unknown[],
]
  ? Check<H, Env> extends number
    ? NumFold<R, Env>
    : FormaTypeError<"arithmetic expects numbers">
  : number;

type ConcatUnion<Args extends unknown[], Env extends object, Acc = never> = Args extends [
  infer H,
  ...infer R extends unknown[],
]
  ? Check<H, Env> extends readonly (infer El)[]
    ? ConcatUnion<R, Env, Acc | El>
    : FormaTypeError<"concat expects lists">
  : Acc;

type CheckGet<M, K> = K extends keyof M ? M[K] : null;

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export type CheckProgram<Forms extends unknown[], Env extends object = {}, Last = null> = Forms extends [
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
    ? Check<V, Env> extends infer Val
      ? CheckProgram<R, Bind<Env, N, Val>, Val>
      : never
    : CheckProgram<R, Env, Check<H, Env>>
  : Last;
