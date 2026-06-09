import { describe, expect, test } from "vitest";
import { foldEventsForFactProjection, isFactVisible, valueKey } from "./visibility";
import type { FactProjectionRow } from "./types";

const fact: FactProjectionRow = {
  _id: "fact:1",
  e: "worker:1",
  a: "worker.status",
  v: "active",
  assertedAt: 100,
  validFrom: 90,
};

describe("@metacrdt/convex projection visibility", () => {
  test("maps projected facts into a core fold", () => {
    const { assertEv, log } = foldEventsForFactProjection(fact);
    expect(assertEv.kind).toBe("assert");
    expect(assertEv.e).toBe("worker:1");
    expect(log.size).toBe(1);
  });

  test("honors bitemporal coordinates", () => {
    expect(isFactVisible(fact, { txTime: 99, validTime: 100 })).toBe(false);
    expect(isFactVisible(fact, { txTime: 100, validTime: 89 })).toBe(false);
    expect(isFactVisible(fact, { txTime: 100, validTime: 90 })).toBe(true);
  });

  test("hides retracted facts unless requested", () => {
    const retracted = { ...fact, retractedAt: 150 };
    expect(isFactVisible(retracted, { txTime: 160, validTime: 100 })).toBe(false);
    expect(
      isFactVisible(retracted, { txTime: 160, validTime: 100 }, {
        includeRetracted: true,
      }),
    ).toBe(true);
  });

  test("tombstone visibility is time-indexed (SPEC §5.3)", () => {
    const tombstoned = { ...fact, tombstonedAt: 150 };
    // Before the tombstone landed, the assert was visible: "what was known then".
    expect(isFactVisible(tombstoned, { txTime: 120, validTime: 100 })).toBe(true);
    expect(isFactVisible(tombstoned, { txTime: 150, validTime: 100 })).toBe(false);
    expect(
      isFactVisible(tombstoned, { txTime: 150, validTime: 100 }, {
        includeTombstoned: true,
      }),
    ).toBe(true);
  });

  test("provides stable scalar value keys", () => {
    expect(valueKey("active")).toBe("string:active");
    expect(valueKey(1)).toBe("number:1");
    expect(valueKey(true)).toBe("boolean:true");
    expect(valueKey(null)).toBe("null");
  });
});
