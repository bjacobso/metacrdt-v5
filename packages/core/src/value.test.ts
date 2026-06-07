import { describe, expect, test } from "vitest";
import { canonicalString } from "./value.js";

describe("canonical encoding (SPEC §A.1)", () => {
  test("map key order is irrelevant", () => {
    expect(canonicalString({ a: 1, b: 2 })).toBe(canonicalString({ b: 2, a: 1 }));
  });

  test("nested key order is irrelevant", () => {
    const x = { z: { b: 1, a: 2 }, y: [3, { d: 4, c: 5 }] };
    const y = { y: [3, { c: 5, d: 4 }], z: { a: 2, b: 1 } };
    expect(canonicalString(x)).toBe(canonicalString(y));
  });

  test("types are distinct: number 1 ≠ string \"1\"", () => {
    expect(canonicalString(1)).not.toBe(canonicalString("1"));
  });

  test("types are distinct: true ≠ \"true\" ≠ 1", () => {
    expect(canonicalString(true)).not.toBe(canonicalString("true"));
    expect(canonicalString(true)).not.toBe(canonicalString(1));
  });

  test("null distinct from false and from missing", () => {
    expect(canonicalString(null)).not.toBe(canonicalString(false));
    expect(canonicalString({ a: null })).not.toBe(canonicalString({}));
  });

  test("array order is significant", () => {
    expect(canonicalString([1, 2])).not.toBe(canonicalString([2, 1]));
  });

  test("bytes are encoded distinctly from their hex string", () => {
    expect(canonicalString(new Uint8Array([0xab]))).not.toBe(canonicalString("ab"));
  });

  test("-0 and 0 canonicalize identically", () => {
    expect(canonicalString(-0)).toBe(canonicalString(0));
  });

  test("reproducible", () => {
    const v = { name: "Maria", tags: ["x", "y"], n: 3.5, ok: true };
    expect(canonicalString(v)).toBe(canonicalString(v));
  });
});
