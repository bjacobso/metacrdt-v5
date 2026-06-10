/**
 * The type-level engine is a third forma engine: every test asserts BOTH the
 * compile-time type (computed by the type-level evaluator) and the runtime
 * value (computed by the real @forma/ts engine) — they must agree.
 *
 * Type assertions are checked by `tsc --noEmit` (pnpm typecheck); value
 * assertions run under vitest.
 */

import { describe, expect, expectTypeOf, test } from "vitest";
import { forma, formaExact, parse } from "../src/index.js";
import type { Infer, TypeOf } from "../src/index.js";

describe("arithmetic", () => {
  test("(+ 1 2) is literally 3", () => {
    const x = formaExact("(+ 1 2)");
    expectTypeOf(x).toEqualTypeOf<3>();
    expect(x).toBe(3);
  });

  test("untagged template literal form", () => {
    const x = formaExact(`(* (+ 1 2) 4)`);
    expectTypeOf(x).toEqualTypeOf<12>();
    expect(x).toBe(12);
  });

  test("results may exceed the 3-digit operand cap", () => {
    const x = formaExact("(* 150 40)");
    expectTypeOf(x).toEqualTypeOf<6000>();
    expect(x).toBe(6000);
  });

  test("subtraction", () => {
    const x = formaExact("(- (* 15 40) 400)");
    expectTypeOf(x).toEqualTypeOf<200>();
    expect(x).toBe(200);
  });
});

describe("special forms", () => {
  test("if + comparison", () => {
    const x = formaExact('(if (< (+ 1 2) 10) "small" "big")');
    expectTypeOf(x).toEqualTypeOf<"small">();
    expect(x).toBe("small");
  });

  test("nil is falsy", () => {
    const x = formaExact("(if nil 1 2)");
    expectTypeOf(x).toEqualTypeOf<2>();
    expect(x).toBe(2);
  });

  test("let with map literal result", () => {
    const x = formaExact(`(let [rate 150
                          hours 4
                          revenue (* rate hours)
                          cost 400]
                      {:revenue revenue :cost cost :margin (- revenue cost)})`);
    expectTypeOf(x).toEqualTypeOf<{ ":revenue": 600; ":cost": 400; ":margin": 200 }>();
    expect(x).toEqual({ ":revenue": 600, ":cost": 400, ":margin": 200 });
  });

  test("define + cond + application across a program", () => {
    const x = formaExact(`(define grade (fn [score]
                       (cond (>= score 90) "A"
                             (>= score 80) "B"
                             :else "F")))
                     (grade 95)`);
    expectTypeOf(x).toEqualTypeOf<"A">();
    expect(x).toBe("A");
  });

  test("immediately applied lambda", () => {
    const x = formaExact("((fn [x] (* x x)) 7)");
    expectTypeOf(x).toEqualTypeOf<49>();
    expect(x).toBe(49);
  });
});

describe("collections", () => {
  test("map with a closure", () => {
    const x = formaExact("(map (fn [x] (* x 2)) [1 2 3])");
    expectTypeOf(x).toEqualTypeOf<[2, 4, 6]>();
    expect(x).toEqual([2, 4, 6]);
  });

  test("filter", () => {
    const x = formaExact("(filter (fn [x] (> x 1)) [1 2 3])");
    expectTypeOf(x).toEqualTypeOf<[2, 3]>();
    expect(x).toEqual([2, 3]);
  });

  test("reduce", () => {
    const x = formaExact("(reduce (fn [acc n] (+ acc n)) 0 [1 2 3 4])");
    expectTypeOf(x).toEqualTypeOf<10>();
    expect(x).toBe(10);
  });

  test("count / nth / first / rest", () => {
    const c = formaExact("(count [10 20 30])");
    expectTypeOf(c).toEqualTypeOf<3>();
    expect(c).toBe(3);

    const n = formaExact("(nth [10 20 30] 1)");
    expectTypeOf(n).toEqualTypeOf<20>();
    expect(n).toBe(20);

    const f = formaExact("(first [10 20 30])");
    expectTypeOf(f).toEqualTypeOf<10>();
    expect(f).toBe(10);

    const r = formaExact("(rest [10 20 30])");
    expectTypeOf(r).toEqualTypeOf<[20, 30]>();
    expect(r).toEqual([20, 30]);
  });

  test("concat / conj", () => {
    const a = formaExact("(concat [1 2] [3 4])");
    expectTypeOf(a).toEqualTypeOf<[1, 2, 3, 4]>();
    expect(a).toEqual([1, 2, 3, 4]);

    const b = formaExact("(conj [1 2] 3)");
    expectTypeOf(b).toEqualTypeOf<[1, 2, 3]>();
    expect(b).toEqual([1, 2, 3]);
  });

  test("get on a map literal", () => {
    const x = formaExact("(get {:a 1 :b 2} :b)");
    expectTypeOf(x).toEqualTypeOf<2>();
    expect(x).toBe(2);
  });
});

describe("strings, keywords, equality", () => {
  test("str concatenation includes numbers", () => {
    const x = formaExact('(str "n=" (+ 1 2))');
    expectTypeOf(x).toEqualTypeOf<"n=3">();
    expect(x).toBe("n=3");
  });

  test("keywords self-evaluate to strings", () => {
    const x = formaExact(":hello");
    expectTypeOf(x).toEqualTypeOf<":hello">();
    expect(x).toBe(":hello");
  });

  test("structural equality on maps", () => {
    const x = formaExact("(= {:a 1} {:a 1})");
    expectTypeOf(x).toEqualTypeOf<true>();
    expect(x).toBe(true);
  });
});

describe("parse", () => {
  test("typed AST mirrors the runtime reader (locations stripped)", () => {
    const ast = parse("(+ 1 2)");
    expectTypeOf(ast).toEqualTypeOf<
      [
        {
          _tag: "List";
          items: [{ _tag: "Sym"; name: "+" }, { _tag: "Num"; value: 1 }, { _tag: "Num"; value: 2 }];
        },
      ]
    >();
    expect(ast).toEqual([
      {
        _tag: "List",
        items: [
          { _tag: "Sym", name: "+" },
          { _tag: "Num", value: 1 },
          { _tag: "Num", value: 2 },
        ],
      },
    ]);
  });
});

describe("typed mode (widened forma types)", () => {
  test("(+ 1 2) is number, not 3", () => {
    const x = forma("(+ 1 2)");
    expectTypeOf(x).toEqualTypeOf<number>();
    expect(x).toBe(3);
  });

  test("no operand caps: big numbers, negatives, floats", () => {
    const x = forma("(- (* 6000 4000) 0.5)");
    expectTypeOf(x).toEqualTypeOf<number>();
    expect(x).toBe(23_999_999.5);
  });

  test("if produces a branch union (here: string)", () => {
    const x = forma('(if (< 1 2) "yes" "no")');
    expectTypeOf(x).toEqualTypeOf<string>();
    expect(x).toBe("yes");
  });

  test("map literal types as a row", () => {
    const x = forma('{:total (+ 1 2) :label "sum"}');
    expectTypeOf(x).toEqualTypeOf<{ ":total": number; ":label": string }>();
    expect(x).toEqual({ ":total": 3, ":label": "sum" });
  });

  test("define + cond program types as string", () => {
    const x = forma(`(define grade (fn [score]
                       (cond (>= score 90) "A"
                             (>= score 80) "B"
                             :else "F")))
                     (grade 95)`);
    expectTypeOf(x).toEqualTypeOf<string>();
    expect(x).toBe("A");
  });

  test("type errors are visible, not silent any", () => {
    type Oops = TypeOf<'(+ 1 "x")'>;
    expectTypeOf<Oops>().toEqualTypeOf<{ __formaTypeError: "arithmetic expects numbers" }>();
  });
});

describe("typed mode with bindings", () => {
  test("scalars: (+ a b)", () => {
    const x = forma("(+ a b)", { a: 1, b: 3 });
    expectTypeOf(x).toEqualTypeOf<number>();
    expect(x).toBe(4);
  });

  test("strings flow through str", () => {
    const x = forma('(str greeting " " name)', { greeting: "hello", name: "ben" });
    expectTypeOf(x).toEqualTypeOf<string>();
    expect(x).toBe("hello ben");
  });

  test("objects become keyword-keyed maps", () => {
    const x = forma("(get user :age)", { user: { age: 42, name: "ben" } });
    expectTypeOf(x).toEqualTypeOf<number>();
    expect(x).toBe(42);
  });

  test("arrays become lists; closures apply to the element type", () => {
    const x = forma("(map (fn [x] (* x factor)) xs)", { xs: [1, 2, 3], factor: 2 });
    expectTypeOf(x).toEqualTypeOf<number[]>();
    expect(x).toEqual([2, 4, 6]);
  });

  test("nested data round-trips with types intact", () => {
    const x = forma(
      `(let [total (reduce (fn [acc o] (+ acc (get o :amount))) 0 orders)]
         {:count (count orders) :total total})`,
      { orders: [{ amount: 10 }, { amount: 20 }, { amount: 30 }] },
    );
    expectTypeOf(x).toEqualTypeOf<{ ":count": number; ":total": number }>();
    expect(x).toEqual({ ":count": 3, ":total": 60 });
  });

  test("misspelled binding is a visible type error", () => {
    type Oops = TypeOf<"(+ a c)", { a: number; b: number }>;
    expectTypeOf<Oops>().toEqualTypeOf<{ __formaTypeError: "arithmetic expects numbers" }>();
  });
});

describe("type-only (no runtime at all)", () => {
  test("Infer works as a pure type", () => {
    type Three = Infer<"(+ 1 2)">;
    expectTypeOf<Three>().toEqualTypeOf<3>();

    type Doubled = Infer<"(map (fn [x] (* x 2)) [1 2 3])">;
    expectTypeOf<Doubled>().toEqualTypeOf<[2, 4, 6]>();

    // errors are visible types, not silent `any`
    type Oops = Infer<"(+ 1 unknown-symbol)">;
    expectTypeOf<Oops>().toEqualTypeOf<{ __formaTypeError: "+ expects numbers" }>();
  });
});
