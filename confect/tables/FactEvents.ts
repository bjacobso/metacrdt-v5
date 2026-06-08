import { GenericId } from "@confect/core";
import { Table } from "@confect/server";
import { Schema } from "effect";

import { TransactionId } from "./Transactions";

export const Hlc = Schema.Struct({
  pt: Schema.Number,
  l: Schema.Number,
  r: Schema.String,
});

export const FactEventKind = Schema.Literal(
  "assert",
  "retract",
  "tombstone",
  "untombstone",
  "correction",
);

export const FactEvents = Table.make(
  "factEvents",
  Schema.Struct({
    txId: TransactionId,
    txTime: Schema.Number,
    eventId: Schema.optionalWith(Schema.String, { exact: true }),
    hlc: Schema.optionalWith(Hlc, { exact: true }),
    replicaId: Schema.optionalWith(Schema.String, { exact: true }),
    seq: Schema.optionalWith(Schema.Number, { exact: true }),
    targetEventId: Schema.optionalWith(Schema.String, { exact: true }),
    causalRefs: Schema.optionalWith(Schema.Array(Schema.String), {
      exact: true,
    }),
    kind: FactEventKind,
    factId: Schema.optionalWith(GenericId.GenericId("facts"), { exact: true }),
    e: Schema.String,
    a: Schema.String,
    v: Schema.Any,
    validFrom: Schema.optionalWith(Schema.Number, { exact: true }),
    validTo: Schema.optionalWith(Schema.Number, { exact: true }),
    reason: Schema.optionalWith(Schema.String, { exact: true }),
    metadata: Schema.optionalWith(Schema.Any, { exact: true }),
  }),
)
  .index("by_tx", ["txId"])
  .index("by_eventId", ["eventId"])
  .index("by_e", ["e"])
  .index("by_e_a_tx", ["e", "a", "txTime"])
  .index("by_a_tx", ["a", "txTime"]);
