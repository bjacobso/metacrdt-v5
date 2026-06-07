import { describe, expect, test } from "vitest";
import { compareHlc, initialClock, receive, tick, type Hlc } from "./hlc.js";

describe("hybrid logical clock (SPEC §A.2)", () => {
  test("tick advances logical when wall does not move", () => {
    const c0: Hlc = { pt: 100, l: 0, r: "a" };
    const c1 = tick(c0, 100, "a");
    expect(c1).toEqual({ pt: 100, l: 1, r: "a" });
  });

  test("tick resets logical when wall moves forward", () => {
    const c0: Hlc = { pt: 100, l: 5, r: "a" };
    const c1 = tick(c0, 150, "a");
    expect(c1).toEqual({ pt: 150, l: 0, r: "a" });
  });

  test("receive takes max physical and bumps logical past both", () => {
    const local: Hlc = { pt: 100, l: 2, r: "a" };
    const remote: Hlc = { pt: 100, l: 7, r: "b" };
    const c = receive(local, remote, 100, "a");
    expect(c).toEqual({ pt: 100, l: 8, r: "a" });
  });

  test("receive jumps to a future remote", () => {
    const local: Hlc = { pt: 100, l: 9, r: "a" };
    const remote: Hlc = { pt: 200, l: 1, r: "b" };
    const c = receive(local, remote, 120, "a");
    expect(c).toEqual({ pt: 200, l: 2, r: "a" });
  });

  test("compareHlc orders by pt, then l, then r", () => {
    expect(compareHlc({ pt: 1, l: 9, r: "z" }, { pt: 2, l: 0, r: "a" })).toBeLessThan(0);
    expect(compareHlc({ pt: 1, l: 0, r: "z" }, { pt: 1, l: 1, r: "a" })).toBeLessThan(0);
    expect(compareHlc({ pt: 1, l: 1, r: "a" }, { pt: 1, l: 1, r: "b" })).toBeLessThan(0);
    expect(compareHlc({ pt: 1, l: 1, r: "a" }, { pt: 1, l: 1, r: "a" })).toBe(0);
  });

  test("monotonic across repeated ticks (deterministic, no Date.now)", () => {
    let c = initialClock("a");
    const seen: string[] = [];
    for (const wall of [10, 10, 10, 12, 12]) {
      c = tick(c, wall, "a");
      seen.push(`${c.pt}.${c.l}`);
    }
    expect(seen).toEqual(["10.0", "10.1", "10.2", "12.0", "12.1"]);
  });
});
