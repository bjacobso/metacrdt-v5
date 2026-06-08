import { describe, expect, test } from "vitest";
import { assert as assertEvent, maxByOrder, type Event } from "@metacrdt/core";
import {
  CARDINALITY_ONE_SUPERSESSION_REASON,
  reconcileCardinalityOneCandidates,
} from "./reconcile";

function ev(actor: string, l: number, v: string): Event {
  return assertEvent({
    e: "worker:1",
    a: "worker.status",
    v,
    validFrom: 1_000,
    actor,
    actorType: "human",
    hlc: { pt: 2_000, l, r: "convex:test" },
  });
}

describe("@metacrdt/convex cardinality-one reconciliation", () => {
  test("chooses the ≺-max event as the projection winner", () => {
    const candidates = [
      { item: "active", event: ev("user:a", 0, "active") },
      { item: "terminated", event: ev("user:a", 1, "terminated") },
      { item: "pending", event: ev("user:a", 0, "pending") },
    ];

    const result = reconcileCardinalityOneCandidates(candidates);
    expect(result.winner.event.id).toBe(
      maxByOrder(candidates.map((c) => c.event))?.id,
    );
    expect(result.winner.item).toBe("terminated");
    expect(result.losers.map((c) => c.item).sort()).toEqual([
      "active",
      "pending",
    ]);
  });

  test("is independent of candidate array order", () => {
    const candidates = [
      { item: "first", event: ev("user:a", 0, "first") },
      { item: "second", event: ev("user:b", 0, "second") },
      { item: "third", event: ev("user:a", 1, "third") },
    ];
    const reversed = [...candidates].reverse();

    expect(reconcileCardinalityOneCandidates(candidates).winner.event.id).toBe(
      reconcileCardinalityOneCandidates(reversed).winner.event.id,
    );
  });

  test("throws clearly for an empty candidate set", () => {
    expect(() =>
      reconcileCardinalityOneCandidates([], "worker:1/worker.status"),
    ).toThrow("no candidates for worker:1/worker.status");
  });

  test("exports the shared lifecycle reason string", () => {
    expect(CARDINALITY_ONE_SUPERSESSION_REASON).toContain("≺-max");
  });
});
