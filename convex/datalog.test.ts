/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function flush(t: ReturnType<typeof convexTest>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function assert(
  t: ReturnType<typeof convexTest>,
  e: string,
  a: string,
  value: unknown,
) {
  await t.mutation(api.facts.assertFact, { e, a, value });
}

describe("comparison predicates", () => {
  test("filters numeric bindings with > and <", async () => {
    const t = convexTest(schema, modules);
    await assert(t, "p:1", "type", "Person");
    await assert(t, "p:1", "salary", 120000);
    await assert(t, "p:2", "type", "Person");
    await assert(t, "p:2", "salary", 80000);

    const high = await t.query(api.datalog.datalog, {
      where: [
        ["?e", "type", "Person"],
        ["?e", "salary", "?s"],
        ["?s", ">", 100000],
      ],
      select: ["?e"],
    });
    expect(high).toEqual([{ e: "p:1" }]);
  });

  test("== and != operate on values", async () => {
    const t = convexTest(schema, modules);
    await assert(t, "p:1", "role", "admin");
    await assert(t, "p:2", "role", "viewer");

    const notAdmin = await t.query(api.datalog.datalog, {
      where: [
        ["?e", "role", "?r"],
        ["?r", "!=", "admin"],
      ],
      select: ["?e", "?r"],
    });
    expect(notAdmin).toEqual([{ e: "p:2", r: "viewer" }]);
  });
});

describe("negation", () => {
  test("not-clause excludes bindings with a matching fact", async () => {
    const t = convexTest(schema, modules);
    await assert(t, "e:1", "type", "Employee");
    await assert(t, "e:2", "type", "Employee");
    await assert(t, "e:2", "status", "terminated");

    const active = await t.query(api.datalog.datalog, {
      where: [
        ["?e", "type", "Employee"],
        { not: ["?e", "status", "terminated"] },
      ],
      select: ["?e"],
    });
    expect(active).toEqual([{ e: "e:1" }]);
  });

  test("unsafe query (negation var never bound) throws", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.datalog.datalog, {
        where: [{ not: ["?ghost", "status", "x"] }],
        select: ["?ghost"],
      }),
    ).rejects.toThrow(/unsafe/);
  });
});

describe("derived facts are queryable", () => {
  test("a rule's output can be joined in a later Datalog query", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await t.mutation(api.rules.defineRule, {
        name: "vip",
        where: [["?e", "tier", "gold"]],
        emit: { e: "?e", a: "flag", v: "vip" },
        dependsOnAttributes: ["tier"],
      });
      await assert(t, "c:1", "tier", "gold");
      await assert(t, "c:1", "type", "Customer");
      await flush(t);

      // "flag" only exists as a derived fact — querying it proves the engine
      // unions facts ∪ derivedFacts.
      const vips = await t.query(api.datalog.datalog, {
        where: [
          ["?e", "type", "Customer"],
          ["?e", "flag", "vip"],
        ],
        select: ["?e"],
      });
      expect(vips).toEqual([{ e: "c:1" }]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("transitive closure", () => {
  test("materializes reachability and is queryable", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      // Chain: a -> b -> c -> d
      await assert(t, "a", "reportsTo", "b");
      await assert(t, "b", "reportsTo", "c");
      await assert(t, "c", "reportsTo", "d");

      await t.mutation(api.rules.defineTransitiveRule, {
        name: "reportsToClosure",
        baseAttribute: "reportsTo",
        closureAttribute: "reportsTo+",
        maxDepth: 16,
      });
      await flush(t);

      // a transitively reports to b, c, and d.
      const aReaches = await t.query(api.datalog.datalog, {
        where: [["a", "reportsTo+", "?x"]],
        select: ["?x"],
      });
      expect(aReaches.map((r) => r.x).sort()).toEqual(["b", "c", "d"]);

      // Direct reports of a are only b.
      const direct = await t.query(api.datalog.datalog, {
        where: [["a", "reportsTo", "?x"]],
        select: ["?x"],
      });
      expect(direct).toEqual([{ x: "b" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("recomputes when the base relation changes", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await assert(t, "x", "links", "y");
      await t.mutation(api.rules.defineTransitiveRule, {
        name: "linksClosure",
        baseAttribute: "links",
        closureAttribute: "links+",
        maxDepth: 16,
      });
      await flush(t);

      let reach = await t.query(api.datalog.datalog, {
        where: [["x", "links+", "?z"]],
        select: ["?z"],
      });
      expect(reach.map((r) => r.z).sort()).toEqual(["y"]);

      // Extend the chain y -> z; closure should pick up z for x.
      await assert(t, "y", "links", "z");
      await flush(t);

      reach = await t.query(api.datalog.datalog, {
        where: [["x", "links+", "?z"]],
        select: ["?z"],
      });
      expect(reach.map((r) => r.z).sort()).toEqual(["y", "z"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
