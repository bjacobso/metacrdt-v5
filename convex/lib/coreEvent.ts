import {
  assert as coreAssert,
  retract as coreRetract,
  tombstone as coreTombstone,
  untombstone as coreUntombstone,
  verifyId,
  type ActorType,
  type Event,
  type EventId,
  type Hlc,
  type Value,
} from "@metacrdt/core";
import type { Doc } from "../_generated/dataModel";

export const CONVEX_REPLICA_ID = "convex:reference";

type Tx = Pick<
  Doc<"transactions">,
  "_creationTime" | "actorId" | "actorType" | "txTime" | "reason"
>;

export type ProtocolEventPatch = {
  eventId: string;
  hlc: Hlc;
  replicaId: string;
  targetEventId?: string;
  causalRefs?: string[];
};

function actorType(t: Tx["actorType"]): ActorType {
  return t === "user" ? "human" : t;
}

export function hlcFromTx(tx: Pick<Tx, "_creationTime" | "txTime">): Hlc {
  // Convex is a centralized reference runtime today. Use txTime as physical
  // time, and derive the logical component from Convex's transaction document
  // creation time so rapid sequential writes in the same millisecond preserve
  // Convex order without a contended global counter.
  return {
    pt: tx.txTime,
    l: Math.max(0, Math.floor(tx._creationTime * 1000)),
    r: CONVEX_REPLICA_ID,
  };
}

function patchFor(e: Event): ProtocolEventPatch {
  if (!verifyId(e)) throw new Error(`invalid core event id ${e.id}`);
  return {
    eventId: e.id,
    hlc: e.hlc,
    replicaId: e.hlc.r,
    targetEventId: e.target,
    causalRefs: e.causalRefs === undefined ? undefined : [...e.causalRefs],
  };
}

function value(v: unknown): Value {
  // Convex values are plain JSON-ish values for this project. @metacrdt/core
  // rejects `undefined`, functions, symbols, etc. at canonical encoding time.
  return v as Value;
}

export function assertEvent(
  tx: Tx,
  args: {
    e: string;
    a: string;
    v: unknown;
    validFrom: number;
    validTo?: number;
    reason?: string;
    causalRefs?: readonly EventId[];
  },
): Event {
  return coreAssert({
    e: args.e,
    a: args.a,
    v: value(args.v),
    validFrom: args.validFrom,
    validTo: args.validTo ?? null,
    actor: tx.actorId,
    actorType: actorType(tx.actorType),
    hlc: hlcFromTx(tx),
    reason: args.reason ?? tx.reason,
    causalRefs: args.causalRefs,
  });
}

export function retractEvent(
  tx: Tx,
  target: EventId,
  reason?: string,
  causalRefs?: readonly EventId[],
): Event {
  return coreRetract({
    target,
    actor: tx.actorId,
    actorType: actorType(tx.actorType),
    hlc: hlcFromTx(tx),
    reason: reason ?? tx.reason,
    causalRefs,
  });
}

export function tombstoneEvent(
  tx: Tx,
  target: EventId,
  reason?: string,
  causalRefs?: readonly EventId[],
): Event {
  return coreTombstone({
    target,
    actor: tx.actorId,
    actorType: actorType(tx.actorType),
    hlc: hlcFromTx(tx),
    reason: reason ?? tx.reason,
    causalRefs,
  });
}

export function untombstoneEvent(
  tx: Tx,
  target: EventId,
  reason?: string,
  causalRefs?: readonly EventId[],
): Event {
  return coreUntombstone({
    target,
    actor: tx.actorId,
    actorType: actorType(tx.actorType),
    hlc: hlcFromTx(tx),
    reason: reason ?? tx.reason,
    causalRefs,
  });
}

export const eventPatch = patchFor;
