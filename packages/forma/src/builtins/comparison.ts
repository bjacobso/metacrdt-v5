import { Effect } from "effect";
import type { BuiltinFn } from "../evaluator/types.js";
import { asNumber, kEquals } from "../evaluator/types.js";
import { ArityError } from "../diagnostic/errors.js";

export const eq: BuiltinFn = (args) => {
  if (args.length < 2)
    return Effect.fail(new ArityError({ name: "=", expected: "2+", got: args.length }));
  for (let i = 1; i < args.length; i++) {
    if (!kEquals(args[0]!, args[i]!)) return Effect.succeed(false);
  }
  return Effect.succeed(true);
};

export const neq: BuiltinFn = (args) => {
  if (args.length !== 2)
    return Effect.fail(new ArityError({ name: "!=", expected: 2, got: args.length }));
  return Effect.succeed(!kEquals(args[0]!, args[1]!));
};

export const lt: BuiltinFn = (args) => {
  if (args.length !== 2)
    return Effect.fail(new ArityError({ name: "<", expected: 2, got: args.length }));
  return Effect.succeed(asNumber(args[0]!, "<") < asNumber(args[1]!, "<"));
};

export const gt: BuiltinFn = (args) => {
  if (args.length !== 2)
    return Effect.fail(new ArityError({ name: ">", expected: 2, got: args.length }));
  return Effect.succeed(asNumber(args[0]!, ">") > asNumber(args[1]!, ">"));
};

export const lte: BuiltinFn = (args) => {
  if (args.length !== 2)
    return Effect.fail(new ArityError({ name: "<=", expected: 2, got: args.length }));
  return Effect.succeed(asNumber(args[0]!, "<=") <= asNumber(args[1]!, "<="));
};

export const gte: BuiltinFn = (args) => {
  if (args.length !== 2)
    return Effect.fail(new ArityError({ name: ">=", expected: 2, got: args.length }));
  return Effect.succeed(asNumber(args[0]!, ">=") >= asNumber(args[1]!, ">="));
};

export const comparisonBuiltins: Record<string, BuiltinFn> = {
  "=": eq,
  "!=": neq,
  "<": lt,
  ">": gt,
  "<=": lte,
  ">=": gte,
};
