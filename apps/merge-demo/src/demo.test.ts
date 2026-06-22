import { describe, expect, test } from "vitest";
import { fromEvents, has, merge, valueOf } from "@metacrdt/core";
import {
  foldDigestOfLog,
  logDigest,
  runHeadlessScript,
  type ReplicaSnapshot,
} from "./demo.js";

function statusValue(snapshot: ReplicaSnapshot): unknown {
  return snapshot.workers.find((worker) => worker.id === "worker:w1")?.attributes[
    "worker/status"
  ]?.value;
}

describe("two-replica branch-and-merge proof", () => {
  test("scripts divergence, convergence, history, and idempotent delta sync", async () => {
    const result = await runHeadlessScript();

    expect(result.initialSync).toMatchObject({
      sentFromA: 1,
      sentFromB: 0,
      insertedIntoA: 0,
      insertedIntoB: 1,
    });

    expect(result.offline.converged).toBe(false);
    expect(result.offline.alfa.projectionDigest).not.toBe(
      result.offline.bravo.projectionDigest,
    );

    expect(result.firstReconnect).toMatchObject({
      sentFromA: 2,
      sentFromB: 2,
      insertedIntoA: 2,
      insertedIntoB: 2,
    });
    expect(result.converged.converged).toBe(true);
    expect(result.converged.alfa.logDigest).toBe(result.converged.bravo.logDigest);
    expect(result.converged.alfa.projectionDigest).toBe(
      result.converged.bravo.projectionDigest,
    );

    expect(statusValue(result.converged.alfa)).toBe("terminated");
    expect(statusValue(result.converged.bravo)).toBe("terminated");
    expect(result.converged.alfa.conflict.winner?.id).toBe(
      result.terminatedEvent.id,
    );
    expect(result.converged.bravo.conflict.winner?.id).toBe(
      result.terminatedEvent.id,
    );

    const alfaLog = fromEvents(result.converged.alfa.events);
    const bravoLog = fromEvents(result.converged.bravo.events);
    expect(has(alfaLog, result.activeEvent.id)).toBe(true);
    expect(has(bravoLog, result.activeEvent.id)).toBe(true);
    expect(has(alfaLog, result.terminatedEvent.id)).toBe(true);
    expect(has(bravoLog, result.terminatedEvent.id)).toBe(true);
    expect(
      valueOf(
        "worker:w1",
        "worker/status",
        { txTime: result.activeEvent.hlc.pt, validTime: result.activeEvent.hlc.pt },
        alfaLog,
        () => "one",
      ),
    ).toBe("active");

    const mergeAB = merge(
      fromEvents(result.offline.alfa.events),
      fromEvents(result.offline.bravo.events),
    );
    const mergeBA = merge(
      fromEvents(result.offline.bravo.events),
      fromEvents(result.offline.alfa.events),
    );
    const empty = fromEvents([]);
    expect(foldDigestOfLog(mergeAB)).toBe(foldDigestOfLog(mergeBA));
    expect(foldDigestOfLog(merge(mergeAB, empty))).toBe(
      foldDigestOfLog(merge(fromEvents(result.offline.alfa.events), merge(fromEvents(result.offline.bravo.events), empty))),
    );
    expect(logDigest([...merge(mergeAB, mergeAB).values()])).toBe(
      logDigest([...mergeAB.values()]),
    );
    expect(logDigest([...merge(alfaLog, alfaLog).values()])).toBe(
      result.converged.alfa.logDigest,
    );

    expect(result.secondSync).toMatchObject({
      sentFromA: 0,
      sentFromB: 0,
      insertedIntoA: 0,
      insertedIntoB: 0,
    });
  });
});
