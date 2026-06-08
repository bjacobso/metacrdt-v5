import { maxByOrder, type Event } from "@metacrdt/core";

export const CARDINALITY_ONE_SUPERSESSION_REASON =
  "superseded by ≺-max cardinality-one assertion";

export type ReconcileCandidate<T> = {
  readonly item: T;
  readonly event: Event;
};

export type CardinalityOneReconcileResult<T> = {
  readonly winner: ReconcileCandidate<T>;
  readonly losers: readonly ReconcileCandidate<T>[];
};

/**
 * Pick the surviving candidate for a cardinality-one projection using the
 * protocol's replica-independent `≺` order (SPEC §5.1–5.2).
 *
 * This helper is intentionally pure: host apps remain responsible for fetching
 * candidates, writing projection rows, and appending lifecycle events.
 */
export function reconcileCardinalityOneCandidates<T>(
  candidates: readonly ReconcileCandidate<T>[],
  label = "cardinality-one candidates",
): CardinalityOneReconcileResult<T> {
  if (candidates.length === 0) throw new Error(`no candidates for ${label}`);

  const winnerEvent = maxByOrder(candidates.map((c) => c.event));
  const winner = candidates.find((c) => c.event.id === winnerEvent?.id);
  if (!winner) throw new Error(`no ≺ winner for ${label}`);

  return {
    winner,
    losers: candidates.filter((c) => c !== winner),
  };
}
