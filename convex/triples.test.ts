/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// Drain the scheduler, including cascades (assertFact → processFactChange →
// recomputeRule*). finishAllScheduledFunctions advances fake timers until the
// whole runAfter(0) chain has drained.
async function flush(t: ReturnType<typeof convexTest>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("cardinality-one", () => {
  test("a new assertion retracts the prior current fact but keeps history", async () => {
    const t = convexTest(schema, modules);
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
  });

  test("cardinality-many keeps multiple values", async () => {
    const t = convexTest(schema, modules);
    // No attribute registered → defaults to many.
    await t.mutation(api.facts.assertFact, { e: "e:1", a: "tag", value: "a" });
    await t.mutation(api.facts.assertFact, { e: "e:1", a: "tag", value: "b" });
    const entity = await t.query(api.facts.getEntity, { e: "e:1" });
    expect((entity.attributes["tag"] as string[]).sort()).toEqual(["a", "b"]);
  });
});

describe("event log is append-only", () => {
  test("assert + cardinality-one replace produces assert, retract, assert", async () => {
    const t = convexTest(schema, modules);
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

  test("replaying events reconstructs the current entity view", async () => {
    const t = convexTest(schema, modules);
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
});

describe("tombstone", () => {
  test("removes from current and bitemporal-now, but is recoverable", async () => {
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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
    const t = convexTest(schema, modules);
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
});

describe("bitemporal comparison", () => {
  test("compareFacts distinguishes valid-time intervals", async () => {
    const t = convexTest(schema, modules);
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
