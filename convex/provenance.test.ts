/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function flush(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("provenance", () => {
  test("a rule's derived fact records the source facts that justify it", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await t.mutation(api.rules.defineRule, {
        name: "missing_i9",
        where: [
          ["?e", "employee.status", "active"],
          ["?e", "i9.completed", false],
        ],
        emit: { e: "?e", a: "compliance.violation", v: "missing_i9" },
        dependsOnAttributes: ["employee.status", "i9.completed"],
      });
      await t.mutation(api.facts.assertFact, {
        e: "w:1",
        a: "employee.status",
        value: "active",
      });
      await t.mutation(api.facts.assertFact, {
        e: "w:1",
        a: "i9.completed",
        value: false,
      });
      await flush(t);

      const explained = await t.query(api.rules.explainDerived, { e: "w:1" });
      expect(explained).toHaveLength(1);
      const v = explained[0];
      expect(v.v).toBe("missing_i9");
      // Justified by exactly the two source facts that matched the rule body.
      expect(v.because.map((b) => b.a).sort()).toEqual([
        "employee.status",
        "i9.completed",
      ]);
      // Each source carries its asserting transaction's actor.
      expect(v.because.every((b) => b.actor !== undefined)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("transitive-closure pairs carry their full edge-path provenance", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      // a -> b -> c
      await t.mutation(api.facts.assertFact, { e: "a", a: "reportsTo", value: "b" });
      await t.mutation(api.facts.assertFact, { e: "b", a: "reportsTo", value: "c" });
      await t.mutation(api.rules.defineTransitiveRule, {
        name: "reportsToClosure",
        baseAttribute: "reportsTo",
        closureAttribute: "reportsTo+",
        maxDepth: 16,
      });
      await flush(t);

      const explained = await t.query(api.rules.explainDerived, {
        e: "a",
        a: "reportsTo+",
      });
      const toB = explained.find((r) => r.v === "b");
      const toC = explained.find((r) => r.v === "c");

      // a -> b is justified by one edge; a ->* c by both edges.
      expect(toB?.because).toHaveLength(1);
      expect(toC?.because).toHaveLength(2);
      expect(toC?.because.every((b) => b.a === "reportsTo")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("incremental closure add propagates provenance", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await t.mutation(api.facts.assertFact, { e: "x", a: "links", value: "y" });
      await t.mutation(api.rules.defineTransitiveRule, {
        name: "linksClosure",
        baseAttribute: "links",
        closureAttribute: "links+",
        maxDepth: 16,
      });
      await flush(t);

      // Extend y -> z via the incremental add path.
      await t.mutation(api.facts.assertFact, { e: "y", a: "links", value: "z" });
      await flush(t);

      const explained = await t.query(api.rules.explainDerived, {
        e: "x",
        a: "links+",
      });
      const toZ = explained.find((r) => r.v === "z");
      // x ->* z went through two edges (x->y, y->z).
      expect(toZ?.because).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
