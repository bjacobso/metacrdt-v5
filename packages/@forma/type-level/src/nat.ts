/**
 * Type-level integer arithmetic via tuple counters.
 *
 * Literal non-negative integers compute exactly (`Add<1, 2>` is `3`); anything
 * else — widened `number`, negatives, floats — degrades gracefully to `number`
 * so the evaluator never lies, it just loses precision.
 */

type Tup<N extends number, T extends unknown[] = []> = T["length"] extends N
  ? T
  : Tup<N, [...T, unknown]>;

/**
 * Tuple construction is tail-recursive and capped at ~1000 iterations by the
 * compiler, so operand literals are limited to 3 digits (results may be
 * larger — `Mul<150, 40>` is still exactly `6000`). Bigger operands widen.
 */
type AtMost3Chars<S extends string> = S extends `${string}${infer R1}`
  ? R1 extends `${string}${infer R2}`
    ? R2 extends `${string}${infer R3}`
      ? R3 extends ""
        ? true
        : false
      : true
    : true
  : true;

/** Literal non-negative integer small enough for tuple counters? */
export type IsNat<N extends number> = number extends N
  ? false
  : `${N}` extends `-${string}` | `${string}.${string}` | `${string}e${string}`
    ? false
    : AtMost3Chars<`${N}`>;

type AddNat<A extends number, B extends number> = [...Tup<A>, ...Tup<B>]["length"] & number;

type SubNat<A extends number, B extends number> = Tup<A> extends [...Tup<B>, ...infer R]
  ? R["length"] & number
  : number; // would go negative — out of tuple-counter range

type MulNat<
  A extends number,
  B extends number,
  Acc extends unknown[] = [],
  I extends unknown[] = [],
> = I["length"] extends B ? Acc["length"] & number : MulNat<A, B, [...Acc, ...Tup<A>], [...I, unknown]>;

type LteNat<A extends number, B extends number> = Tup<B> extends [...Tup<A>, ...unknown[]]
  ? true
  : false;

type BothNat<A extends number, B extends number> = IsNat<A> extends true ? IsNat<B> : false;

export type Add<A extends number, B extends number> = BothNat<A, B> extends true
  ? AddNat<A, B>
  : number;

export type Sub<A extends number, B extends number> = BothNat<A, B> extends true
  ? SubNat<A, B>
  : number;

export type Mul<A extends number, B extends number> = BothNat<A, B> extends true
  ? MulNat<A, B> extends infer R extends number
    ? R
    : number
  : number;

export type Lte<A extends number, B extends number> = BothNat<A, B> extends true
  ? LteNat<A, B>
  : boolean;

export type Lt<A extends number, B extends number> = BothNat<A, B> extends true
  ? A extends B
    ? false
    : LteNat<A, B>
  : boolean;

export type Gt<A extends number, B extends number> = Lt<B, A>;
export type Gte<A extends number, B extends number> = Lte<B, A>;
