import type { Event } from "@metacrdt/core";
import type { RuntimeServices, VersionVector } from "./types.js";
import { mergeFrom } from "./operations.js";

export type SyncDelta = {
  readonly since: VersionVector;
  readonly events: readonly Event[];
};

export type SyncExchangeResult = {
  readonly sentFromA: number;
  readonly sentFromB: number;
  readonly insertedIntoA: number;
  readonly insertedIntoB: number;
  readonly vvA: VersionVector;
  readonly vvB: VersionVector;
};

function eventSeq(event: Event): number {
  return event.seq ?? 0;
}

function eventReplica(event: Event): string {
  return event.hlc.r;
}

/** Compute the highest observed per-replica sequence from a set of events. */
export function versionVector(events: Iterable<Event>): VersionVector {
  const vv: Record<string, number> = {};
  for (const event of events) {
    const replica = eventReplica(event);
    const seq = eventSeq(event);
    if (seq <= 0) continue;
    vv[replica] = Math.max(vv[replica] ?? 0, seq);
  }
  return vv;
}

/**
 * Return the events this replica should send to a peer that has `remote`.
 * Events without `seq` are included as compatibility deltas because the peer
 * cannot prove it has seen them by version vector alone.
 */
export function deltaSince(
  events: Iterable<Event>,
  remote: VersionVector,
): SyncDelta {
  const out: Event[] = [];
  for (const event of events) {
    const seq = eventSeq(event);
    if (seq <= 0 || seq > (remote[eventReplica(event)] ?? 0)) out.push(event);
  }
  return { since: remote, events: out };
}

export function mergeVersionVectors(
  a: VersionVector,
  b: VersionVector,
): VersionVector {
  const out: Record<string, number> = { ...a };
  for (const [replica, seq] of Object.entries(b)) {
    out[replica] = Math.max(out[replica] ?? 0, seq);
  }
  return out;
}

/**
 * One bidirectional anti-entropy round (SPEC §8.2): exchange version vectors,
 * send deltas, merge G-Set events idempotently, and return resulting vectors.
 */
export async function exchangeDeltas(
  a: RuntimeServices,
  b: RuntimeServices,
): Promise<SyncExchangeResult> {
  const eventsA = await a.store.scan();
  const eventsB = await b.store.scan();
  const vvA0 = versionVector(eventsA);
  const vvB0 = versionVector(eventsB);
  const deltaA = deltaSince(eventsA, vvB0);
  const deltaB = deltaSince(eventsB, vvA0);

  const insertedIntoA = await mergeFrom(a, deltaB.events);
  const insertedIntoB = await mergeFrom(b, deltaA.events);

  const vvA = versionVector(await a.store.scan());
  const vvB = versionVector(await b.store.scan());
  return {
    sentFromA: deltaA.events.length,
    sentFromB: deltaB.events.length,
    insertedIntoA,
    insertedIntoB,
    vvA,
    vvB,
  };
}
