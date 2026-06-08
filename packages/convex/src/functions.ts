import type { Event, EventId } from "@metacrdt/core";
import {
  assertEvent,
  eventPatch,
  retractEvent,
  summarizeProtocolEvent,
  tombstoneEvent,
  untombstoneEvent,
} from "./events";
import type {
  ConvexTransactionRow,
  ProtocolEventPatch,
  ProtocolEventSummary,
  ProtocolFactEventKind,
  ProtocolFactEventRow,
} from "./types";

export type ProtocolLifecycleKind = Exclude<
  ProtocolFactEventKind,
  "assert" | "correction"
>;

export type ProtocolFactEventInsert<TxId = string, FactId = string> = {
  readonly txId: TxId;
  readonly txTime: number;
  readonly kind: Exclude<ProtocolFactEventKind, "correction">;
  readonly factId?: FactId;
  readonly e: string;
  readonly a: string;
  readonly v: unknown;
  readonly validFrom?: number;
  readonly validTo?: number;
  readonly reason?: string;
  readonly metadata?: unknown;
} & ProtocolEventPatch;

export type ProtocolFactEventInserter<TxId, FactId, RowId> = (
  row: ProtocolFactEventInsert<TxId, FactId>,
) => Promise<RowId>;

export type BuiltProtocolFactEvent<TxId, FactId> = {
  readonly event: Event;
  readonly row: ProtocolFactEventInsert<TxId, FactId>;
};

export type AppendedProtocolFactEvent<TxId, FactId, RowId> =
  BuiltProtocolFactEvent<TxId, FactId> & {
    readonly rowId: RowId;
  };

export type AppendAssertArgs<TxId, FactId> = {
  readonly tx: ConvexTransactionRow;
  readonly txId: TxId;
  readonly factId?: FactId;
  readonly e: string;
  readonly a: string;
  readonly v: unknown;
  readonly validFrom: number;
  readonly validTo?: number;
  readonly reason?: string;
  readonly metadata?: unknown;
  readonly causalRefs?: readonly EventId[];
};

export type AppendLifecycleArgs<TxId, FactId> = {
  readonly tx: ConvexTransactionRow;
  readonly txId: TxId;
  readonly factId?: FactId;
  readonly kind: ProtocolLifecycleKind;
  readonly targetEventId: EventId;
  readonly e: string;
  readonly a: string;
  readonly v: unknown;
  readonly validTo?: number;
  readonly reason?: string;
  readonly metadata?: unknown;
  readonly causalRefs?: readonly EventId[];
};

export type ProtocolFactEventWriter<TxId, FactId, RowId> = {
  readonly buildAssert: (
    args: AppendAssertArgs<TxId, FactId>,
  ) => BuiltProtocolFactEvent<TxId, FactId>;
  readonly appendAssert: (
    args: AppendAssertArgs<TxId, FactId>,
  ) => Promise<AppendedProtocolFactEvent<TxId, FactId, RowId>>;
  readonly buildLifecycle: (
    args: AppendLifecycleArgs<TxId, FactId>,
  ) => BuiltProtocolFactEvent<TxId, FactId>;
  readonly appendLifecycle: (
    args: AppendLifecycleArgs<TxId, FactId>,
  ) => Promise<AppendedProtocolFactEvent<TxId, FactId, RowId>>;
};

export function buildAssertFactEvent<TxId, FactId>(
  args: AppendAssertArgs<TxId, FactId>,
): BuiltProtocolFactEvent<TxId, FactId> {
  const event = assertEvent(args.tx, args);
  return {
    event,
    row: {
      txId: args.txId,
      txTime: args.tx.txTime,
      kind: "assert",
      factId: args.factId,
      e: args.e,
      a: args.a,
      v: args.v,
      validFrom: args.validFrom,
      validTo: args.validTo,
      reason: args.reason,
      metadata: args.metadata,
      ...eventPatch(event),
    },
  };
}

export function buildLifecycleFactEvent<TxId, FactId>(
  args: AppendLifecycleArgs<TxId, FactId>,
): BuiltProtocolFactEvent<TxId, FactId> {
  const event =
    args.kind === "retract"
      ? retractEvent(
          args.tx,
          args.targetEventId,
          args.reason,
          args.causalRefs,
        )
      : args.kind === "tombstone"
        ? tombstoneEvent(
            args.tx,
            args.targetEventId,
            args.reason,
            args.causalRefs,
          )
        : untombstoneEvent(
            args.tx,
            args.targetEventId,
            args.reason,
            args.causalRefs,
          );

  return {
    event,
    row: {
      txId: args.txId,
      txTime: args.tx.txTime,
      kind: args.kind,
      factId: args.factId,
      e: args.e,
      a: args.a,
      v: args.v,
      validTo: args.validTo,
      reason: args.reason,
      metadata: args.metadata,
      ...eventPatch(event),
    },
  };
}

export function createProtocolFactEventWriter<TxId, FactId, RowId>(
  insert: ProtocolFactEventInserter<TxId, FactId, RowId>,
): ProtocolFactEventWriter<TxId, FactId, RowId> {
  return {
    buildAssert: buildAssertFactEvent,
    appendAssert: async (args) => {
      const built = buildAssertFactEvent(args);
      return { ...built, rowId: await insert(built.row) };
    },
    buildLifecycle: buildLifecycleFactEvent,
    appendLifecycle: async (args) => {
      const built = buildLifecycleFactEvent(args);
      return { ...built, rowId: await insert(built.row) };
    },
  };
}

export async function summarizeProtocolEventRows<
  TxId,
  Row extends ProtocolFactEventRow,
>(
  rows: readonly (Row & { readonly txId: TxId })[],
  txForRow: (
    row: Row & { readonly txId: TxId },
  ) => Promise<Pick<ConvexTransactionRow, "actorId" | "actorType" | "reason">>,
): Promise<ProtocolEventSummary[]> {
  const out: ProtocolEventSummary[] = [];
  for (const row of rows) {
    out.push(summarizeProtocolEvent(row, await txForRow(row)));
  }
  return out;
}
