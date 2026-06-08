import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import {
  type ActorType,
  type Event,
  type EventKind,
  type Value,
  verifyId,
} from "@metacrdt/core";

import api from "./_generated/api";
import { DatabaseReader } from "./_generated/services";
import {
  InvalidProtocolEvent,
  ProtocolEventSummary as ProtocolEventSummarySchema,
  UnknownEntity,
} from "./metacrdt.spec";
import type { FactEvents } from "./tables/FactEvents";
import type { Transactions } from "./tables/Transactions";

type FactEventDoc = typeof FactEvents.Doc.Type;
type TransactionDoc = typeof Transactions.Doc.Type;
type ProtocolEventSummary = typeof ProtocolEventSummarySchema.Type;

function actorType(t: TransactionDoc["actorType"]): ActorType {
  return t === "user" ? "human" : t;
}

function protocolEvent(row: FactEventDoc, tx: TransactionDoc): Event | null {
  if (row.eventId === undefined || row.hlc === undefined) return null;
  if (row.kind === "correction") return null;

  const base = {
    id: row.eventId,
    kind: row.kind as EventKind,
    actor: tx.actorId,
    actorType: actorType(tx.actorType),
    hlc: row.hlc,
    causalRefs: row.causalRefs ?? [],
    reason: row.reason ?? tx.reason,
  };

  if (row.kind === "assert") {
    return {
      ...base,
      e: row.e,
      a: row.a,
      v: row.v as Value,
      validFrom: row.validFrom ?? row.txTime,
      validTo: row.validTo ?? null,
    };
  }

  if (row.targetEventId === undefined) return null;
  return { ...base, target: row.targetEventId };
}

function summary(row: FactEventDoc, tx: TransactionDoc): ProtocolEventSummary {
  const ev = protocolEvent(row, tx);
  const reason = row.reason ?? tx.reason;
  return {
    kind: row.kind,
    e: row.e,
    a: row.a,
    v: row.v,
    txTime: row.txTime,
    actor: tx.actorId,
    actorType: actorType(tx.actorType),
    causalRefs: row.causalRefs ?? [],
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

function typedError(err: unknown): UnknownEntity | InvalidProtocolEvent {
  if (err instanceof UnknownEntity || err instanceof InvalidProtocolEvent) {
    return err;
  }
  return new InvalidProtocolEvent({
    eventId: "(decode-or-read)",
    reason: err instanceof Error ? err.message : String(err),
  });
}

const verifyEvents = FunctionImpl.make(
  api,
  "metacrdt",
  "verifyEvents",
  ({ e, a, limit, requireValid }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const take = Math.max(1, Math.min(limit ?? 50, 200));
      const rows =
        a === undefined
          ? yield* reader
              .table("factEvents")
              .index("by_e", (q) => q.eq("e", e), "desc")
              .take(take)
          : yield* reader
              .table("factEvents")
              .index("by_e_a_tx", (q) => q.eq("e", e).eq("a", a), "desc")
              .take(take);

      if (rows.length === 0) {
        return yield* Effect.fail(new UnknownEntity({ e }));
      }

      const out = yield* Effect.forEach(rows, (row) =>
        Effect.gen(function* () {
          const tx = yield* reader.table("transactions").get(row.txId);
          const s = summary(row, tx);
          if (requireValid === true && s.hasProtocolMetadata && !s.validEventId) {
            return yield* Effect.fail(
              new InvalidProtocolEvent({
                eventId: s.eventId ?? "(missing)",
                reason: "eventId does not verify against @metacrdt/core",
              }),
            );
          }
          return s;
        }),
      );

      return out;
    }).pipe(Effect.mapError(typedError)),
);

export const metacrdt = GroupImpl.make(api, "metacrdt").pipe(
  Layer.provide(verifyEvents),
);
