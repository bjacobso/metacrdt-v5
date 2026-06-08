/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("Confect sidecar spike", () => {
  test("verifies protocol-shaped fact events through @metacrdt/core", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await t.mutation(api.facts.assertFact, {
      e: "worker:confect",
      a: "worker.status",
      value: "active",
      reason: "confect spike",
    });

    const events = await t.query(api.metacrdtConfect.verifyEvents, {
      e: "worker:confect",
      a: "worker.status",
      requireValid: true,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "assert",
      e: "worker:confect",
      a: "worker.status",
      hasProtocolMetadata: true,
      verifiable: true,
      validEventId: true,
    });
  });

  test("surfaces typed Confect errors across the Convex boundary", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });

    await expect(
      t.query(api.metacrdtConfect.verifyEvents, {
        e: "missing:entity",
      }),
    ).rejects.toMatchObject({
      data: {
        _tag: "UnknownEntity",
        e: "missing:entity",
      },
    });
  });

  test("explains derived facts through protocol source event ids", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await t.mutation(api.rules.defineRule, {
        name: "confect_missing_i9",
        where: [
          ["?e", "employee.status", "active"],
          ["?e", "i9.completed", false],
        ],
        emit: { e: "?e", a: "compliance.violation", v: "missing_i9" },
        dependsOnAttributes: ["employee.status", "i9.completed"],
      });
      await t.mutation(api.facts.assertFact, {
        e: "worker:confect-derived",
        a: "employee.status",
        value: "active",
      });
      await t.mutation(api.facts.assertFact, {
        e: "worker:confect-derived",
        a: "i9.completed",
        value: false,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const explained = await t.query(api.metacrdtConfect.explainDerived, {
        e: "worker:confect-derived",
        a: "compliance.violation",
      });

      expect(explained).toHaveLength(1);
      expect(explained[0]).toMatchObject({
        e: "worker:confect-derived",
        a: "compliance.violation",
        v: "missing_i9",
      });
      expect(explained[0].because.map((b) => b.a).sort()).toEqual([
        "employee.status",
        "i9.completed",
      ]);
      expect(explained[0].because.every((b) => b.eventId !== undefined)).toBe(
        true,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("surfaces typed Confect errors for missing derived explanations", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });

    await expect(
      t.query(api.metacrdtConfect.explainDerived, {
        e: "missing:derived",
      }),
    ).rejects.toMatchObject({
      data: {
        _tag: "UnknownDerivedFact",
        e: "missing:derived",
      },
    });
  });
});
