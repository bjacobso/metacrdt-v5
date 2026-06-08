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

describe("disjunction", () => {
  test("or-clause unions branch results", async () => {
    const t = convexTest(schema, modules);
    await assert(t, "w:1", "type", "Worker");
    await assert(t, "w:1", "worker.status", "active");
    await assert(t, "w:2", "type", "Worker");
    await assert(t, "w:2", "worker.status", "pending");
    await assert(t, "w:3", "type", "Worker");
    await assert(t, "w:3", "worker.status", "terminated");

    const rows = await t.query(api.datalog.datalog, {
      where: [
        ["?e", "type", "Worker"],
        {
          or: [
            [["?e", "worker.status", "active"]],
            [["?e", "worker.status", "pending"]],
          ],
        },
      ],
      select: ["?e"],
    });
    expect(rows.map((r) => r.e).sort()).toEqual(["w:1", "w:2"]);
  });

  test("or branches can bind variables and continue joining", async () => {
    const t = convexTest(schema, modules);
    await assert(t, "worker:a", "type", "Worker");
    await assert(t, "worker:a", "primarySite", "site:1");
    await assert(t, "worker:b", "type", "Worker");
    await assert(t, "worker:b", "secondarySite", "site:1");
    await assert(t, "worker:c", "type", "Worker");
    await assert(t, "worker:c", "secondarySite", "site:2");
    await assert(t, "site:1", "region", "west");
    await assert(t, "site:2", "region", "east");

    const rows = await t.query(api.datalog.datalog, {
      where: [
        ["?e", "type", "Worker"],
        {
          or: [
            [["?e", "primarySite", "?site"]],
            [["?e", "secondarySite", "?site"]],
          ],
        },
        ["?site", "region", "west"],
      ],
      select: ["?e", "?site"],
    });
    expect(rows).toEqual([
      { e: "worker:a", site: "site:1" },
      { e: "worker:b", site: "site:1" },
    ]);
  });

  test("or branches support compare and not filters", async () => {
    const t = convexTest(schema, modules);
    await assert(t, "p:1", "type", "Person");
    await assert(t, "p:1", "score", 95);
    await assert(t, "p:2", "type", "Person");
    await assert(t, "p:2", "tier", "gold");
    await assert(t, "p:2", "blocked", true);
    await assert(t, "p:3", "type", "Person");
    await assert(t, "p:3", "tier", "gold");

    const rows = await t.query(api.datalog.datalog, {
      where: [
        ["?e", "type", "Person"],
        {
          or: [
            [
              ["?e", "score", "?s"],
              ["?s", ">=", 90],
            ],
            [
              ["?e", "tier", "gold"],
              { not: ["?e", "blocked", true] },
            ],
          ],
        },
      ],
      select: ["?e"],
    });
    expect(rows.map((r) => r.e).sort()).toEqual(["p:1", "p:3"]);
  });

  test("unsafe or branch throws", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.query(api.datalog.datalog, {
        where: [
          {
            or: [
              [["?e", "type", "Worker"]],
              [["?score", ">", 10]],
            ],
          },
        ],
        select: ["?e"],
      }),
    ).rejects.toThrow(/unsafe/);
  });

  test("explainDatalog classifies or branches", async () => {
    const t = convexTest(schema, modules);
    const plan = await t.query(api.datalog.explainDatalog, {
      where: [
        {
          or: [
            [["?e", "kind", "A"]],
            [["?e", "kind", "B"]],
          ],
        },
      ],
    });
    expect(plan.clauses).toEqual([
      {
        kind: "or",
        branches: [
          [{ kind: "pattern", e: "?e", a: "\"kind\"", v: "\"A\"" }],
          [{ kind: "pattern", e: "?e", a: "\"kind\"", v: "\"B\"" }],
        ],
      },
    ]);
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

  test("incremental add extends the closure when an edge is asserted", async () => {
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

      // Asserting y -> z takes the semi-naive add path; x should now reach z too.
      await assert(t, "y", "links", "z");
      await flush(t);

      reach = await t.query(api.datalog.datalog, {
        where: [["x", "links+", "?z"]],
        select: ["?z"],
      });
      expect(reach.map((r) => r.z).sort()).toEqual(["y", "z"]);

      // And prepending w -> x propagates w to {x, y, z}.
      await assert(t, "w", "links", "x");
      await flush(t);
      const wReach = await t.query(api.datalog.datalog, {
        where: [["w", "links+", "?z"]],
        select: ["?z"],
      });
      expect(wReach.map((r) => r.z).sort()).toEqual(["x", "y", "z"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("full recompute on retraction removes unreachable pairs", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await assert(t, "a", "chain", "b");
      const bc = await t.mutation(api.facts.assertFact, {
        e: "b",
        a: "chain",
        value: "c",
      });
      await t.mutation(api.rules.defineTransitiveRule, {
        name: "chainClosure",
        baseAttribute: "chain",
        closureAttribute: "chain+",
        maxDepth: 16,
      });
      await flush(t);

      let reach = await t.query(api.datalog.datalog, {
        where: [["a", "chain+", "?z"]],
        select: ["?z"],
      });
      expect(reach.map((r) => r.z).sort()).toEqual(["b", "c"]);

      // Retract b -> c; a can no longer reach c (full recompute path).
      await t.mutation(api.facts.retractFact, { factId: bc.factId });
      await flush(t);

      reach = await t.query(api.datalog.datalog, {
        where: [["a", "chain+", "?z"]],
        select: ["?z"],
      });
      expect(reach.map((r) => r.z).sort()).toEqual(["b"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
