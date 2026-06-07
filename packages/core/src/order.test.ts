import { describe, expect, test } from "vitest";
import { assert, type Event } from "./event.js";
import type { Hlc } from "./hlc.js";
import { compareEvents, maxByOrder, precedes } from "./order.js";

const clk = (pt: number, l = 0, r = "r"): Hlc => ({ pt, l, r });
const mk = (over: { pt?: number; l?: number; r?: string; actor?: string; v?: unknown }): Event =>
  assert({
    e: "x",
    a: "k",
    v: (over.v ?? 1) as number,
    validFrom: 0,
    actor: over.actor ?? "a",
    hlc: clk(over.pt ?? 10, over.l ?? 0, over.r ?? "r"),
  });

describe("≺ total order (SPEC §5.1)", () => {
  test("orders by hlc.pt first", () => {
    expect(precedes(mk({ pt: 10 }), mk({ pt: 20 }))).toBe(true);
    expect(precedes(mk({ pt: 20 }), mk({ pt: 10 }))).toBe(false);
  });

  test("then by hlc logical, then replica", () => {
    expect(precedes(mk({ pt: 10, l: 0 }), mk({ pt: 10, l: 1 }))).toBe(true);
    expect(precedes(mk({ pt: 10, l: 1, r: "a" }), mk({ pt: 10, l: 1, r: "b" }))).toBe(true);
  });

  test("then by actor", () => {
    expect(precedes(mk({ pt: 10, actor: "a" }), mk({ pt: 10, actor: "b" }))).toBe(true);
  });

  test("finally by content id (tiebreak when hlc+actor equal)", () => {
    const x = mk({ pt: 10, actor: "a", v: 1 });
    const y = mk({ pt: 10, actor: "a", v: 2 });
    expect(x.id).not.toBe(y.id);
    expect(precedes(x, y)).toBe(x.id < y.id);
    expect(precedes(x, y)).not.toBe(precedes(y, x)); // antisymmetric
  });

  test("is replica-independent / total: maxByOrder is order-insensitive", () => {
    const es = [mk({ pt: 5 }), mk({ pt: 30, v: 9 }), mk({ pt: 12 }), mk({ pt: 30, v: 8 })];
    const a = maxByOrder(es)!;
    const b = maxByOrder([...es].reverse())!;
    expect(a.id).toBe(b.id);
  });

  test("compareEvents is a consistent comparator", () => {
    const es = [mk({ pt: 3 }), mk({ pt: 1 }), mk({ pt: 2 })];
    const sorted = [...es].sort(compareEvents).map((e) => e.hlc.pt);
    expect(sorted).toEqual([1, 2, 3]);
  });
});
