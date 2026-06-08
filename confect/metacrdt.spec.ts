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

export class UnknownDerivedFact extends Schema.TaggedError<UnknownDerivedFact>()(
  "UnknownDerivedFact",
  {
    e: Schema.String,
    a: Schema.optionalWith(Schema.String, { exact: true }),
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

export const DerivedBecause = Schema.Struct({
  eventId: Schema.optionalWith(Schema.String, { exact: true }),
  factId: Schema.optionalWith(Schema.String, { exact: true }),
  e: Schema.String,
  a: Schema.String,
  v: Schema.Any,
  assertedAt: Schema.Number,
  actor: Schema.optionalWith(Schema.String, { exact: true }),
  reason: Schema.optionalWith(Schema.String, { exact: true }),
  txTime: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DerivedExplanation = Schema.Struct({
  e: Schema.String,
  a: Schema.String,
  v: Schema.Any,
  derivedAt: Schema.Number,
  because: Schema.Array(DerivedBecause),
});

export const metacrdt = GroupSpec.make("metacrdt")
  .addFunction(
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
  )
  .addFunction(
    FunctionSpec.publicQuery({
      name: "explainDerived",
      args: Schema.Struct({
        e: Schema.String,
        a: Schema.optionalWith(Schema.String, { exact: true }),
      }),
      returns: Schema.Array(DerivedExplanation),
      error: Schema.Union(UnknownDerivedFact, InvalidProtocolEvent),
    }),
  );
