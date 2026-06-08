import { Effect } from "effect";
import type { BuiltinFn, KValue } from "../evaluator/types.js";
import { asList, isKMap, isKList } from "../evaluator/types.js";
import { ArityError, KernelTypeError } from "../diagnostic/errors.js";

export const get: BuiltinFn = (args) => {
  if (args.length < 2 || args.length > 3)
    return Effect.fail(new ArityError({ name: "get", expected: "2-3", got: args.length }));
  const coll = args[0]!;
  const key = args[1]!;
  const defaultVal = args.length === 3 ? args[2]! : null;

  if (isKMap(coll)) {
    if (typeof key !== "string")
      return Effect.fail(
        new KernelTypeError({
          message: "get: map key must be a string",
          expected: "string",
          got: typeof key,
        }),
      );
    const v = coll.get(key);
    return Effect.succeed(v !== undefined ? v : defaultVal);
  }
  if (isKList(coll)) {
    if (typeof key !== "number")
      return Effect.fail(
        new KernelTypeError({
          message: "get: list index must be a number",
          expected: "number",
          got: typeof key,
        }),
      );
    const v = coll[key];
    return Effect.succeed(v !== undefined ? v : defaultVal);
  }
  return Effect.succeed(defaultVal);
};

export const getIn: BuiltinFn = (args) => {
  if (args.length < 2 || args.length > 3)
    return Effect.fail(new ArityError({ name: "get-in", expected: "2-3", got: args.length }));
  let current: KValue = args[0]!;
  const path = asList(args[1]!, "get-in");
  const defaultVal = args.length === 3 ? args[2]! : null;

  for (const key of path) {
    if (current === null) return Effect.succeed(defaultVal);
    if (isKMap(current)) {
      if (typeof key !== "string") return Effect.succeed(defaultVal);
      const mapVal = current.get(key);
      current = mapVal !== undefined ? mapVal : null;
    } else if (isKList(current)) {
      if (typeof key !== "number") return Effect.succeed(defaultVal);
      const listVal: KValue | undefined = current[key];
      current = listVal !== undefined ? listVal : null;
    } else {
      return Effect.succeed(defaultVal);
    }
  }
  return Effect.succeed(current ?? defaultVal);
};

const keyCandidates = (key: KValue): readonly string[] | null => {
  if (typeof key === "string") {
    return key.startsWith(":") ? [key, key.slice(1)] : [key, `:${key}`];
  }
  if (typeof key === "number") {
    return [String(key), `:${key}`];
  }
  return null;
};

const getMapValue = (map: ReadonlyMap<string, KValue>, key: KValue): KValue | undefined => {
  const candidates = keyCandidates(key);
  if (!candidates) return undefined;

  for (const candidate of candidates) {
    if (map.has(candidate)) return map.get(candidate);
  }

  return undefined;
};

/**
 * Safe path access for runtime expression payloads.
 *
 * Unlike `get-in`, this accepts variadic path segments and tolerates either
 * plain object keys (`name`) or keyword-style keys (`:name`).
 */
export const path: BuiltinFn = (args) => {
  if (args.length < 1) {
    return Effect.fail(new ArityError({ name: "path", expected: "1+", got: args.length }));
  }

  let current: KValue = args[0]!;
  for (const segment of args.slice(1)) {
    if (current === null) return Effect.succeed(null);

    if (segment === "length" && (typeof current === "string" || isKList(current))) {
      current = current.length;
      continue;
    }

    if (isKMap(current)) {
      current = getMapValue(current, segment) ?? null;
      continue;
    }

    if (isKList(current)) {
      if (typeof segment !== "number") return Effect.succeed(null);
      current = current[segment] ?? null;
      continue;
    }

    return Effect.succeed(null);
  }

  return Effect.succeed(current);
};

export const assoc: BuiltinFn = (args) => {
  if (args.length < 3 || args.length % 2 === 0)
    return Effect.fail(new ArityError({ name: "assoc", expected: "3+", got: args.length }));
  const coll = args[0]!;
  if (!isKMap(coll))
    return Effect.fail(
      new KernelTypeError({
        message: "assoc: first arg must be a map",
        expected: "map",
        got: typeof coll,
      }),
    );
  const result = new Map(coll);
  for (let i = 1; i < args.length; i += 2) {
    const k = args[i]!;
    if (typeof k !== "string")
      return Effect.fail(
        new KernelTypeError({
          message: "assoc: key must be a string",
          expected: "string",
          got: typeof k,
        }),
      );
    result.set(k, args[i + 1]!);
  }
  return Effect.succeed(result as ReadonlyMap<string, KValue>);
};

export const dissoc: BuiltinFn = (args) => {
  if (args.length < 2)
    return Effect.fail(new ArityError({ name: "dissoc", expected: "2+", got: args.length }));
  const coll = args[0]!;
  if (!isKMap(coll))
    return Effect.fail(
      new KernelTypeError({
        message: "dissoc: first arg must be a map",
        expected: "map",
        got: typeof coll,
      }),
    );
  const result = new Map(coll);
  for (let i = 1; i < args.length; i++) {
    const k = args[i]!;
    if (typeof k === "string") result.delete(k);
  }
  return Effect.succeed(result as ReadonlyMap<string, KValue>);
};

export const keys: BuiltinFn = (args) => {
  if (args.length !== 1)
    return Effect.fail(new ArityError({ name: "keys", expected: 1, got: args.length }));
  const coll = args[0]!;
  if (!isKMap(coll))
    return Effect.fail(
      new KernelTypeError({
        message: "keys: arg must be a map",
        expected: "map",
        got: typeof coll,
      }),
    );
  return Effect.succeed([...coll.keys()] as readonly KValue[]);
};

export const vals: BuiltinFn = (args) => {
  if (args.length !== 1)
    return Effect.fail(new ArityError({ name: "vals", expected: 1, got: args.length }));
  const coll = args[0]!;
  if (!isKMap(coll))
    return Effect.fail(
      new KernelTypeError({
        message: "vals: arg must be a map",
        expected: "map",
        got: typeof coll,
      }),
    );
  return Effect.succeed([...coll.values()] as readonly KValue[]);
};

export const merge: BuiltinFn = (args) => {
  const result = new Map<string, KValue>();
  for (const a of args) {
    if (!isKMap(a))
      return Effect.fail(
        new KernelTypeError({
          message: "merge: all args must be maps",
          expected: "map",
          got: typeof a,
        }),
      );
    for (const [k, v] of a) {
      result.set(k, v);
    }
  }
  return Effect.succeed(result as ReadonlyMap<string, KValue>);
};

export const selectKeys: BuiltinFn = (args) => {
  if (args.length !== 2)
    return Effect.fail(new ArityError({ name: "select-keys", expected: 2, got: args.length }));
  const coll = args[0]!;
  if (!isKMap(coll))
    return Effect.fail(
      new KernelTypeError({
        message: "select-keys: first arg must be a map",
        expected: "map",
        got: typeof coll,
      }),
    );
  const keyList = asList(args[1]!, "select-keys");
  const result = new Map<string, KValue>();
  for (const k of keyList) {
    if (typeof k === "string" && coll.has(k)) {
      result.set(k, coll.get(k)!);
    }
  }
  return Effect.succeed(result as ReadonlyMap<string, KValue>);
};

export const id: BuiltinFn = (args) => {
  if (args.length !== 1)
    return Effect.fail(new ArityError({ name: "id", expected: 1, got: args.length }));
  const value = args[0]!;
  if (typeof value === "string") return Effect.succeed(value);
  return Effect.succeed(null);
};

export const dataBuiltins: Record<string, BuiltinFn> = {
  get,
  "get-in": getIn,
  path,
  assoc,
  dissoc,
  keys,
  vals,
  merge,
  "select-keys": selectKeys,
  id,
};
