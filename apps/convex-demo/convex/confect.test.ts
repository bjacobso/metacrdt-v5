/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { STAFFING_BLUEPRINT } from "./appconfig";
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

  test("summarizes config history through a typed Confect sidecar query", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      vi.setSystemTime(1_000);
      await t.mutation(api.appconfig.setupStaffing, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      vi.setSystemTime(2_000);
      await t.mutation(api.appconfig.applyConfig, {
        config: {
          requirements: STAFFING_BLUEPRINT.requirements.filter(
            (r) => r.form !== "forklift",
          ),
        },
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const plain = await t.query(api.configHistory.history, { limit: 1 });
      const typed = await t.query(api.metacrdtConfect.configHistory, { limit: 1 });

      expect(typed[0]).toMatchObject({
        actorId: "config",
        changedKinds: ["requirement"],
        totalManifestChanges: 1,
        removed: [{ kind: "requirement", value: "forklift" }],
      });
      expect(typed[0].added).toEqual(plain[0].added);
      expect(typed[0].removed).toEqual(plain[0].removed);
      expect(typed[0].events.length).toBe(plain[0].events.length);
      expect(typed[0].eventCounts).toContainEqual({
        kind: "assert",
        count: expect.any(Number),
      });

      vi.setSystemTime(3_000);
      await t.mutation(api.appconfig.applyConfig, {
        config: {
          requirements: STAFFING_BLUEPRINT.requirements.filter(
            (r) => r.form !== "forklift",
          ),
        },
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const idempotent = await t.query(api.metacrdtConfect.configHistory, {
        limit: 1,
      });
      expect(idempotent[0]).toMatchObject({
        changedKinds: [],
        totalManifestChanges: 0,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
