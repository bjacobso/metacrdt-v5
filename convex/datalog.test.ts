/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function flush(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function assert(
  t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  e: string,
  a: string,
  value: unknown,
) {
  await t.mutation(api.facts.assertFact, { e, a, value });
}

describe("comparison predicates", () => {
  test("filters numeric bindings with > and <", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
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

  test("event-log Datalog source matches projection Datalog for base facts", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await assert(t, "el:p1", "type", "EventLogPerson");
    await assert(t, "el:p1", "salary", 120000);
    await assert(t, "el:p1", "bonus", 10000);
    await assert(t, "el:p2", "type", "EventLogPerson");
    await assert(t, "el:p2", "salary", 80000);
    await assert(t, "el:p2", "bonus", 5000);
    await assert(t, "el:p2", "status", "terminated");

    const args = {
      where: [
        ["?e", "type", "EventLogPerson"],
        ["?e", "salary", "?salary"],
        ["?e", "bonus", "?bonus"],
        { compute: ["+", "?salary", "?bonus"], as: "?total" },
        ["?total", ">", 100000],
        { not: ["?e", "status", "terminated"] },
      ],
      select: ["?e", "?total"],
    };

    expect(await t.query(api.datalog.datalog, args)).toEqual([
      { e: "el:p1", total: 130000 },
    ]);
    expect(await t.query(api.datalog.datalogFromEventLog, args)).toEqual([
      { e: "el:p1", total: 130000 },
    ]);
  });

  test("event-log Datalog source survives corrupted facts projection", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await assert(t, "el:source", "type", "EventLogOnly");
    await assert(t, "el:source", "status", "live");

    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("facts")
        .withIndex("by_e", (q) => q.eq("e", "el:source"))
        .collect();
      for (const row of rows) await ctx.db.patch(row._id, { retractedAt: Date.now() });
    });

    const args = {
      where: [
        ["?e", "type", "EventLogOnly"],
        ["?e", "status", "live"],
      ],
      select: ["?e"],
    };
    expect(await t.query(api.datalog.datalog, args)).toEqual([]);
    expect(await t.query(api.datalog.datalogFromEventLog, args)).toEqual([
      { e: "el:source" },
    ]);
  });

  test("== and != operate on values", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
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

describe("computed predicates", () => {
  test("binds arithmetic results and filters on the computed value", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await assert(t, "p:1", "type", "Person");
    await assert(t, "p:1", "salary", 120000);
    await assert(t, "p:1", "bonus", 15000);
    await assert(t, "p:2", "type", "Person");
    await assert(t, "p:2", "salary", 80000);
    await assert(t, "p:2", "bonus", 10000);

    const rows = await t.query(api.datalog.datalog, {
      where: [
        ["?e", "type", "Person"],
        ["?e", "salary", "?salary"],
        ["?e", "bonus", "?bonus"],
        { compute: ["+", "?salary", "?bonus"], as: "?total" },
        ["?total", ">", 100000],
      ],
      select: ["?e", "?total"],
    });

    expect(rows).toEqual([{ e: "p:1", total: 135000 }]);
  });

  test("string transforms can feed boolean string predicates", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await assert(t, "w:1", "type", "Worker");
    await assert(t, "w:1", "name", "Maria Alvarez");
    await assert(t, "w:2", "type", "Worker");
    await assert(t, "w:2", "name", "Jo Chen");

    const rows = await t.query(api.datalog.datalog, {
      where: [
        ["?e", "type", "Worker"],
        ["?e", "name", "?name"],
        { compute: ["lower", "?name"], as: "?lower" },
        { compute: ["contains", "?lower", "maria"] },
        { compute: ["length", "?name"], as: "?len" },
      ],
      select: ["?e", "?lower", "?len"],
    });

    expect(rows).toEqual([
      { e: "w:1", lower: "maria alvarez", len: "Maria Alvarez".length },
    ]);
  });

  test("computed output can be checked against an already-bound variable", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await assert(t, "invoice:1", "subtotal", 40);
    await assert(t, "invoice:1", "tax", 4);
    await assert(t, "invoice:1", "total", 44);
    await assert(t, "invoice:2", "subtotal", 40);
    await assert(t, "invoice:2", "tax", 4);
    await assert(t, "invoice:2", "total", 45);

    const rows = await t.query(api.datalog.datalog, {
      where: [
        ["?e", "subtotal", "?subtotal"],
        ["?e", "tax", "?tax"],
        ["?e", "total", "?total"],
        { compute: ["add", "?subtotal", "?tax"], as: "?total" },
      ],
      select: ["?e"],
    });

    expect(rows).toEqual([{ e: "invoice:1" }]);
  });

  test("unsafe computed inputs throw", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await expect(
      t.query(api.datalog.datalog, {
        where: [{ compute: ["+", "?missing", 1], as: "?out" }],
        select: ["?out"],
      }),
    ).rejects.toThrow(/unsafe/);
  });

  test("explainDatalog classifies computed clauses", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    const plan = await t.query(api.datalog.explainDatalog, {
      where: [
        ["?e", "name", "?name"],
        { compute: ["lower", "?name"], as: "?lower" },
        { compute: ["startsWith", "?lower", "mar"] },
      ],
    });

    expect(plan.clauses).toEqual([
      { kind: "pattern", e: "?e", a: "\"name\"", v: "?name" },
      { kind: "compute", op: "lower", args: ["?name"], as: "?lower" },
      { kind: "compute", op: "startsWith", args: ["?lower", "\"mar\""] },
    ]);
  });
});

describe("result pagination", () => {
  test("datalogPage pages deterministic projected rows with engine cursors", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    for (let i = 0; i < 5; i++) {
      await assert(t, `paged:${i}`, "type", "PagedWorker");
      await assert(t, `paged:${i}`, "rank", i);
    }

    const first = await t.query(api.datalog.datalogPage, {
      where: [["?e", "type", "PagedWorker"]],
      select: ["?e"],
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    expect(first.continueCursor).toBe("2");

    const second = await t.query(api.datalog.datalogPage, {
      where: [["?e", "type", "PagedWorker"]],
      select: ["?e"],
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    });
    expect(second.page).toHaveLength(2);
    expect(second.isDone).toBe(false);
    expect(second.continueCursor).toBe("4");

    const third = await t.query(api.datalog.datalogPage, {
      where: [["?e", "type", "PagedWorker"]],
      select: ["?e"],
      paginationOpts: { numItems: 2, cursor: second.continueCursor },
    });
    expect(third.page).toHaveLength(1);
    expect(third.isDone).toBe(true);
    expect(third.continueCursor).toBeNull();

    const all = [...first.page, ...second.page, ...third.page]
      .map((row) => row.e)
      .sort();
    expect(all).toEqual([
      "paged:0",
      "paged:1",
      "paged:2",
      "paged:3",
      "paged:4",
    ]);
  });

  test("datalogPage validates cursors and caps page size", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    for (let i = 0; i < 150; i++) {
      await assert(t, `cap:${i}`, "type", "CapWorker");
    }

    const page = await t.query(api.datalog.datalogPage, {
      where: [["?e", "type", "CapWorker"]],
      select: ["?e"],
      paginationOpts: { numItems: 500, cursor: null },
    });
    expect(page.page).toHaveLength(100);
    expect(page.isDone).toBe(false);
    expect(page.continueCursor).toBe("100");

    await expect(
      t.query(api.datalog.datalogPage, {
        where: [["?e", "type", "CapWorker"]],
        select: ["?e"],
        paginationOpts: { numItems: 10, cursor: "not-a-cursor" },
      }),
    ).rejects.toThrow(/invalid pagination cursor/);
  });
});

describe("negation", () => {
  test("not-clause excludes bindings with a matching fact", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
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
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
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
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
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
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
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
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
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
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
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
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
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
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
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
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
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
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
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
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
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

  test("counting reconcile keeps closure pairs while an alternate path remains", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await assert(t, "a", "path", "b");
      const bc = await t.mutation(api.facts.assertFact, {
        e: "b",
        a: "path",
        value: "c",
      });
      await assert(t, "a", "path", "d");
      const dc = await t.mutation(api.facts.assertFact, {
        e: "d",
        a: "path",
        value: "c",
      });
      await t.mutation(api.rules.defineTransitiveRule, {
        name: "pathClosure",
        baseAttribute: "path",
        closureAttribute: "path+",
        maxDepth: 16,
      });
      await flush(t);

      let closure = await t.run(async (ctx) => {
        return await ctx.db
          .query("derivedFacts")
          .withIndex("by_e_a", (q) => q.eq("e", "a").eq("a", "path+"))
          .collect();
      });
      let aToC = closure.find((row) => row.v === "c");
      expect(aToC?.supportCount).toBe(2);

      await t.mutation(api.facts.retractFact, { factId: bc.factId });
      await flush(t);

      let reach = await t.query(api.datalog.datalog, {
        where: [["a", "path+", "?z"]],
        select: ["?z"],
      });
      expect(reach.map((r) => r.z).sort()).toEqual(["b", "c", "d"]);

      closure = await t.run(async (ctx) => {
        return await ctx.db
          .query("derivedFacts")
          .withIndex("by_e_a", (q) => q.eq("e", "a").eq("a", "path+"))
          .collect();
      });
      aToC = closure.find((row) => row.v === "c");
      expect(aToC?.supportCount).toBe(1);

      await t.mutation(api.facts.retractFact, { factId: dc.factId });
      await flush(t);

      reach = await t.query(api.datalog.datalog, {
        where: [["a", "path+", "?z"]],
        select: ["?z"],
      });
      expect(reach.map((r) => r.z).sort()).toEqual(["b", "d"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("full recompute on correction replaces stale closure pairs", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await assert(t, "a", "route", "b");
      const bc = await t.mutation(api.facts.assertFact, {
        e: "b",
        a: "route",
        value: "c",
      });
      await t.mutation(api.rules.defineTransitiveRule, {
        name: "routeClosure",
        baseAttribute: "route",
        closureAttribute: "route+",
        maxDepth: 16,
      });
      await flush(t);

      let reach = await t.query(api.datalog.datalog, {
        where: [["a", "route+", "?z"]],
        select: ["?z"],
      });
      expect(reach.map((r) => r.z).sort()).toEqual(["b", "c"]);

      await t.mutation(api.facts.correctFact, {
        factId: bc.factId,
        newValue: "d",
        reason: "route correction",
      });
      await flush(t);

      reach = await t.query(api.datalog.datalog, {
        where: [["a", "route+", "?z"]],
        select: ["?z"],
      });
      expect(reach.map((r) => r.z).sort()).toEqual(["b", "d"]);

      const stale = await t.run(async (ctx) => {
        return (
          await ctx.db
            .query("derivedFacts")
            .withIndex("by_a_v", (q) => q.eq("a", "route+").eq("v", "c"))
            .collect()
        ).filter((row) => !row.stale);
      });
      expect(stale).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
