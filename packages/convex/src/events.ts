import {
  assert as coreAssert,
  retract as coreRetract,
  tombstone as coreTombstone,
  untombstone as coreUntombstone,
  verifyId,
  type Event,
  type EventId,
  type EventKind,
  type Hlc,
} from "@metacrdt/core";
import {
  CONVEX_REPLICA_ID,
  asCoreValue,
  convexActorType,
  type ConvexTransactionRow,
  type ProtocolEventPatch,
  type ProtocolEventSummary,
  type ProtocolFactEventRow,
} from "./types";

export function hlcFromTransaction(
  tx: Pick<ConvexTransactionRow, "_creationTime" | "txTime">,
  replicaId = CONVEX_REPLICA_ID,
): Hlc {
  return {
    pt: tx.txTime,
    l: Math.max(0, Math.floor(tx._creationTime * 1000)),
    r: replicaId,
  };
}

export function eventPatch(e: Event): ProtocolEventPatch {
  if (!verifyId(e)) throw new Error(`invalid core event id ${e.id}`);
  return {
    eventId: e.id,
    hlc: e.hlc,
    replicaId: e.hlc.r,
    targetEventId: e.target,
    causalRefs: e.causalRefs === undefined ? undefined : [...e.causalRefs],
  };
}

export function assertEvent(
  tx: ConvexTransactionRow,
  args: {
    readonly e: string;
    readonly a: string;
    readonly v: unknown;
    readonly validFrom: number;
    readonly validTo?: number;
    readonly reason?: string;
    readonly causalRefs?: readonly EventId[];
    readonly replicaId?: string;
  },
): Event {
  return coreAssert({
    e: args.e,
    a: args.a,
    v: asCoreValue(args.v),
    validFrom: args.validFrom,
    validTo: args.validTo ?? null,
    actor: tx.actorId,
    actorType: convexActorType(tx.actorType),
    hlc: hlcFromTransaction(tx, args.replicaId),
    reason: args.reason ?? tx.reason,
    causalRefs: args.causalRefs,
  });
}

function targetEvent(
  kind: Exclude<EventKind, "assert">,
  tx: ConvexTransactionRow,
  target: EventId,
  reason?: string,
  causalRefs?: readonly EventId[],
  replicaId?: string,
): Event {
  const input = {
    target,
    actor: tx.actorId,
    actorType: convexActorType(tx.actorType),
    hlc: hlcFromTransaction(tx, replicaId),
    reason: reason ?? tx.reason,
    causalRefs,
  };
  if (kind === "retract") return coreRetract(input);
  if (kind === "tombstone") return coreTombstone(input);
  return coreUntombstone(input);
}

export const retractEvent = (
  tx: ConvexTransactionRow,
  target: EventId,
  reason?: string,
  causalRefs?: readonly EventId[],
  replicaId?: string,
): Event => targetEvent("retract", tx, target, reason, causalRefs, replicaId);

export const tombstoneEvent = (
  tx: ConvexTransactionRow,
  target: EventId,
  reason?: string,
  causalRefs?: readonly EventId[],
  replicaId?: string,
): Event => targetEvent("tombstone", tx, target, reason, causalRefs, replicaId);

export const untombstoneEvent = (
  tx: ConvexTransactionRow,
  target: EventId,
  reason?: string,
  causalRefs?: readonly EventId[],
  replicaId?: string,
): Event =>
  targetEvent("untombstone", tx, target, reason, causalRefs, replicaId);

export function protocolEventFromRows(
  row: ProtocolFactEventRow,
  tx: Pick<ConvexTransactionRow, "actorId" | "actorType" | "reason">,
): Event | null {
  if (row.eventId === undefined || row.hlc === undefined) return null;
  if (row.kind === "correction") return null;

  const base = {
    id: row.eventId,
    kind: row.kind,
    actor: tx.actorId,
    actorType: convexActorType(tx.actorType),
    hlc: row.hlc,
    causalRefs: [...(row.causalRefs ?? [])],
    reason: row.reason ?? tx.reason,
  };

  if (row.kind === "assert") {
    return {
      ...base,
      e: row.e,
      a: row.a,
      v: asCoreValue(row.v),
      validFrom: row.validFrom ?? row.txTime,
      validTo: row.validTo ?? null,
    };
  }

  if (row.targetEventId === undefined) return null;
  return { ...base, target: row.targetEventId };
}

export function summarizeProtocolEvent(
  row: ProtocolFactEventRow,
  tx: Pick<ConvexTransactionRow, "actorId" | "actorType" | "reason">,
): ProtocolEventSummary {
  const ev = protocolEventFromRows(row, tx);
  const reason = row.reason ?? tx.reason;
  return {
    kind: row.kind,
    e: row.e,
    a: row.a,
    v: row.v,
    txTime: row.txTime,
    actor: tx.actorId,
    actorType: convexActorType(tx.actorType),
    causalRefs: [...(row.causalRefs ?? [])],
    hasProtocolMetadata: row.eventId !== undefined && row.hlc !== undefined,
    verifiable: ev !== null,
    validEventId: ev === null ? false : verifyId(ev),
    ...(row.eventId === undefined ? {} : { eventId: row.eventId }),
    ...(row.validFrom === undefined ? {} : { validFrom: row.validFrom }),
    ...(row.validTo === undefined ? {} : { validTo: row.validTo }),
    ...(row.hlc === undefined ? {} : { hlc: row.hlc }),
    ...(row.targetEventId === undefined
      ? {}
      : { targetEventId: row.targetEventId }),
    ...(reason === undefined ? {} : { reason }),
  };
}
