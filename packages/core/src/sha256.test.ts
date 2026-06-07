import { describe, expect, test } from "vitest";
import { sha256 } from "./sha256.js";
import { utf8 } from "./value.js";

const hex = (b: Uint8Array) =>
  [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

describe("sha256 (NIST vectors)", () => {
  test("empty string", () => {
    expect(hex(sha256(utf8("")))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test('"abc"', () => {
    expect(hex(sha256(utf8("abc")))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("two-block message", () => {
    expect(
      hex(sha256(utf8("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"))),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  test("deterministic", () => {
    expect(hex(sha256(utf8("metacrdt")))).toBe(hex(sha256(utf8("metacrdt"))));
  });
});
