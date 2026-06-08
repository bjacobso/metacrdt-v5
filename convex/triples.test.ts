/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { maxByOrder, verifyId, type Event } from "@metacrdt/core";

const modules = import.meta.glob("./**/*.ts");

// Drain the scheduler, including cascades (assertFact → processFactChange →
// recomputeRule*). finishAllScheduledFunctions advances fake timers until the
// whole runAfter(0) chain has drained.
async function flush(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("cardinality-one", () => {
  test("a new assertion retracts the prior current fact but keeps history", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await t.mutation(api.attributes.defineAttribute, {
      name: "employee.status",
      valueType: "string",
      cardinality: "one",
    });

    await t.mutation(api.facts.assertFact, {
      e: "e:1",
      a: "employee.status",
      value: "active",
    });
    await t.mutation(api.facts.assertFact, {
      e: "e:1",
      a: "employee.status",
      value: "inactive",
    });

    // Current view shows only the latest value.
    const entity = await t.query(api.facts.getEntity, { e: "e:1" });
    expect(entity.attributes["employee.status"]).toEqual(["inactive"]);

    // Default bitemporal query (now) sees only the live fact...
    const live = await t.query(api.facts.queryFacts, {
      e: "e:1",
      a: "employee.status",
    });
    expect(live.map((f) => f.v)).toEqual(["inactive"]);

    // ...but history (incl. retracted) retains both.
    const all = await t.query(api.facts.queryFacts, {
      e: "e:1",
      a: "employee.status",
      includeRetracted: true,
    });
    expect(all.map((f) => f.v).sort()).toEqual(["active", "inactive"]);

    const asOfAudit = await t.query(api.facts.entityAsOf, {
      e: "e:1",
      includeRetracted: true,
    });
    expect((asOfAudit.attributes["employee.status"] as string[]).sort()).toEqual([
      "active",
      "inactive",
    ]);
  });

  test("same-time cardinality-one assertions choose the core ≺-max winner", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await t.mutation(api.attributes.defineAttribute, {
        name: "status.sameTime",
        valueType: "string",
        cardinality: "one",
      });

      await t.mutation(api.facts.assertFact, {
        e: "e:same-time",
        a: "status.sameTime",
        value: "first",
      });
      await t.mutation(api.facts.assertFact, {
        e: "e:same-time",
        a: "status.sameTime",
        value: "second",
      });

      const events = (await t.query(api.facts.history, {
        e: "e:same-time",
        a: "status.sameTime",
      })) as Array<{
        kind: "assert" | "retract";
        eventId?: string;
        targetEventId?: string;
        hlc?: { pt: number; l: number; r: string };
        e: string;
        a: string;
        v: string;
        validFrom?: number;
        validTo?: number;
      }>;
      const assertEvents: Event[] = events
        .filter((e) => e.kind === "assert")
        .map((e) => ({
          id: e.eventId!,
          kind: "assert",
          actor: "system",
          actorType: "system",
          hlc: e.hlc!,
          e: e.e,
          a: e.a,
          v: e.v,
          validFrom: e.validFrom!,
          validTo: e.validTo ?? null,
          causalRefs: [],
        }));
      const expected = maxByOrder(assertEvents)!;

      const entity = await t.query(api.facts.getEntity, { e: "e:same-time" });
      expect(entity.attributes["status.sameTime"]).toEqual([expected.v]);
      const retract = events.find((e) => e.kind === "retract")!;
      const loser = assertEvents.find((e) => e.id !== expected.id)!;
      expect(retract.targetEventId).toBe(loser.id);
    } finally {
      vi.useRealTimers();
    }
  });

  test("legacy facts without assertEventId still reconcile safely", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await t.mutation(api.attributes.defineAttribute, {
      name: "status.legacy",
      valueType: "string",
      cardinality: "one",
    });
    const first = await t.mutation(api.facts.assertFact, {
      e: "e:legacy",
      a: "status.legacy",
      value: "old",
    });

    // Simulate a fact created before the protocol metadata migration.
    await t.run(async (ctx) => {
      await ctx.db.patch("facts", first.factId, { assertEventId: undefined });
    });

    await t.mutation(api.facts.assertFact, {
      e: "e:legacy",
      a: "status.legacy",
      value: "new",
    });

    const entity = await t.query(api.facts.getEntity, { e: "e:legacy" });
    expect(entity.attributes["status.legacy"]).toEqual(["new"]);
    const all = await t.query(api.facts.queryFacts, {
      e: "e:legacy",
      a: "status.legacy",
      includeRetracted: true,
    });
    expect(all.map((f) => f.v).sort()).toEqual(["new", "old"]);
  });

  test("cardinality-many keeps multiple values", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    // No attribute registered → defaults to many.
    await t.mutation(api.facts.assertFact, { e: "e:1", a: "tag", value: "a" });
    await t.mutation(api.facts.assertFact, { e: "e:1", a: "tag", value: "b" });
    const entity = await t.query(api.facts.getEntity, { e: "e:1" });
    expect((entity.attributes["tag"] as string[]).sort()).toEqual(["a", "b"]);
  });

  test("event-log entity fold matches the current projection", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await t.mutation(api.attributes.defineAttribute, {
      name: "status.fromLog",
      valueType: "string",
      cardinality: "one",
    });
    await t.mutation(api.facts.assertFact, {
      e: "e:from-log",
      a: "status.fromLog",
      value: "draft",
    });
    await t.mutation(api.facts.assertFact, {
      e: "e:from-log",
      a: "status.fromLog",
      value: "active",
    });
    await t.mutation(api.facts.assertFact, {
      e: "e:from-log",
      a: "tag",
      value: "north",
    });
    await t.mutation(api.facts.assertFact, {
      e: "e:from-log",
      a: "tag",
      value: "priority",
    });

    const projected = await t.query(api.facts.getEntity, { e: "e:from-log" });
    const fromLog = await t.query(api.facts.entityFromEventLog, {
      e: "e:from-log",
    });

    expect(fromLog.skippedLegacyEvents).toBe(0);
    expect(fromLog.attributes["status.fromLog"]).toEqual(
      projected.attributes["status.fromLog"],
    );
    expect((fromLog.attributes.tag as string[]).sort()).toEqual(
      (projected.attributes.tag as string[]).sort(),
    );
  });

  test("production entity read survives a corrupted currentFacts projection", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await t.mutation(api.attributes.defineAttribute, {
      name: "status.fromLogOnly",
      valueType: "string",
      cardinality: "one",
    });
    await t.mutation(api.facts.assertFact, {
      e: "e:from-log-only",
      a: "status.fromLogOnly",
      value: "current",
    });

    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("currentFacts")
        .withIndex("by_e", (q) => q.eq("e", "e:from-log-only"))
        .collect();
      for (const row of rows) await ctx.db.delete(row._id);
    });

    const production = await t.query(api.facts.getEntity, {
      e: "e:from-log-only",
    });
    const fromLog = await t.query(api.facts.entityFromEventLog, {
      e: "e:from-log-only",
    });

    expect(production.attributes["status.fromLogOnly"]).toEqual(["current"]);
    expect(fromLog.attributes["status.fromLogOnly"]).toEqual(["current"]);
  });

  test("event-log fact query matches projection query for visible facts", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await t.mutation(api.attributes.defineAttribute, {
      name: "status.queryLog",
      valueType: "string",
      cardinality: "one",
    });
    await t.mutation(api.facts.assertFact, {
      e: "e:query-log",
      a: "status.queryLog",
      value: "draft",
    });
    await t.mutation(api.facts.assertFact, {
      e: "e:query-log",
      a: "status.queryLog",
      value: "active",
    });
    await t.mutation(api.facts.assertFact, {
      e: "e:query-log",
      a: "tag",
      value: "blue",
    });

    const projected = await t.query(api.facts.queryFacts, {
      e: "e:query-log",
    });
    const fromLog = await t.query(api.facts.queryFactsFromEventLog, {
      e: "e:query-log",
    });

    expect(fromLog.skippedLegacyEvents).toBe(0);
    expect(fromLog.facts.map((f) => [f.a, f.v]).sort()).toEqual(
      projected.map((f) => [f.a, f.v]).sort(),
    );
    expect(
      (
        await t.query(api.facts.queryFactsFromEventLog, {
          a: "tag",
          value: "blue",
        })
      ).facts.some((f) => f.e === "e:query-log" && f.v === "blue"),
    ).toBe(true);
    const allStatus = await t.query(api.facts.queryFactsFromEventLog, {
      e: "e:query-log",
      a: "status.queryLog",
      includeRetracted: true,
    });
    expect(allStatus.facts.map((f) => f.v).sort()).toEqual(["active", "draft"]);
  });

  test("production fact query survives a corrupted facts projection", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await t.mutation(api.facts.assertFact, {
      e: "e:query-log-only",
      a: "status",
      value: "live",
    });

    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("facts")
        .withIndex("by_e", (q) => q.eq("e", "e:query-log-only"))
        .collect();
      for (const row of rows) {
        await ctx.db.patch(row._id, { retractedAt: Date.now() });
      }
    });

    const production = await t.query(api.facts.queryFacts, {
      e: "e:query-log-only",
    });
    const fromLog = await t.query(api.facts.queryFactsFromEventLog, {
      e: "e:query-log-only",
    });

    expect(production.map((f) => [f.a, f.v])).toEqual([["status", "live"]]);
    expect(fromLog.facts.map((f) => [f.a, f.v])).toEqual([["status", "live"]]);
  });
});

describe("event log is append-only", () => {
  test("new factEvents carry verifiable MetaCRDT protocol metadata", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    const { factId } = await t.mutation(api.facts.assertFact, {
      e: "e:proto",
      a: "status",
      value: "active",
      validFrom: 100,
      reason: "initial",
    });
    await t.mutation(api.facts.retractFact, { factId, reason: "done" });

    const events = (await t.query(api.facts.history, {
      e: "e:proto",
      a: "status",
    })) as Array<{
      kind: "assert" | "retract";
      eventId?: string;
      targetEventId?: string;
      hlc?: { pt: number; l: number; r: string };
      replicaId?: string;
      causalRefs?: string[];
      e: string;
      a: string;
      v: unknown;
      validFrom?: number;
      validTo?: number;
      reason?: string;
    }>;

    const assertEv = events.find((e) => e.kind === "assert")!;
    const retractEv = events.find((e) => e.kind === "retract")!;
    expect(assertEv.eventId).toMatch(/^e_/);
    expect(retractEv.eventId).toMatch(/^e_/);
    expect(retractEv.targetEventId).toBe(assertEv.eventId);
    expect(assertEv.replicaId).toBe("convex:reference");
    expect(retractEv.replicaId).toBe("convex:reference");
    expect(assertEv.hlc?.l).toEqual(expect.any(Number));

    const assertCore: Event = {
      id: assertEv.eventId!,
      kind: "assert",
      actor: "system",
      actorType: "system",
      hlc: assertEv.hlc!,
      e: assertEv.e,
      a: assertEv.a,
      v: assertEv.v as Event["v"],
      validFrom: assertEv.validFrom!,
      validTo: assertEv.validTo ?? null,
      causalRefs: [],
      reason: assertEv.reason,
    };
    const retractCore: Event = {
      id: retractEv.eventId!,
      kind: "retract",
      actor: "system",
      actorType: "system",
      hlc: retractEv.hlc!,
      target: retractEv.targetEventId!,
      causalRefs: [],
      reason: retractEv.reason,
    };
    expect(verifyId(assertCore)).toBe(true);
    expect(verifyId(retractCore)).toBe(true);
  });

  test("assert + cardinality-one replace produces assert, retract, assert", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await t.mutation(api.attributes.defineAttribute, {
      name: "s",
      valueType: "string",
      cardinality: "one",
    });
    await t.mutation(api.facts.assertFact, { e: "e:1", a: "s", value: "x" });
    await t.mutation(api.facts.assertFact, { e: "e:1", a: "s", value: "y" });

    // a-scoped history returns factEvents (which carry `kind`).
    const events = (await t.query(api.facts.history, {
      e: "e:1",
      a: "s",
    })) as Array<{ kind: string }>;
    // history is ordered desc by txTime.
    expect(events.map((e) => e.kind).sort()).toEqual([
      "assert",
      "assert",
      "retract",
    ]);
  });

  test("correctFact is represented as tombstone + assert protocol events", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    const { factId } = await t.mutation(api.facts.assertFact, {
      e: "e:correct",
      a: "i9.completed",
      value: false,
    });

    await t.mutation(api.facts.correctFact, {
      factId,
      newValue: true,
      reason: "actually completed",
    });

    const events = (await t.query(api.facts.history, {
      e: "e:correct",
      a: "i9.completed",
    })) as Array<{
      kind: string;
      eventId?: string;
      targetEventId?: string;
      causalRefs?: string[];
    }>;
    expect(events.map((e) => e.kind).sort()).toEqual([
      "assert",
      "assert",
      "tombstone",
    ]);
    expect(events.some((e) => e.kind === "correction")).toBe(false);
    const originalAssert = events.find(
      (e) => e.kind === "assert" && !(e.causalRefs ?? []).length,
    )!;
    const tombstone = events.find((e) => e.kind === "tombstone")!;
    const replacement = events.find(
      (e) => e.kind === "assert" && (e.causalRefs ?? []).length > 0,
    )!;
    expect(tombstone.targetEventId).toBe(originalAssert.eventId);
    expect(replacement.causalRefs).toContain(tombstone.eventId);
    expect(replacement.causalRefs).toContain(originalAssert.eventId);
  });

  test("replaying events reconstructs the current entity view", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await t.mutation(api.attributes.defineAttribute, {
      name: "status",
      valueType: "string",
      cardinality: "one",
    });
    await t.mutation(api.facts.assertFact, {
      e: "w:1",
      a: "status",
      value: "active",
    });
    await t.mutation(api.facts.assertFact, {
      e: "w:1",
      a: "name",
      value: "Ada",
    });
    await t.mutation(api.facts.assertFact, {
      e: "w:1",
      a: "status",
      value: "terminated",
    });

    const entity = await t.query(api.facts.getEntity, { e: "w:1" });
    const asOf = await t.query(api.facts.entityAsOf, { e: "w:1" });
    // The disposable projection and the from-scratch reconstruction agree.
    expect(asOf.attributes).toEqual(entity.attributes);
    expect(entity.attributes["status"]).toEqual(["terminated"]);
    expect(entity.attributes["name"]).toEqual(["Ada"]);
  });

  test("bitemporal entity reads survive a corrupted facts projection", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await t.mutation(api.attributes.defineAttribute, {
      name: "status.asOfLogOnly",
      valueType: "string",
      cardinality: "one",
    });
    await t.mutation(api.facts.assertFact, {
      e: "e:as-of-log-only",
      a: "status.asOfLogOnly",
      value: "visible",
      reason: "source event stays authoritative",
    });

    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("facts")
        .withIndex("by_e", (q) => q.eq("e", "e:as-of-log-only"))
        .collect();
      for (const row of rows) {
        await ctx.db.patch(row._id, {
          retractedAt: Date.now(),
          tombstonedAt: Date.now(),
        });
      }
    });

    const asOf = await t.query(api.facts.entityAsOf, { e: "e:as-of-log-only" });
    expect(asOf.attributes["status.asOfLogOnly"]).toEqual(["visible"]);

    const factsAsOf = await t.query(api.facts.entityFactsAsOf, {
      e: "e:as-of-log-only",
    });
    expect(factsAsOf.facts.map((f) => [f.a, f.v])).toEqual([
      ["status.asOfLogOnly", "visible"],
    ]);
    expect(factsAsOf.facts[0].reason).toBe("source event stays authoritative");
  });
});

describe("tombstone", () => {
  test("removes from current and bitemporal-now, but is recoverable", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    const { factId } = await t.mutation(api.facts.assertFact, {
      e: "e:1",
      a: "ssn",
      value: "redact-me",
    });

    await t.mutation(api.facts.tombstoneFact, {
      factId,
      reason: "PII deletion",
    });

    const entity = await t.query(api.facts.getEntity, { e: "e:1" });
    expect(entity.attributes["ssn"]).toBeUndefined();

    const live = await t.query(api.facts.queryFacts, { e: "e:1", a: "ssn" });
    expect(live).toEqual([]);

    const audit = await t.query(api.facts.queryFacts, {
      e: "e:1",
      a: "ssn",
      includeTombstoned: true,
    });
    expect(audit.map((f) => f.v)).toEqual(["redact-me"]);
  });
});

describe("datalog", () => {
  test("multi-clause join across entities", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await t.mutation(api.facts.assertFact, {
      e: "emp:1",
      a: "type",
      value: "Employee",
    });
    await t.mutation(api.facts.assertFact, {
      e: "emp:1",
      a: "status",
      value: "active",
    });
    await t.mutation(api.facts.assertFact, {
      e: "emp:1",
      a: "manager",
      value: "emp:9",
    });
    await t.mutation(api.facts.assertFact, {
      e: "emp:9",
      a: "email",
      value: "ben@example.com",
    });

    const rows = await t.query(api.datalog.datalog, {
      where: [
        ["?e", "type", "Employee"],
        ["?e", "status", "active"],
        ["?e", "manager", "?m"],
        ["?m", "email", "ben@example.com"],
      ],
      select: ["?e", "?m"],
    });
    expect(rows).toEqual([{ e: "emp:1", m: "emp:9" }]);
  });

  test("explainDatalog classifies heterogeneous clauses", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    const plan = await t.query(api.datalog.explainDatalog, {
      where: [
        ["?e", "salary", "?s"],
        ["?s", ">", 100000],
        { not: ["?e", "status", "terminated"] },
      ],
    });
    // Join order is dynamic; explain reports clauses in input order, classified.
    expect(plan.clauses.map((c) => c.kind)).toEqual([
      "pattern",
      "compare",
      "not",
    ]);
    expect(plan.note).toMatch(/dynamic/i);
  });
});

describe("rule materialization", () => {
  test("derives a violation, then clears it via correction (incremental)", async () => {
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
      const i9 = await t.mutation(api.facts.assertFact, {
        e: "w:1",
        a: "i9.completed",
        value: false,
      });
      await flush(t);

      let derived = await t.query(api.rules.derivedForEntity, { e: "w:1" });
      expect(derived.map((d) => d.v)).toEqual(["missing_i9"]);

      // Correct the I-9 to completed → rule re-materializes and clears it.
      await t.mutation(api.facts.correctFact, {
        factId: i9.factId,
        newValue: true,
        reason: "I-9 actually completed",
      });
      await flush(t);

      derived = await t.query(api.rules.derivedForEntity, { e: "w:1" });
      expect(derived).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("cross-entity join rules replace affected output entities", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await t.mutation(api.rules.defineRule, {
        name: "requires_client_ack",
        where: [
          ["?p", "type", "Placement"],
          ["?p", "worker", "?w"],
          ["?p", "client", "?client"],
        ],
        emit: { e: "?w", a: "requires.client_ack", v: "?client" },
        dependsOnAttributes: ["type", "worker", "client"],
      });

      await t.mutation(api.facts.assertFact, {
        e: "placement:1",
        a: "type",
        value: "Placement",
      });
      await t.mutation(api.facts.assertFact, {
        e: "placement:1",
        a: "worker",
        value: "worker:1",
      });
      const client = await t.mutation(api.facts.assertFact, {
        e: "placement:1",
        a: "client",
        value: "client:a",
      });
      await flush(t);

      let derived = await t.query(api.rules.derivedForEntity, {
        e: "worker:1",
      });
      expect(derived.map((d) => d.v)).toEqual(["client:a"]);

      await t.mutation(api.facts.correctFact, {
        factId: client.factId,
        newValue: "client:b",
        reason: "placement moved clients",
      });
      await flush(t);

      derived = await t.query(api.rules.derivedForEntity, {
        e: "worker:1",
      });
      expect(derived.map((d) => d.v)).toEqual(["client:b"]);

      const pending = await t.run(async (ctx) => {
        return await ctx.db.query("ruleInvalidations").collect();
      });
      expect(pending.every((row) => row.processedAt !== undefined)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("bitemporal comparison", () => {
  test("compareFacts distinguishes valid-time intervals", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    // cardinality-many "phase" with explicit, non-overlapping valid intervals.
    await t.mutation(api.facts.assertFact, {
      e: "e:1",
      a: "phase",
      value: "onboarding",
      validFrom: 100,
      validTo: 200,
    });
    await t.mutation(api.facts.assertFact, {
      e: "e:1",
      a: "phase",
      value: "active",
      validFrom: 200,
    });

    const cmp = await t.query(api.facts.compareFacts, {
      e: "e:1",
      a: "phase",
      before: { txTime: Date.now() + 1000, validTime: 150 },
      after: { txTime: Date.now() + 1000, validTime: 250 },
    });
    expect(cmp.before).toEqual(["onboarding"]);
    expect(cmp.after).toEqual(["active"]);
    expect(cmp.changed).toBe(true);
  });
});
