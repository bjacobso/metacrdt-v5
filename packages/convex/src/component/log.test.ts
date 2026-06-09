/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { assert as assertEvent } from "@metacrdt/core";
import { internal } from "./_generated/api.js";
import { initComponentTest } from "./setup.test.js";

const componentInternal = internal as unknown as {
  log: {
    appendAssert: any;
    appendLifecycle: any;
    appendRaw: any;
    getRawEvent: any;
    listRawEvents: any;
    getEvent: any;
    listEvents: any;
    listCurrent: any;
    getCurrentEntity: any;
    listCurrentEntities: any;
    rebuildProjections: any;
    issueCollection: any;
    tickCollection: any;
    listCollections: any;
    recordDagRun: any;
    listDagRuns: any;
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

  test("appends and scans exact raw protocol events", async () => {
    const t = initComponentTest();
    const event = assertEvent({
      e: "worker:raw",
      a: "worker.status",
      v: "active",
      validFrom: 9_000,
      actor: "user:raw",
      actorType: "human",
      hlc: { pt: 10_000, l: 1, r: "convex:test" },
    });
    const sequenced = { ...event, seq: 7 };

    const first = await t.mutation(componentInternal.log.appendRaw, {
      event: sequenced,
    });
    expect(first).toMatchObject({
      inserted: true,
      event: {
        id: sequenced.id,
        kind: "assert",
        e: "worker:raw",
        a: "worker.status",
        v: "active",
        validFrom: 9_000,
        validTo: null,
        seq: 7,
      },
    });
    const duplicate = await t.mutation(componentInternal.log.appendRaw, {
      event: sequenced,
    });
    expect(duplicate).toMatchObject({ inserted: false, event: { id: event.id } });

    await expect(
      t.query(componentInternal.log.getRawEvent, { eventId: event.id }),
    ).resolves.toMatchObject({ id: event.id, seq: 7, causalRefs: [] });
    await expect(
      t.query(componentInternal.log.listRawEvents, {
        e: "worker:raw",
        a: "worker.status",
      }),
    ).resolves.toMatchObject([{ id: event.id, seq: 7, causalRefs: [] }]);
    await expect(
      t.query(componentInternal.log.listCurrent, {
        e: "worker:raw",
        a: "worker.status",
      }),
    ).resolves.toMatchObject([
      {
        e: "worker:raw",
        a: "worker.status",
        v: "active",
        assertEventId: event.id,
      },
    ]);
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

  test("reads a component-owned current entity grouped by attribute", async () => {
    const t = initComponentTest();
    await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      e: "worker:entity",
      a: "worker.status",
      v: "active",
      validFrom: 9_000,
    });
    await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      e: "worker:entity",
      a: "worker.role",
      v: "driver",
      validFrom: 9_000,
    });
    const stale = await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      e: "worker:entity",
      a: "worker.region",
      v: "west",
      validFrom: 9_000,
    });
    await t.mutation(componentInternal.log.appendLifecycle, {
      ...actor,
      txTime: 11_000,
      kind: "retract",
      targetEventId: stale.eventId,
      e: "worker:entity",
      a: "worker.region",
      v: "west",
      reason: "not current",
    });

    const entity = await t.query(componentInternal.log.getCurrentEntity, {
      e: "worker:entity",
    });
    expect(entity).toMatchObject({
      e: "worker:entity",
      facts: expect.arrayContaining([
        expect.objectContaining({ a: "worker.status", v: "active" }),
        expect.objectContaining({ a: "worker.role", v: "driver" }),
      ]),
      attributes: [
        expect.objectContaining({ a: "worker.role", values: ["driver"] }),
        expect.objectContaining({ a: "worker.status", values: ["active"] }),
      ],
    });
    expect(
      entity?.facts.some(
        (fact: { a: string; v: unknown }) =>
          fact.a === "worker.region" && fact.v === "west",
      ),
    ).toBe(false);
  });

  test("lists typed component-owned current entities", async () => {
    const t = initComponentTest();
    await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      txTime: 10_000,
      e: "worker:list-a",
      a: "type",
      v: "Worker",
      cardinality: "one",
    });
    await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      txTime: 10_001,
      e: "worker:list-a",
      a: "name",
      v: "List A",
      cardinality: "one",
    });
    await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      txTime: 10_002,
      e: "worker:list-b",
      a: "type",
      v: "Worker",
      cardinality: "one",
    });
    await t.mutation(componentInternal.log.appendAssert, {
      ...actor,
      txTime: 10_003,
      e: "client:list-c",
      a: "type",
      v: "Client",
      cardinality: "one",
    });

    const workers = await t.query(componentInternal.log.listCurrentEntities, {
      type: "Worker",
    });
    expect(workers).toHaveLength(2);
    expect(workers.map((e: { e: string }) => e.e).sort()).toEqual([
      "worker:list-a",
      "worker:list-b",
    ]);
    expect(
      workers.find((e: { e: string }) => e.e === "worker:list-a"),
    ).toMatchObject({
      type: "Worker",
      name: "List A",
      typeFact: expect.objectContaining({
        a: "type",
        v: "Worker",
      }),
    });

    const all = await t.query(componentInternal.log.listCurrentEntities, {});
    expect(all.map((e: { e: string }) => e.e).sort()).toEqual([
      "client:list-c",
      "worker:list-a",
      "worker:list-b",
    ]);
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

  test("persists component-owned DAG run timelines separately from collection tokens", async () => {
    const t = initComponentTest();
    const first = await t.mutation(componentInternal.log.recordDagRun, {
      flowDefName: "owned_flow",
      subject: "worker:flow",
      status: "waiting",
      currentStepId: "collect",
      context: { employer: "employer:acme" },
      now: 50_000,
      events: [
        {
          stepId: "collect",
          type: "collect",
          kind: "collect-issued",
          message: "owned_i9 for employer:acme",
        },
      ],
    });

    expect(first).toMatchObject({
      flowDefName: "owned_flow",
      subject: "worker:flow",
      status: "waiting",
      currentStepId: "collect",
      startedAt: 50_000,
      updatedAt: 50_000,
      events: [
        expect.objectContaining({
          stepId: "collect",
          kind: "collect-issued",
        }),
      ],
    });

    const second = await t.mutation(componentInternal.log.recordDagRun, {
      flowDefName: "owned_flow",
      subject: "worker:flow",
      status: "completed",
      currentStepId: "done",
      context: { employer: "employer:acme" },
      now: 51_000,
      events: [
        {
          stepId: "collect",
          type: "collect",
          kind: "collect-satisfied",
        },
        {
          stepId: "done",
          type: "done",
          kind: "completed",
        },
      ],
    });

    expect(second.runId).toBe(first.runId);
    expect(second).toMatchObject({
      status: "completed",
      currentStepId: "done",
      completedAt: 51_000,
    });
    expect(second.events.map((event: { kind: string }) => event.kind).sort()).toEqual([
      "collect-issued",
      "collect-satisfied",
      "completed",
    ]);

    const listed = await t.query(componentInternal.log.listDagRuns, {
      subject: "worker:flow",
    });
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      runId: first.runId,
      status: "completed",
      flowDefName: "owned_flow",
    });
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

  test("ticks component-owned collection reminders, escalations, and expiry", async () => {
    const t = initComponentTest();
    const issued = await t.mutation(componentInternal.log.issueCollection, {
      actorId: actor.actorId,
      actorType: actor.actorType,
      subject: "worker:collect-timer",
      form: "i9",
      scope: "employer:acme",
      reminderSeconds: 1,
      escalateSeconds: 2,
      expireMs: 3_000,
      now: 60_000,
    });

    expect(issued.reused).toBe(false);

    const reminded = await t.mutation(componentInternal.log.tickCollection, {
      runId: issued.runId,
      phase: "reminder",
      now: 61_000,
    });
    expect(reminded).toMatchObject({
      runId: issued.runId,
      status: "waiting",
      step: "reminded",
      reminderSeconds: 1,
      escalateSeconds: 2,
      expireSeconds: 3,
      remindedAt: 61_000,
    });

    const escalated = await t.mutation(componentInternal.log.tickCollection, {
      runId: issued.runId,
      phase: "escalate",
      now: 62_000,
    });
    expect(escalated).toMatchObject({
      runId: issued.runId,
      status: "waiting",
      step: "escalated",
      escalatedAt: 62_000,
    });

    const expired = await t.mutation(componentInternal.log.tickCollection, {
      runId: issued.runId,
      phase: "expire",
      now: 63_000,
    });
    expect(expired).toMatchObject({
      runId: issued.runId,
      status: "expired",
      step: "expired",
      expiredAt: 63_000,
    });

    expect(
      await t.mutation(componentInternal.log.tickCollection, {
        runId: issued.runId,
        phase: "reminder",
        now: 64_000,
      }),
    ).toBeNull();

    const listed = await t.query(componentInternal.log.listCollections, {
      subject: "worker:collect-timer",
    });
    expect(listed[0]).toMatchObject({
      runId: issued.runId,
      status: "expired",
      step: "expired",
      remindedAt: 61_000,
      escalatedAt: 62_000,
      expiredAt: 63_000,
    });
  });
});
