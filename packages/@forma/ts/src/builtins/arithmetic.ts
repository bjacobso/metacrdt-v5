import { Effect } from "effect";
import type { BuiltinFn } from "../evaluator/types.js";
import { asNumber } from "../evaluator/types.js";
import { ArityError } from "../diagnostic/errors.js";

export const add: BuiltinFn = (args) => {
  let sum = 0;
  for (const a of args) sum += asNumber(a, "+");
  return Effect.succeed(sum);
};

export const sub: BuiltinFn = (args) => {
  if (args.length === 0) return Effect.fail(new ArityError({ name: "-", expected: "1+", got: 0 }));
  if (args.length === 1) return Effect.succeed(-asNumber(args[0]!, "-"));
  let result = asNumber(args[0]!, "-");
  for (let i = 1; i < args.length; i++) result -= asNumber(args[i]!, "-");
  return Effect.succeed(result);
};

export const mul: BuiltinFn = (args) => {
  let product = 1;
  for (const a of args) product *= asNumber(a, "*");
  return Effect.succeed(product);
};

export const div: BuiltinFn = (args) => {
  if (args.length < 2)
    return Effect.fail(new ArityError({ name: "/", expected: "2+", got: args.length }));
  let result = asNumber(args[0]!, "/");
  for (let i = 1; i < args.length; i++) {
    const d = asNumber(args[i]!, "/");
    if (d === 0) return Effect.succeed(Infinity);
    result /= d;
  }
  return Effect.succeed(result);
};

export const mod: BuiltinFn = (args) => {
  if (args.length !== 2)
    return Effect.fail(new ArityError({ name: "mod", expected: 2, got: args.length }));
  return Effect.succeed(asNumber(args[0]!, "mod") % asNumber(args[1]!, "mod"));
};

export const abs: BuiltinFn = (args) => {
  if (args.length !== 1)
    return Effect.fail(new ArityError({ name: "abs", expected: 1, got: args.length }));
  return Effect.succeed(Math.abs(asNumber(args[0]!, "abs")));
};

export const min: BuiltinFn = (args) => {
  if (args.length === 0)
    return Effect.fail(new ArityError({ name: "min", expected: "1+", got: 0 }));
  let result = asNumber(args[0]!, "min");
  for (let i = 1; i < args.length; i++) {
    const v = asNumber(args[i]!, "min");
    if (v < result) result = v;
  }
  return Effect.succeed(result);
};

export const max: BuiltinFn = (args) => {
  if (args.length === 0)
    return Effect.fail(new ArityError({ name: "max", expected: "1+", got: 0 }));
  let result = asNumber(args[0]!, "max");
  for (let i = 1; i < args.length; i++) {
    const v = asNumber(args[i]!, "max");
    if (v > result) result = v;
  }
  return Effect.succeed(result);
};

export const round: BuiltinFn = (args) => {
  if (args.length !== 1)
    return Effect.fail(new ArityError({ name: "round", expected: 1, got: args.length }));
  return Effect.succeed(Math.round(asNumber(args[0]!, "round")));
};

export const ceil: BuiltinFn = (args) => {
  if (args.length !== 1)
    return Effect.fail(new ArityError({ name: "ceil", expected: 1, got: args.length }));
  return Effect.succeed(Math.ceil(asNumber(args[0]!, "ceil")));
};

export const floor: BuiltinFn = (args) => {
  if (args.length !== 1)
    return Effect.fail(new ArityError({ name: "floor", expected: 1, got: args.length }));
  return Effect.succeed(Math.floor(asNumber(args[0]!, "floor")));
};

export const arithmeticBuiltins: Record<string, BuiltinFn> = {
  "+": add,
  "-": sub,
  "*": mul,
  "/": div,
  mod,
  abs,
  min,
  max,
  round,
  ceil,
  floor,
};
