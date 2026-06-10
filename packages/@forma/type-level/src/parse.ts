/**
 * Type-level parser: token tuple in, AST out.
 *
 * The AST shape deliberately mirrors @forma/ts `SExpr` (same `_tag` names,
 * same fields) minus `loc`, so a runtime `SExpr` is structurally assignable
 * to its type-level counterpart once locations are stripped.
 */

import type { Tokenize } from "./lex.js";

export type Node =
  | { _tag: "Num"; value: number }
  | { _tag: "Str"; value: string }
  | { _tag: "Bool"; value: boolean }
  | { _tag: "Sym"; name: string }
  | { _tag: "List"; items: Node[] }
  | { _tag: "Vector"; items: Node[] }
  | { _tag: "Map"; pairs: [Node, Node][] }
  | { _tag: "Error"; message: string };

type Atom<T extends string> = T extends `"${infer V}"`
  ? { _tag: "Str"; value: V }
  : T extends "true"
    ? { _tag: "Bool"; value: true }
    : T extends "false"
      ? { _tag: "Bool"; value: false }
      : T extends `${infer N extends number}`
        ? { _tag: "Num"; value: N }
        : { _tag: "Sym"; name: T };

/** Group a flat item tuple into key/value pairs for map literals. */
type PairUp<Items extends unknown[], Acc extends unknown[] = []> = Items extends [
  infer K,
  infer V,
  ...infer Rest extends unknown[],
]
  ? PairUp<Rest, [...Acc, [K, V]]>
  : Acc;

/** Parse one form; returns [node, remaining tokens]. */
type ParseOne<Toks extends string[]> = Toks extends [
  infer H extends string,
  ...infer R extends string[],
]
  ? H extends "("
    ? ParseSeq<R, ")"> extends [infer Items extends unknown[], infer Rest extends string[]]
      ? [{ _tag: "List"; items: Items }, Rest]
      : never
    : H extends "["
      ? ParseSeq<R, "]"> extends [infer Items extends unknown[], infer Rest extends string[]]
        ? [{ _tag: "Vector"; items: Items }, Rest]
        : never
      : H extends "{"
        ? ParseSeq<R, "}"> extends [infer Items extends unknown[], infer Rest extends string[]]
          ? [{ _tag: "Map"; pairs: PairUp<Items> }, Rest]
          : never
        : H extends ")" | "]" | "}"
          ? [{ _tag: "Error"; message: `unexpected ${H}` }, R]
          : [Atom<H>, R]
  : [{ _tag: "Error"; message: "unexpected end of input" }, []];

/** Parse forms until the closing token; returns [items, remaining tokens]. */
type ParseSeq<Toks extends string[], Close extends string, Acc extends unknown[] = []> = Toks extends [
  infer H extends string,
  ...infer R extends string[],
]
  ? H extends Close
    ? [Acc, R]
    : ParseOne<Toks> extends [infer N, infer Rest extends string[]]
      ? ParseSeq<Rest, Close, [...Acc, N]>
      : never
  : [[...Acc, { _tag: "Error"; message: `missing ${Close}` }], []];

type ParseAll<Toks extends string[], Acc extends unknown[] = []> = Toks extends []
  ? Acc
  : ParseOne<Toks> extends [infer N, infer Rest extends string[]]
    ? ParseAll<Rest, [...Acc, N]>
    : Acc;

/** Parse a single form from source. `Parse<"(+ 1 2)">` */
export type Parse<S extends string> = ParseOne<Tokenize<S>>[0];

/** Parse a whole program (zero or more top-level forms). */
export type ParseProgram<S extends string> = ParseAll<Tokenize<S>>;
