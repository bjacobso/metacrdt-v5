import { Effect } from "effect";
import type { BuiltinFn, KValue } from "../evaluator/types.js";
import { asString } from "../evaluator/types.js";
import { ArityError } from "../diagnostic/errors.js";
import * as T from "../reader/types.js";
import type { Loc } from "../reader/types.js";

/** Synthetic loc for generated AST nodes */
const synLoc: Loc = { start: 0, end: 0, line: 1, col: 1 };

function stringify(v: KValue): string {
  if (v === null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return String(v);
  return String(v);
}

export const str: BuiltinFn = (args) => {
  return Effect.succeed(args.map(stringify).join(""));
};

export const upper: BuiltinFn = (args) => {
  if (args.length !== 1)
    return Effect.fail(new ArityError({ name: "upper", expected: 1, got: args.length }));
  return Effect.succeed(asString(args[0]!, "upper").toUpperCase());
};

export const lower: BuiltinFn = (args) => {
  if (args.length !== 1)
    return Effect.fail(new ArityError({ name: "lower", expected: 1, got: args.length }));
  return Effect.succeed(asString(args[0]!, "lower").toLowerCase());
};

export const trim: BuiltinFn = (args) => {
  if (args.length !== 1)
    return Effect.fail(new ArityError({ name: "trim", expected: 1, got: args.length }));
  return Effect.succeed(asString(args[0]!, "trim").trim());
};

export const containsQ: BuiltinFn = (args) => {
  if (args.length !== 2)
    return Effect.fail(new ArityError({ name: "contains?", expected: 2, got: args.length }));
  return Effect.succeed(asString(args[0]!, "contains?").includes(asString(args[1]!, "contains?")));
};

export const startsWithQ: BuiltinFn = (args) => {
  if (args.length !== 2)
    return Effect.fail(new ArityError({ name: "starts-with?", expected: 2, got: args.length }));
  return Effect.succeed(
    asString(args[0]!, "starts-with?").startsWith(asString(args[1]!, "starts-with?")),
  );
};

export const endsWithQ: BuiltinFn = (args) => {
  if (args.length !== 2)
    return Effect.fail(new ArityError({ name: "ends-with?", expected: 2, got: args.length }));
  return Effect.succeed(
    asString(args[0]!, "ends-with?").endsWith(asString(args[1]!, "ends-with?")),
  );
};

export const format: BuiltinFn = (args) => {
  if (args.length < 1)
    return Effect.fail(new ArityError({ name: "format", expected: "1+", got: 0 }));
  const template = asString(args[0]!, "format");
  let i = 1;
  const result = template.replace(/\{\}/g, () => {
    if (i < args.length) return stringify(args[i++]!);
    return "{}";
  });
  return Effect.succeed(result);
};

export const sym: BuiltinFn = (args) => {
  if (args.length !== 1)
    return Effect.fail(new ArityError({ name: "sym", expected: 1, got: args.length }));
  const s = asString(args[0]!, "sym");
  return Effect.succeed({ _tag: "KSExpr" as const, expr: T.Sym(s, synLoc) });
};

export const keyword: BuiltinFn = (args) => {
  if (args.length !== 1)
    return Effect.fail(new ArityError({ name: "keyword", expected: 1, got: args.length }));
  const s = asString(args[0]!, "keyword");
  return Effect.succeed(s.startsWith(":") ? s : ":" + s);
};

export const stringBuiltins: Record<string, BuiltinFn> = {
  str,
  upper,
  lower,
  trim,
  "contains?": containsQ,
  "starts-with?": startsWithQ,
  "ends-with?": endsWithQ,
  format,
  sym,
  keyword,
};
