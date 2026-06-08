/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api.js";
import { initComponentTest } from "./setup.test.js";

const componentInternal = internal as unknown as {
  log: {
    appendAssert: any;
    appendLifecycle: any;
    getEvent: any;
    listEvents: any;
    listCurrent: any;
    rebuildProjections: any;
  };
};

const actor = {
  actorId: "user:component-log",
  actorType: "user" as const,
  txTime: 10_000,
  reason: "component-owned log test",
};

describe("@metacrdt/convex component-owned protocol log", () => {
  test("appends and reads a component-owned assert event", async () => {
    const t = initComponentTest();
    const appended = await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      e: "worker:1",
      a: "worker.status",
      v: "active",
      validFrom: 9_000,
    });

    expect(appended.eventId).toBeDefined();
    expect(appended.txId).toBeDefined();
    expect(appended.rowId).toBeDefined();

    const event = await t.query(componentInternal.log.getEvent, {
      eventId: appended.eventId,
    });

    expect(event).toMatchObject({
      rowId: appended.rowId,
      txId: appended.txId,
      eventId: appended.eventId,
      kind: "assert",
      e: "worker:1",
      a: "worker.status",
      v: "active",
      validFrom: 9_000,
      actor: "user:component-log",
      actorType: "human",
      hasProtocolMetadata: true,
      verifiable: true,
      validEventId: true,
    });
  });

  test("appends lifecycle events targeting component-owned assert ids", async () => {
    const t = initComponentTest();
    const asserted = await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      e: "worker:2",
      a: "worker.status",
      v: "active",
      validFrom: 9_000,
    });
    const retracted = await t.mutation(componentInternal.log.appendLifecycle, {
      ...actor,
      txTime: 11_000,
      kind: "retract",
      targetEventId: asserted.eventId,
      e: "worker:2",
      a: "worker.status",
      v: "active",
      reason: "targeted retract",
    });

    expect(retracted.eventId).not.toBe(asserted.eventId);

    const listed = await t.query(componentInternal.log.listEvents, {
      e: "worker:2",
      a: "worker.status",
      limit: 10,
    });

    expect(listed).toHaveLength(2);
    expect(listed.map((e: { kind: string }) => e.kind).sort()).toEqual([
      "assert",
      "retract",
    ]);
    expect(
      listed.find((e: { kind: string }) => e.kind === "retract"),
    ).toMatchObject({
      targetEventId: asserted.eventId,
      reason: "targeted retract",
      verifiable: true,
      validEventId: true,
    });
  });

  test("maintains component-owned current projection through lifecycle events", async () => {
    const t = initComponentTest();
    const asserted = await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      e: "worker:projection",
      a: "worker.status",
      v: "active",
      validFrom: 9_000,
    });

    expect(
      await t.query(componentInternal.log.listCurrent, {
        e: "worker:projection",
        a: "worker.status",
      }),
    ).toMatchObject([
      {
        factId: asserted.factId,
        e: "worker:projection",
        a: "worker.status",
        v: "active",
        assertEventId: asserted.eventId,
      },
    ]);

    await t.mutation(componentInternal.log.appendLifecycle, {
      ...actor,
      txTime: 11_000,
      kind: "tombstone",
      targetEventId: asserted.eventId,
      e: "worker:projection",
      a: "worker.status",
      v: "active",
      reason: "bad source",
    });
    expect(
      await t.query(componentInternal.log.listCurrent, {
        e: "worker:projection",
        a: "worker.status",
      }),
    ).toEqual([]);

    await t.mutation(componentInternal.log.appendLifecycle, {
      ...actor,
      txTime: 12_000,
      kind: "untombstone",
      targetEventId: asserted.eventId,
      e: "worker:projection",
      a: "worker.status",
      v: "active",
      reason: "restored",
    });
    expect(
      await t.query(componentInternal.log.listCurrent, {
        e: "worker:projection",
        a: "worker.status",
      }),
    ).toHaveLength(1);

    await t.mutation(componentInternal.log.appendLifecycle, {
      ...actor,
      txTime: 13_000,
      kind: "retract",
      targetEventId: asserted.eventId,
      e: "worker:projection",
      a: "worker.status",
      v: "active",
      reason: "closed",
    });
    expect(
      await t.query(componentInternal.log.listCurrent, {
        e: "worker:projection",
        a: "worker.status",
      }),
    ).toEqual([]);
  });

  test("cardinality-one assertions reconcile current state by protocol order", async () => {
    const t = initComponentTest();
    await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      txTime: 20_000,
      e: "worker:cardinality",
      a: "worker.status",
      v: "active",
      cardinality: "one",
    });
    const second = await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      txTime: 21_000,
      e: "worker:cardinality",
      a: "worker.status",
      v: "terminated",
      cardinality: "one",
    });

    const current = await t.query(componentInternal.log.listCurrent, {
      e: "worker:cardinality",
      a: "worker.status",
    });
    expect(current).toMatchObject([
      {
        factId: second.factId,
        e: "worker:cardinality",
        a: "worker.status",
        v: "terminated",
        assertEventId: second.eventId,
      },
    ]);

    const events = await t.query(componentInternal.log.listEvents, {
      e: "worker:cardinality",
      a: "worker.status",
      limit: 10,
    });
    expect(events.map((event: { kind: string }) => event.kind).sort()).toEqual([
      "assert",
      "assert",
      "retract",
    ]);
    expect(
      events.find((event: { kind: string; v: unknown }) => event.kind === "retract"),
    ).toMatchObject({
      v: "active",
      reason: "superseded by ≺-max cardinality-one assertion",
      validEventId: true,
    });
  });

  test("rebuilds disposable projections from the component-owned event log", async () => {
    const t = initComponentTest();
    await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      txTime: 30_000,
      e: "worker:rebuild",
      a: "worker.status",
      v: "active",
      cardinality: "one",
    });
    const winner = await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      txTime: 31_000,
      e: "worker:rebuild",
      a: "worker.status",
      v: "terminated",
      cardinality: "one",
    });

    const rebuilt = await t.mutation(componentInternal.log.rebuildProjections, {});
    expect(rebuilt).toEqual({
      events: 3,
      facts: 2,
      currentFacts: 1,
    });

    const current = await t.query(componentInternal.log.listCurrent, {
      e: "worker:rebuild",
      a: "worker.status",
    });
    expect(current).toMatchObject([
      {
        e: "worker:rebuild",
        a: "worker.status",
        v: "terminated",
        assertEventId: winner.eventId,
      },
    ]);

    const events = await t.query(componentInternal.log.listEvents, {
      e: "worker:rebuild",
      a: "worker.status",
      limit: 10,
    });
    expect(events.map((event: { kind: string }) => event.kind).sort()).toEqual([
      "assert",
      "assert",
      "retract",
    ]);
  });

  test("rebuild preserves lifecycle-derived empty current state", async () => {
    const t = initComponentTest();
    const asserted = await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      txTime: 40_000,
      e: "worker:rebuild-lifecycle",
      a: "worker.status",
      v: "active",
    });
    await t.mutation(componentInternal.log.appendLifecycle, {
      ...actor,
      txTime: 41_000,
      kind: "tombstone",
      targetEventId: asserted.eventId,
      e: "worker:rebuild-lifecycle",
      a: "worker.status",
      v: "active",
      reason: "bad source",
    });
    await t.mutation(componentInternal.log.appendLifecycle, {
      ...actor,
      txTime: 42_000,
      kind: "untombstone",
      targetEventId: asserted.eventId,
      e: "worker:rebuild-lifecycle",
      a: "worker.status",
      v: "active",
      reason: "restored",
    });
    await t.mutation(componentInternal.log.appendLifecycle, {
      ...actor,
      txTime: 43_000,
      kind: "retract",
      targetEventId: asserted.eventId,
      e: "worker:rebuild-lifecycle",
      a: "worker.status",
      v: "active",
      reason: "closed",
    });

    expect(await t.mutation(componentInternal.log.rebuildProjections, {})).toEqual({
      events: 4,
      facts: 1,
      currentFacts: 0,
    });
    expect(
      await t.query(componentInternal.log.listCurrent, {
        e: "worker:rebuild-lifecycle",
        a: "worker.status",
      }),
    ).toEqual([]);
  });

  test("filters component-owned events by entity and attribute", async () => {
    const t = initComponentTest();
    await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      e: "worker:3",
      a: "worker.status",
      v: "active",
    });
    await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      e: "worker:3",
      a: "worker.role",
      v: "driver",
    });
    await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      e: "worker:4",
      a: "worker.status",
      v: "active",
    });

    const entityEvents = await t.query(componentInternal.log.listEvents, {
      e: "worker:3",
    });
    expect(entityEvents).toHaveLength(2);

    const attrEvents = await t.query(componentInternal.log.listEvents, {
      e: "worker:3",
      a: "worker.status",
    });
    expect(attrEvents).toHaveLength(1);
    expect(attrEvents[0]).toMatchObject({ e: "worker:3", a: "worker.status" });
  });
});
