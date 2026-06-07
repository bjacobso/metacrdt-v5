import { describe, expect, test } from "vitest";
import { assert, retract, tombstone, untombstone, type Event } from "./event.js";
import type { Hlc } from "./hlc.js";
import { fromEvents, merge } from "./log.js";
import { type CardinalityOf, type Coord, entity, value, valueOf, visible } from "./fold.js";

const clk = (pt: number, l = 0, r = "r"): Hlc => ({ pt, l, r });
const at = (txTime: number, validTime = txTime): Coord => ({ txTime, validTime });
const ONE: CardinalityOf = () => "one";
const MANY: CardinalityOf = () => "many";

const A = (
  e: string,
  a: string,
  v: unknown,
  pt: number,
  opts: { validFrom?: number; validTo?: number | null; actor?: string; r?: string } = {},
): Event =>
  assert({
    e,
    a,
    v: v as number,
    validFrom: opts.validFrom ?? 0,
    validTo: opts.validTo ?? null,
    actor: opts.actor ?? "u",
    hlc: clk(pt, 0, opts.r ?? "r"),
  });

describe("visibility predicate (SPEC §5.3)", () => {
  test("transaction time: invisible before its assert, visible after", () => {
    const a = A("x", "k", 1, 10);
    const log = fromEvents([a]);
    expect(visible(a, at(5), log)).toBe(false);
    expect(visible(a, at(15), log)).toBe(true);
  });

  test("retract hides in transaction time (and includeRetracted overrides)", () => {
    const a = A("x", "k", 1, 10);
    const r = retract({ target: a.id, actor: "u", hlc: clk(20) });
    const log = fromEvents([a, r]);
    expect(visible(a, at(15), log)).toBe(true);
    expect(visible(a, at(25), log)).toBe(false);
    expect(visible(a, at(25), log, { includeRetracted: true })).toBe(true);
  });

  test("valid-time interval is half-open [validFrom, validTo)", () => {
    const a = A("x", "k", 1, 0, { validFrom: 100, validTo: 200 });
    const log = fromEvents([a]);
    expect(visible(a, at(1000, 50), log)).toBe(false); // before validFrom
    expect(visible(a, at(1000, 150), log)).toBe(true); // inside
    expect(visible(a, at(1000, 200), log)).toBe(false); // == validTo excluded
    expect(visible(a, at(1000, 250), log)).toBe(false); // after
  });

  test("tombstone hides; untombstone restores; flag overrides", () => {
    const a = A("x", "k", 1, 10);
    const t = tombstone({ target: a.id, actor: "u", hlc: clk(30) });
    const log1 = fromEvents([a, t]);
    expect(visible(a, at(40), log1)).toBe(false);
    expect(visible(a, at(40), log1, { includeTombstoned: true })).toBe(true);

    const u = untombstone({ target: a.id, actor: "u", hlc: clk(50) });
    const log2 = fromEvents([a, t, u]);
    expect(visible(a, at(45), log2)).toBe(false); // before untombstone
    expect(visible(a, at(55), log2)).toBe(true); // after untombstone
  });
});

describe("cardinality-one supersession is ≺-maximal, order-independent (SPEC §5.2)", () => {
  test("higher hlc wins regardless of insertion order", () => {
    const lo = A("x", "k", "old", 10);
    const hi = A("x", "k", "new", 20);
    expect(valueOf("x", "k", at(100), fromEvents([lo, hi]), ONE)).toBe("new");
    expect(valueOf("x", "k", at(100), fromEvents([hi, lo]), ONE)).toBe("new");
  });

  test("concurrent (equal hlc) resolves by actor, deterministically", () => {
    const a = A("x", "k", "fromA", 10, { actor: "a" });
    const b = A("x", "k", "fromB", 10, { actor: "b" });
    // ≺ orders a before b (actor "a" < "b"), so b is the ≺-max winner.
    expect(valueOf("x", "k", at(100), fromEvents([a, b]), ONE)).toBe("fromB");
    expect(valueOf("x", "k", at(100), fromEvents([b, a]), ONE)).toBe("fromB");
  });

  test("cardinality-many keeps all visible asserts", () => {
    const a = A("x", "tag", "red", 10);
    const b = A("x", "tag", "blue", 20);
    const vals = value("x", "tag", at(100), fromEvents([a, b]), MANY) as Event[];
    expect(new Set(vals.map((e) => e.v))).toEqual(new Set(["red", "blue"]));
  });
});

describe("fold determinism / convergence (SPEC §5.4)", () => {
  const evs = [
    A("worker:maria", "name", "Maria", 1),
    A("worker:maria", "status", "active", 5),
    A("worker:maria", "status", "terminated", 9),
    A("worker:maria", "tag", "x", 3),
    A("worker:maria", "tag", "y", 4),
    A("employer:acme", "name", "Acme", 2),
  ];
  const card: CardinalityOf = (a) => (a === "tag" ? "many" : "one");

  test("entity projection is identical under any insertion order", () => {
    const forward = entity("worker:maria", at(100), fromEvents(evs), card);
    const reversed = entity("worker:maria", at(100), fromEvents([...evs].reverse()), card);
    const shuffled = entity(
      "worker:maria",
      at(100),
      fromEvents([evs[2]!, evs[0]!, evs[4]!, evs[1]!, evs[3]!, evs[5]!]),
      card,
    );
    const norm = (m: Record<string, Event | Event[]>) =>
      Object.fromEntries(
        Object.entries(m).map(([k, val]) => [
          k,
          Array.isArray(val) ? val.map((e) => e.v).sort() : val.v,
        ]),
      );
    expect(norm(forward)).toEqual(norm(reversed));
    expect(norm(forward)).toEqual(norm(shuffled));
  });

  test("cardinality-one resolves to the latest by ≺ (status = terminated)", () => {
    expect(valueOf("worker:maria", "status", at(100), fromEvents(evs), card)).toBe(
      "terminated",
    );
  });

  test("merging two replicas' logs converges to the same projection", () => {
    const r1 = fromEvents(evs.slice(0, 3));
    const r2 = fromEvents(evs.slice(2));
    const m12 = merge(r1, r2);
    const m21 = merge(r2, r1);
    expect(valueOf("worker:maria", "status", at(100), m12, card)).toBe(
      valueOf("worker:maria", "status", at(100), m21, card),
    );
  });
});
