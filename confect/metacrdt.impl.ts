import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import { summarizeProtocolEvent } from "@metacrdt/convex";

import api from "./_generated/api";
import { DatabaseReader } from "./_generated/services";
import {
  DerivedExplanation as DerivedExplanationSchema,
  InvalidProtocolEvent,
  ProtocolEventSummary as ProtocolEventSummarySchema,
  UnknownDerivedFact,
  UnknownEntity,
} from "./metacrdt.spec";
import type { DerivedFacts } from "./tables/DerivedFacts";
import type { FactEvents } from "./tables/FactEvents";
import type { Transactions } from "./tables/Transactions";

type DerivedFactDoc = typeof DerivedFacts.Doc.Type;
type FactEventDoc = typeof FactEvents.Doc.Type;
type TransactionDoc = typeof Transactions.Doc.Type;
type DerivedExplanation = typeof DerivedExplanationSchema.Type;
type ProtocolEventSummary = typeof ProtocolEventSummarySchema.Type;

function summary(row: FactEventDoc, tx: TransactionDoc): ProtocolEventSummary {
  return summarizeProtocolEvent(row, tx) as ProtocolEventSummary;
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

function typedExplanationError(
  err: unknown,
): UnknownDerivedFact | InvalidProtocolEvent {
  if (err instanceof UnknownDerivedFact || err instanceof InvalidProtocolEvent) {
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

const explainDerived = FunctionImpl.make(
  api,
  "metacrdt",
  "explainDerived",
  ({ e, a }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const rows: ReadonlyArray<DerivedFactDoc> =
        a === undefined
          ? yield* reader
              .table("derivedFacts")
              .index("by_e", (q) => q.eq("e", e))
              .take(200)
          : yield* reader
              .table("derivedFacts")
              .index("by_e_a", (q) => q.eq("e", e).eq("a", a))
              .take(200);
      const derived = rows.filter((row) => !row.stale);

      if (derived.length === 0) {
        return yield* Effect.fail(
          new UnknownDerivedFact({
            e,
            ...(a === undefined ? {} : { a }),
          }),
        );
      }

      const out = yield* Effect.forEach(derived, (row) =>
        Effect.gen(function* () {
          if ((row.sourceEventIds ?? []).length === 0) {
            return yield* Effect.fail(
              new InvalidProtocolEvent({
                eventId: "(missing)",
                reason: "derived row does not carry sourceEventIds",
              }),
            );
          }

          const because = yield* Effect.forEach(row.sourceEventIds ?? [], (eventId) =>
            Effect.gen(function* () {
              const matches = yield* reader
                .table("factEvents")
                .index("by_eventId", (q) => q.eq("eventId", eventId))
                .take(2);
              const source = matches[0];
              if (source === undefined || source.kind !== "assert") {
                return yield* Effect.fail(
                  new InvalidProtocolEvent({
                    eventId,
                    reason: "source event is missing or is not an assert",
                  }),
                );
              }
              const tx = yield* reader.table("transactions").get(source.txId);
              return {
                eventId,
                ...(source.factId === undefined
                  ? {}
                  : { factId: source.factId as string }),
                e: source.e,
                a: source.a,
                v: source.v,
                assertedAt: source.txTime,
                actor: tx.actorId,
                ...(tx.reason === undefined ? {} : { reason: tx.reason }),
                txTime: tx.txTime,
              };
            }),
          );

          return {
            e: row.e,
            a: row.a,
            v: row.v,
            derivedAt: row.derivedAt,
            because,
          } satisfies DerivedExplanation;
        }),
      );

      return out;
    }).pipe(Effect.mapError(typedExplanationError)),
);

export const metacrdt = GroupImpl.make(api, "metacrdt").pipe(
  Layer.provide(verifyEvents),
  Layer.provide(explainDerived),
);
