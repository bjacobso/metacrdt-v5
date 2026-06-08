import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import { summarizeProtocolEvent } from "@metacrdt/convex";

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
