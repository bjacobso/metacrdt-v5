import { describe, expect, test } from "vitest";
import { Doc } from "../_generated/dataModel";
import { isVisible, valueKey } from "./visibility";

// Minimal fact factory — only the fields the predicate reads matter.
function fact(over: Partial<Doc<"facts">>): Doc<"facts"> {
  return {
    _id: "x" as Doc<"facts">["_id"],
    _creationTime: 0,
    e: "e:1",
    a: "attr",
    v: "val",
    firstTxId: "tx" as Doc<"facts">["firstTxId"],
    assertedAt: 100,
    validFrom: 100,
    ...over,
  } as Doc<"facts">;
}

describe("isVisible — transaction-time dimension", () => {
  test("not yet asserted at txTime", () => {
    expect(
      isVisible(fact({ assertedAt: 200 }), { txTime: 100, validTime: 1000 }),
    ).toBe(false);
  });

  test("asserted and not retracted", () => {
    expect(
      isVisible(fact({ assertedAt: 100 }), { txTime: 150, validTime: 1000 }),
    ).toBe(true);
  });

  test("retracted before txTime is hidden", () => {
    expect(
      isVisible(fact({ retractedAt: 120 }), { txTime: 150, validTime: 1000 }),
    ).toBe(false);
  });

  test("retracted after txTime is still visible (we hadn't retracted yet)", () => {
    expect(
      isVisible(fact({ retractedAt: 200 }), { txTime: 150, validTime: 1000 }),
    ).toBe(true);
  });

  test("includeRetracted overrides", () => {
    expect(
      isVisible(
        fact({ retractedAt: 120 }),
        { txTime: 150, validTime: 1000 },
        { includeRetracted: true },
      ),
    ).toBe(true);
  });
});

describe("isVisible — valid-time dimension", () => {
  test("validFrom after validTime is hidden", () => {
    expect(
      isVisible(
        fact({ validFrom: 500 }),
        { txTime: 1000, validTime: 400 },
      ),
    ).toBe(false);
  });

  test("validTo at/before validTime is hidden (half-open interval)", () => {
    expect(
      isVisible(
        fact({ validFrom: 100, validTo: 400 }),
        { txTime: 1000, validTime: 400 },
      ),
    ).toBe(false);
  });

  test("inside [validFrom, validTo) is visible", () => {
    expect(
      isVisible(
        fact({ validFrom: 100, validTo: 400 }),
        { txTime: 1000, validTime: 399 },
      ),
    ).toBe(true);
  });
});

describe("isVisible — tombstones", () => {
  test("tombstoned is hidden by default", () => {
    expect(
      isVisible(fact({ tombstonedAt: 130 }), { txTime: 1000, validTime: 1000 }),
    ).toBe(false);
  });

  test("includeTombstoned overrides", () => {
    expect(
      isVisible(
        fact({ tombstonedAt: 130 }),
        { txTime: 1000, validTime: 1000 },
        { includeTombstoned: true },
      ),
    ).toBe(true);
  });
});

describe("isVisible — full quadrant matrix at a fixed coordinate", () => {
  const coord = { txTime: 150, validTime: 150 };
  // asserted@100, retracted? × validFrom@100, validTo?
  test("known & true", () => {
    expect(isVisible(fact({}), coord)).toBe(true);
  });
  test("known & not-yet-true", () => {
    expect(isVisible(fact({ validFrom: 200 }), coord)).toBe(false);
  });
  test("unknown & true", () => {
    expect(isVisible(fact({ assertedAt: 200 }), coord)).toBe(false);
  });
  test("retracted & expired", () => {
    expect(
      isVisible(fact({ retractedAt: 120, validTo: 120 }), coord),
    ).toBe(false);
  });
});

describe("valueKey", () => {
  test("distinguishes types", () => {
    expect(valueKey("1")).not.toBe(valueKey(1));
    expect(valueKey(true)).not.toBe(valueKey("true"));
  });
  test("stable for equal scalars", () => {
    expect(valueKey("active")).toBe(valueKey("active"));
  });
});
