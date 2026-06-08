import { describe, expect, test } from "vitest";
import { verifyId, type EventId } from "@metacrdt/core";
import {
  buildAssertFactEvent,
  buildLifecycleFactEvent,
  createProtocolFactEventWriter,
  summarizeProtocolEventRows,
  type ProtocolFactEventInsert,
} from "./functions";
import type { ConvexTransactionRow } from "./types";

const tx: ConvexTransactionRow = {
  _creationTime: 123.456,
  actorId: "user:writer",
  actorType: "user",
  txTime: 2_000,
  reason: "factory test",
};

describe("@metacrdt/convex protocol fact-event helpers", () => {
  test("builds protocol-shaped assert rows", () => {
    const built = buildAssertFactEvent({
      tx,
      txId: "tx:1",
      factId: "fact:1",
      e: "worker:1",
      a: "worker.status",
      v: "active",
      validFrom: 1_900,
    });

    expect(verifyId(built.event)).toBe(true);
    expect(built.row).toMatchObject({
      txId: "tx:1",
      txTime: tx.txTime,
      kind: "assert",
      factId: "fact:1",
      e: "worker:1",
      a: "worker.status",
      v: "active",
      validFrom: 1_900,
      eventId: built.event.id,
      replicaId: "convex:reference",
    });
  });

  test("builds lifecycle rows targeting an assert event", () => {
    const assertBuilt = buildAssertFactEvent({
      tx,
      txId: "tx:1",
      factId: "fact:1",
      e: "worker:1",
      a: "worker.status",
      v: "active",
      validFrom: 1_900,
    });

    const retracted = buildLifecycleFactEvent({
      tx,
      txId: "tx:2",
      factId: "fact:1",
      kind: "retract",
      targetEventId: assertBuilt.event.id as EventId,
      e: "worker:1",
      a: "worker.status",
      v: "active",
      reason: "superseded",
    });

    expect(verifyId(retracted.event)).toBe(true);
    expect(retracted.row).toMatchObject({
      txId: "tx:2",
      kind: "retract",
      targetEventId: assertBuilt.event.id,
      reason: "superseded",
    });
  });

  test("factory appends rows through an injected inserter", async () => {
    const inserted: ProtocolFactEventInsert[] = [];
    const writer = createProtocolFactEventWriter<string, string, string>(
      async (row) => {
        inserted.push(row);
        return `event:${inserted.length}`;
      },
    );

    const appended = await writer.appendAssert({
      tx,
      txId: "tx:1",
      factId: "fact:1",
      e: "worker:1",
      a: "worker.status",
      v: "active",
      validFrom: 1_900,
    });

    const tombstoned = await writer.appendLifecycle({
      tx,
      txId: "tx:2",
      factId: "fact:1",
      kind: "tombstone",
      targetEventId: appended.event.id as EventId,
      e: "worker:1",
      a: "worker.status",
      v: "active",
      reason: "bad source",
    });

    expect(appended.rowId).toBe("event:1");
    expect(tombstoned.rowId).toBe("event:2");
    expect(inserted).toHaveLength(2);
    expect(inserted[1]!.targetEventId).toBe(appended.event.id);
  });

  test("summarizes rows through an injected transaction lookup", async () => {
    const writer = createProtocolFactEventWriter<
      string,
      string,
      ProtocolFactEventInsert
    >(async (row) => row);
    const appended = await writer.appendAssert({
      tx,
      txId: "tx:1",
      factId: "fact:1",
      e: "worker:1",
      a: "worker.status",
      v: "active",
      validFrom: 1_900,
    });

    const [summary] = await summarizeProtocolEventRows(
      [{ ...appended.row, txId: "tx:1" }],
      async () => tx,
    );

    expect(summary).toBeDefined();
    expect(summary!).toMatchObject({
      eventId: appended.event.id,
      actor: "user:writer",
      actorType: "human",
      validEventId: true,
      verifiable: true,
    });
  });
});
