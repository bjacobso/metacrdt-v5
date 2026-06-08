import { GenericId } from "@confect/core";
import { Table } from "@confect/server";
import { Schema } from "effect";

export const DerivedFacts = Table.make(
  "derivedFacts",
  Schema.Struct({
    ruleId: GenericId.GenericId("rules"),
    e: Schema.String,
    a: Schema.String,
    v: Schema.Any,
    sourceFactIds: Schema.Array(GenericId.GenericId("facts")),
    sourceEventIds: Schema.optionalWith(Schema.Array(Schema.String), {
      exact: true,
    }),
    derivedAt: Schema.Number,
    validFrom: Schema.Number,
    validTo: Schema.optionalWith(Schema.Number, { exact: true }),
    txWatermark: Schema.Number,
    stale: Schema.Boolean,
    supportCount: Schema.optionalWith(Schema.Number, { exact: true }),
  }),
)
  .index("by_rule", ["ruleId"])
  .index("by_e", ["e"])
  .index("by_e_a", ["e", "a"])
  .index("by_a", ["a"])
  .index("by_a_v", ["a", "v"]);
