import { describe, expect, test } from "vitest";
import { verifyId } from "@metacrdt/core";
import {
  assertEvent,
  eventPatch,
  hlcFromTransaction,
  protocolEventFromRows,
  retractEvent,
  summarizeProtocolEvent,
} from "./events";
import type { ConvexTransactionRow, ProtocolFactEventRow } from "./types";

const tx: ConvexTransactionRow = {
  _creationTime: 1234.567,
  actorId: "user:ana",
  actorType: "user",
  txTime: 10_000,
  reason: "fixture",
};

describe("@metacrdt/convex event adapters", () => {
  test("builds verifiable assert events and protocol patches", () => {
    const ev = assertEvent(tx, {
      e: "worker:1",
      a: "worker.status",
      v: "active",
      validFrom: 9_000,
    });
    expect(verifyId(ev)).toBe(true);
    expect(ev.actorType).toBe("human");
    expect(ev.hlc).toEqual(hlcFromTransaction(tx));

    const patch = eventPatch(ev);
    expect(patch.eventId).toBe(ev.id);
    expect(patch.hlc).toEqual(ev.hlc);
    expect(patch.replicaId).toBe("convex:reference");
    expect(patch.targetEventId).toBeUndefined();
    expect(patch.causalRefs).toBeUndefined();
  });

  test("builds verifiable lifecycle events targeting an assert id", () => {
    const assertEv = assertEvent(tx, {
      e: "worker:1",
      a: "worker.status",
      v: "active",
      validFrom: 9_000,
    });
    const retractEv = retractEvent(tx, assertEv.id, "superseded");

    expect(verifyId(retractEv)).toBe(true);
    expect(eventPatch(retractEv).targetEventId).toBe(assertEv.id);
  });

  test("reconstructs and verifies protocol event rows", () => {
    const ev = assertEvent(tx, {
      e: "worker:1",
      a: "worker.status",
      v: "active",
      validFrom: 9_000,
    });
    const row: ProtocolFactEventRow = {
      txTime: tx.txTime,
      eventId: ev.id,
      hlc: ev.hlc,
      kind: "assert",
      e: "worker:1",
      a: "worker.status",
      v: "active",
      validFrom: 9_000,
      reason: "fixture",
    };

    const reconstructed = protocolEventFromRows(row, tx);
    expect(reconstructed).not.toBeNull();
    expect(reconstructed && verifyId(reconstructed)).toBe(true);

    expect(summarizeProtocolEvent(row, tx)).toMatchObject({
      eventId: ev.id,
      actor: "user:ana",
      actorType: "human",
      hasProtocolMetadata: true,
      verifiable: true,
      validEventId: true,
      v: "active",
    });
  });

  test("summarizes legacy rows without claiming protocol verification", () => {
    const row: ProtocolFactEventRow = {
      txTime: tx.txTime,
      kind: "assert",
      e: "worker:legacy",
      a: "worker.status",
      v: "active",
      validFrom: 9_000,
    };

    expect(protocolEventFromRows(row, tx)).toBeNull();
    expect(summarizeProtocolEvent(row, tx)).toMatchObject({
      hasProtocolMetadata: false,
      verifiable: false,
      validEventId: false,
    });
  });
});
