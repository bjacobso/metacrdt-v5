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
