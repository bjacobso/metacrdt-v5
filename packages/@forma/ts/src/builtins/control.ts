import { Effect } from "effect";
import type { BuiltinFn, KValue } from "../evaluator/types.js";
import { asKFn, asList, asString } from "../evaluator/types.js";
import { ArityError, FailError } from "../diagnostic/errors.js";

export const pipe: BuiltinFn = (args, apply) => {
  if (args.length < 2)
    return Effect.fail(new ArityError({ name: "pipe", expected: "2+", got: args.length }));
  return Effect.gen(function* () {
    let value: KValue = args[0]!;
    for (let i = 1; i < args.length; i++) {
      const fn = asKFn(args[i]!, "pipe");
      value = yield* apply(fn, [value]);
    }
    return value;
  });
};

export const fail: BuiltinFn = (args) => {
  if (args.length !== 1)
    return Effect.fail(new ArityError({ name: "fail", expected: 1, got: args.length }));
  return Effect.fail(new FailError({ message: asString(args[0]!, "fail") }));
};

export const apply: BuiltinFn = (args, invoke) => {
  if (args.length < 2)
    return Effect.fail(new ArityError({ name: "apply", expected: "2+", got: args.length }));
  const fn = args[0]!;
  const trailing = asList(args[args.length - 1]!, "apply");
  return invoke(fn, [...args.slice(1, -1), ...trailing]);
};

export const controlBuiltins: Record<string, BuiltinFn> = {
  apply,
  pipe,
  fail,
};
