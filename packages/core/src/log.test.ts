import { describe, expect, test } from "vitest";
import { assert, type Event } from "./event.js";
import type { Hlc } from "./hlc.js";
import { emptyLog, events, fromEvents, merge } from "./log.js";

const clk = (pt: number): Hlc => ({ pt, l: 0, r: "r" });
const mk = (pt: number, v: number): Event =>
  assert({ e: "x", a: "k", v, validFrom: 0, actor: "a", hlc: clk(pt) });

const idset = (log: ReturnType<typeof fromEvents>) =>
  new Set(events(log).map((e) => e.id));
const eq = (a: Set<string>, b: Set<string>) =>
  a.size === b.size && [...a].every((x) => b.has(x));

describe("G-Set log merge (SPEC §4.3)", () => {
  const a = mk(1, 1);
  const b = mk(2, 2);
  const c = mk(3, 3);
  const L1 = fromEvents([a, b]);
  const L2 = fromEvents([b, c]);
  const L3 = fromEvents([c]);

  test("merge = union", () => {
    expect(idset(merge(L1, L2))).toEqual(new Set([a.id, b.id, c.id]));
  });

  test("commutative", () => {
    expect(eq(idset(merge(L1, L2)), idset(merge(L2, L1)))).toBe(true);
  });

  test("associative", () => {
    const left = merge(merge(L1, L2), L3);
    const right = merge(L1, merge(L2, L3));
    expect(eq(idset(left), idset(right))).toBe(true);
  });

  test("idempotent", () => {
    expect(eq(idset(merge(L1, L1)), idset(L1))).toBe(true);
  });

  test("empty log is the identity", () => {
    expect(eq(idset(merge(L1, emptyLog())), idset(L1))).toBe(true);
  });

  test("duplicate delivery of the same event is absorbed", () => {
    expect(idset(fromEvents([a, a, b])).size).toBe(2);
  });
});
