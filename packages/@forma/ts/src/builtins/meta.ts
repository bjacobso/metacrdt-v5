import { Effect } from "effect";

import { ArityError, KernelTypeError } from "../diagnostic/errors.js";
import type { BuiltinFn, KMeta, KValue } from "../evaluator/types.js";
import { isKList } from "../evaluator/types.js";

function asMetaEntry(value: KValue, index: number): readonly [string, readonly KValue[]] {
  if (!isKList(value)) {
    throw new KernelTypeError({
      message: `meta: slot ${index + 1} must be a vector/list entry`,
      expected: "list",
      got: typeof value,
    });
  }

  if (value.length === 0) {
    throw new KernelTypeError({
      message: `meta: slot ${index + 1} must start with a slot keyword`,
      expected: "non-empty slot entry",
      got: "empty list",
    });
  }

  const slot = value[0];
  if (typeof slot !== "string" || !slot.startsWith(":")) {
    throw new KernelTypeError({
      message: `meta: slot ${index + 1} must start with a keyword-like slot name`,
      expected: "keyword string",
      got: typeof slot === "string" ? slot : typeof slot,
    });
  }

  return [slot, value.slice(1)] as const;
}

export const meta: BuiltinFn = (args) => {
  if (args.length === 0) {
    return Effect.fail(new ArityError({ name: "meta", expected: "1+", got: 0 }));
  }

  return Effect.try({
    try: () =>
      ({
        _tag: "KMeta",
        entries: args.map((arg, index) => asMetaEntry(arg, index)),
      }) satisfies KMeta,
    catch: (error) =>
      error instanceof KernelTypeError
        ? error
        : new KernelTypeError({
            message: error instanceof Error ? error.message : String(error),
            expected: "valid meta slot entries",
            got: "invalid meta arguments",
          }),
  });
};
