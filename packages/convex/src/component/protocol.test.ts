/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import { internal } from "./_generated/api.js";
import { initComponentTest } from "./setup.test.js";

const componentInternal = internal as unknown as {
  protocol: {
    buildAssertRow: any;
    buildLifecycleRow: any;
    summarizeRows: any;
  };
};

const tx = {
  _creationTime: 123.456,
  actorId: "user:component",
  actorType: "user" as const,
  txTime: 2_000,
  reason: "component test",
};

describe("@metacrdt/convex component protocol functions", () => {
  test("builds and summarizes protocol rows as registered functions", async () => {
    const t = initComponentTest();
    const row = await t.query(componentInternal.protocol.buildAssertRow, {
      tx,
      txId: "tx:1",
      factId: "fact:1",
      e: "worker:1",
      a: "worker.status",
      v: "active",
      validFrom: 1_900,
    });

    expect(row.eventId).toBeDefined();
    expect(row.hlc).toEqual({ pt: 2_000, l: 123456, r: "convex:reference" });

    const [summary] = await t.query(componentInternal.protocol.summarizeRows, {
      inputs: [{ row, tx }],
    });

    expect(summary).toMatchObject({
      eventId: row.eventId,
      actor: "user:component",
      actorType: "human",
      hasProtocolMetadata: true,
      validEventId: true,
      verifiable: true,
    });
  });

  test("builds lifecycle rows targeting assert ids", async () => {
    const t = initComponentTest();
    const asserted = await t.query(componentInternal.protocol.buildAssertRow, {
      tx,
      txId: "tx:1",
      e: "worker:1",
      a: "worker.status",
      v: "active",
      validFrom: 1_900,
    });
    const retracted = await t.query(componentInternal.protocol.buildLifecycleRow, {
      tx,
      txId: "tx:2",
      kind: "retract",
      targetEventId: asserted.eventId,
      e: "worker:1",
      a: "worker.status",
      v: "active",
      reason: "component retract",
    });

    expect(retracted.kind).toBe("retract");
    expect(retracted.targetEventId).toBe(asserted.eventId);
    expect(retracted.eventId).not.toBe(asserted.eventId);
  });
});
