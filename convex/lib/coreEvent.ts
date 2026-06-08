import {
  CONVEX_REPLICA_ID,
  assertEvent as adapterAssertEvent,
  eventPatch,
  hlcFromTransaction,
  retractEvent as adapterRetractEvent,
  tombstoneEvent as adapterTombstoneEvent,
  untombstoneEvent as adapterUntombstoneEvent,
  type ConvexTransactionRow,
  type ProtocolEventPatch,
} from "@metacrdt/convex";
import type { Event, EventId } from "@metacrdt/core";
import type { Doc } from "../_generated/dataModel";

type Tx = Pick<
  Doc<"transactions">,
  "_creationTime" | "actorId" | "actorType" | "txTime" | "reason"
>;

export { CONVEX_REPLICA_ID, eventPatch, type ProtocolEventPatch };

export function hlcFromTx(tx: Pick<Tx, "_creationTime" | "txTime">) {
  return hlcFromTransaction(tx);
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
  return adapterAssertEvent(tx as ConvexTransactionRow, args);
}

export function retractEvent(
  tx: Tx,
  target: EventId,
  reason?: string,
  causalRefs?: readonly EventId[],
): Event {
  return adapterRetractEvent(
    tx as ConvexTransactionRow,
    target,
    reason,
    causalRefs,
  );
}

export function tombstoneEvent(
  tx: Tx,
  target: EventId,
  reason?: string,
  causalRefs?: readonly EventId[],
): Event {
  return adapterTombstoneEvent(
    tx as ConvexTransactionRow,
    target,
    reason,
    causalRefs,
  );
}

export function untombstoneEvent(
  tx: Tx,
  target: EventId,
  reason?: string,
  causalRefs?: readonly EventId[],
): Event {
  return adapterUntombstoneEvent(
    tx as ConvexTransactionRow,
    target,
    reason,
    causalRefs,
  );
}
