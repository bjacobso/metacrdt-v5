/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function flush(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("rebuildProjections — events are the source of truth", () => {
  test("facts lifecycle and currentFacts are derivable from the log", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });

    await t.mutation(api.attributes.defineAttribute, {
      name: "status",
      valueType: "string",
      cardinality: "one",
    });
    await t.mutation(api.facts.assertFact, { e: "e:1", a: "status", value: "active" });
    await t.mutation(api.facts.assertFact, { e: "e:1", a: "status", value: "inactive" }); // retracts active
    await t.mutation(api.facts.assertFact, { e: "e:1", a: "tag", value: "x" });
    const ssn = await t.mutation(api.facts.assertFact, {
      e: "e:1",
      a: "ssn",
      value: "secret",
    });
    await t.mutation(api.facts.tombstoneFact, { factId: ssn.factId, reason: "pii" });

    const before = await t.query(api.facts.getEntity, { e: "e:1" });
    expect(before.attributes).toEqual({ status: ["inactive"], tag: ["x"] });

    // Corrupt the projections: un-retract the superseded fact, un-tombstone the
    // ssn fact, and wipe currentFacts entirely.
    await t.run(async (ctx) => {
      const facts = await ctx.db.query("facts").collect();
      for (const f of facts) {
        if (f.a === "status" && f.v === "active") {
          await ctx.db.patch("facts", f._id, { retractedAt: undefined });
        }
        if (f.a === "ssn") {
          await ctx.db.patch("facts", f._id, { tombstonedAt: undefined });
        }
      }
      const cur = await ctx.db.query("currentFacts").collect();
      for (const c of cur) await ctx.db.delete("currentFacts", c._id);
    });

    // Projection is now wrong (currentFacts wiped).
    const corrupted = await t.query(api.facts.getEntity, { e: "e:1" });
    expect(corrupted.attributes).toEqual({});

    // Rebuild from the append-only log. (No rules here, so nothing to flush.)
    const result = await t.mutation(internal.rebuild.rebuildProjections, {});
    expect(result.factsRebuilt).toBeGreaterThan(0);

    // currentFacts is restored identically...
    const after = await t.query(api.facts.getEntity, { e: "e:1" });
    expect(after.attributes).toEqual(before.attributes);

    // ...and the un-retracted fact is re-retracted from the log (only the
    // current value is visible now).
    const status = await t.query(api.facts.queryFacts, { e: "e:1", a: "status" });
    expect(status.map((f) => f.v)).toEqual(["inactive"]);

    // ...and the un-tombstoned ssn fact is tombstoned again (hidden by default).
    const ssnVisible = await t.query(api.facts.queryFacts, { e: "e:1", a: "ssn" });
    expect(ssnVisible).toEqual([]);
    const ssnAudit = await t.query(api.facts.queryFacts, {
      e: "e:1",
      a: "ssn",
      includeTombstoned: true,
    });
    expect(ssnAudit.map((f) => f.v)).toEqual(["secret"]);
  });

  test("rebuild recomputes derived facts", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await t.mutation(api.rules.defineRule, {
        name: "vip",
        where: [["?e", "tier", "gold"]],
        emit: { e: "?e", a: "flag", v: "vip" },
        dependsOnAttributes: ["tier"],
      });
      await t.mutation(api.facts.assertFact, { e: "c:1", a: "tier", value: "gold" });
      await flush(t);

      // Wipe derived facts, then rebuild should regenerate them.
      await t.run(async (ctx) => {
        const d = await ctx.db.query("derivedFacts").collect();
        for (const row of d) await ctx.db.delete("derivedFacts", row._id);
      });
      expect(await t.query(api.rules.derivedForEntity, { e: "c:1" })).toEqual([]);

      await t.mutation(internal.rebuild.rebuildProjections, {});
      await flush(t);

      const derived = await t.query(api.rules.derivedForEntity, { e: "c:1" });
      expect(derived.map((d) => d.v)).toEqual(["vip"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
