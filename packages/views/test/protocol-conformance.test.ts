import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { ViewSpec } from "../src/index.js";

const FIXTURE_DIR = resolve(import.meta.dirname, "fixtures");

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), "utf8")) as unknown;
}

describe("ViewSpec protocol conformance fixtures", () => {
  it("accepts valid ViewSpec fixtures", () => {
    const fixture = readFixture("viewspec-valid.json");
    const decoded = Schema.decodeUnknownSync(ViewSpec)(fixture);
    expect(decoded.$viewSpec?.version).toBe("2");
    expect(decoded.root.type).toBe("text");
  });

  it("rejects invalid ViewSpec fixtures", () => {
    expect(() =>
      Schema.decodeUnknownSync(ViewSpec)(readFixture("viewspec-invalid.json")),
    ).toThrow();
  });
});
