import { FunctionSpec, GroupSpec } from "@confect/core";
import { Schema } from "effect";

import { FactEventKind, Hlc } from "./tables/FactEvents";

export class UnknownEntity extends Schema.TaggedError<UnknownEntity>()(
  "UnknownEntity",
  { e: Schema.String },
) {}

export class InvalidProtocolEvent extends Schema.TaggedError<InvalidProtocolEvent>()(
  "InvalidProtocolEvent",
  {
    eventId: Schema.String,
    reason: Schema.String,
  },
) {}

export const ProtocolEventSummary = Schema.Struct({
  eventId: Schema.optionalWith(Schema.String, { exact: true }),
  kind: FactEventKind,
  e: Schema.String,
  a: Schema.String,
  v: Schema.Any,
  txTime: Schema.Number,
  actor: Schema.String,
  actorType: Schema.Literal("human", "system", "agent", "migration"),
  validFrom: Schema.optionalWith(Schema.Number, { exact: true }),
  validTo: Schema.optionalWith(Schema.Number, { exact: true }),
  hlc: Schema.optionalWith(Hlc, { exact: true }),
  targetEventId: Schema.optionalWith(Schema.String, { exact: true }),
  causalRefs: Schema.Array(Schema.String),
  hasProtocolMetadata: Schema.Boolean,
  verifiable: Schema.Boolean,
  validEventId: Schema.Boolean,
  reason: Schema.optionalWith(Schema.String, { exact: true }),
});

export const metacrdt = GroupSpec.make("metacrdt").addFunction(
  FunctionSpec.publicQuery({
    name: "verifyEvents",
    args: Schema.Struct({
      e: Schema.String,
      a: Schema.optionalWith(Schema.String, { exact: true }),
      limit: Schema.optionalWith(Schema.Number, { exact: true }),
      requireValid: Schema.optionalWith(Schema.Boolean, { exact: true }),
    }),
    returns: Schema.Array(ProtocolEventSummary),
    error: Schema.Union(UnknownEntity, InvalidProtocolEvent),
  }),
);
