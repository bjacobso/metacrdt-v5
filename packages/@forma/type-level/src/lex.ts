/**
 * Type-level lexer: a literal source string in, a tuple of token strings out.
 *
 * Mirrors the @forma/ts reader's surface: parens/brackets/braces, `,` as
 * whitespace, `;` line comments, `"..."` strings (no escapes at the type
 * level), and bare atoms (symbols, keywords, numbers, booleans).
 *
 * String tokens keep their surrounding quotes so the parser can tell
 * `"true"` (a string) from `true` (a boolean).
 */

type WS = " " | "\n" | "\t" | "\r" | ",";
type Delim = "(" | ")" | "[" | "]" | "{" | "}";

type SkipLine<S extends string> = S extends `${infer C}${infer R}`
  ? C extends "\n"
    ? R
    : SkipLine<R>
  : "";

/** Read a string body up to the closing quote; returns [token, rest]. */
type ReadStr<S extends string, Acc extends string = ""> = S extends `${infer C}${infer R}`
  ? C extends `"`
    ? [`"${Acc}"`, R]
    : ReadStr<R, `${Acc}${C}`>
  : [`"${Acc}"`, ""]; // unterminated — tolerate, parser sees a string

/** Read a bare atom up to whitespace/delimiter; returns [token, rest]. */
type ReadAtom<S extends string, Acc extends string = ""> = S extends `${infer C}${infer R}`
  ? C extends WS | Delim | `"` | ";"
    ? [Acc, S]
    : ReadAtom<R, `${Acc}${C}`>
  : [Acc, ""];

export type Tokenize<S extends string, Acc extends string[] = []> = S extends ""
  ? Acc
  : S extends `${infer C}${infer R}`
    ? C extends WS
      ? Tokenize<R, Acc>
      : C extends ";"
        ? Tokenize<SkipLine<R>, Acc>
        : C extends Delim
          ? Tokenize<R, [...Acc, C]>
          : C extends `"`
            ? ReadStr<R> extends [infer T extends string, infer Rest extends string]
              ? Tokenize<Rest, [...Acc, T]>
              : never
            : ReadAtom<S> extends [infer T extends string, infer Rest extends string]
              ? Tokenize<Rest, [...Acc, T]>
              : never
    : Acc;
