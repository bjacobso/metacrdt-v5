/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function flush(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function setup(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.mutation(api.appconfig.setupStaffing, {});
  await flush(t);
}

function byKey(
  items: ReadonlyArray<{
    form: string;
    scope: string;
    decision: "reuse" | "collect";
    placements: ReadonlyArray<string>;
  }>,
) {
  return new Map(items.map((i) => [`${i.form}@${i.scope}`, i]));
}

async function tableCounts(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  return await t.run(async (ctx) => ({
    transactions: (await ctx.db.query("transactions").collect()).length,
    factEvents: (await ctx.db.query("factEvents").collect()).length,
    facts: (await ctx.db.query("facts").collect()).length,
    currentFacts: (await ctx.db.query("currentFacts").collect()).length,
    derivedFacts: (await ctx.db.query("derivedFacts").collect()).length,
    flowRuns: (await ctx.db.query("flowRuns").collect()).length,
  }));
}

describe("Confect compliance planner", () => {
  test("dry-runs collect vs reuse without writing", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);

      await t.mutation(api.compliance.submitForm, {
        worker: "worker:maria",
        form: "i9",
        scope: "employer:acme",
      });
      await flush(t);

      const before = await tableCounts(t);
      const dry = await t.query(api.complianceConfect.dryRunWorkerCompliance, {
        worker: "worker:maria",
        placement: {
          employer: "employer:acme",
          client: "client:globex",
          job: "job:forklift1",
          venue: "venue:stadium7",
        },
      });
      const after = await tableCounts(t);

      expect(after).toEqual(before);
      expect(dry.summary).toEqual({ reuse: 1, collect: 4, total: 5 });

      const items = byKey(dry.items);
      expect(items.get("i9@employer:acme")?.decision).toBe("reuse");
      expect(items.get("handbook@client:globex")?.decision).toBe("collect");
      expect(items.get("handbook@client:initech")?.decision).toBe("collect");
      expect(items.get("forklift@job:forklift1")?.decision).toBe("collect");
      expect(items.get("venue_disclosure@venue:stadium7")?.decision).toBe(
        "collect",
      );
      expect(items.get("i9@employer:acme")?.placements).toContain(
        "placement:dry-run",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("dry-run survives a wiped currentFacts projection", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);
      await t.mutation(api.compliance.submitForm, {
        worker: "worker:maria",
        form: "i9",
        scope: "employer:acme",
      });
      await flush(t);

      await t.run(async (ctx) => {
        const rows = await ctx.db.query("currentFacts").collect();
        for (const row of rows) await ctx.db.delete(row._id);
      });

      const dry = await t.query(api.complianceConfect.dryRunWorkerCompliance, {
        worker: "worker:maria",
        placement: {
          employer: "employer:acme",
          client: "client:globex",
          job: "job:forklift1",
          venue: "venue:stadium7",
        },
      });

      expect(dry.summary).toEqual({ reuse: 1, collect: 4, total: 5 });
      expect(byKey(dry.items).get("i9@employer:acme")?.decision).toBe("reuse");
    } finally {
      vi.useRealTimers();
    }
  });

  test("hypothetical non-forklift placement omits the forklift requirement", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);
      await t.mutation(api.facts.assertFact, {
        e: "worker:alex",
        a: "type",
        value: "Worker",
      });
      await flush(t);

      const dry = await t.query(api.complianceConfect.dryRunWorkerCompliance, {
        worker: "worker:alex",
        placement: {
          employer: "employer:acme",
          client: "client:globex",
          job: "job:cashier1",
          venue: "venue:stadium7",
        },
      });

      expect(dry.items.map((i) => `${i.form}@${i.scope}`)).toEqual([
        "handbook@client:globex",
        "i9@employer:acme",
        "venue_disclosure@venue:stadium7",
      ]);
      expect(dry.items.every((i) => i.decision === "collect")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("unsupported requirement shapes surface typed Confect errors", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);
      await t.mutation(api.rules.defineRule, {
        name: "require.bad",
        where: [["?x", "type", "Worker"]],
        emit: { e: "?w", a: "requires.bad", v: "?s" },
        dependsOnAttributes: ["type"],
      });
      await flush(t);

      await expect(
        t.query(api.complianceConfect.dryRunWorkerCompliance, {
          worker: "worker:maria",
        }),
      ).rejects.toMatchObject({
        data: {
          _tag: "UnsupportedRequirement",
          rule: "require.bad",
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
