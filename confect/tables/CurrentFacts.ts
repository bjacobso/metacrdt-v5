import { GenericId } from "@confect/core";
import { Table } from "@confect/server";
import { Schema } from "effect";

export const CurrentFacts = Table.make(
  "currentFacts",
  Schema.Struct({
    e: Schema.String,
    a: Schema.String,
    v: Schema.Any,
    factId: GenericId.GenericId("facts"),
    validFrom: Schema.Number,
    txTime: Schema.Number,
    updatedAt: Schema.Number,
  }),
)
  .index("by_e", ["e"])
  .index("by_e_a", ["e", "a"])
  .index("by_a", ["a"])
  .index("by_a_v", ["a", "v"])
  .index("by_e_a_v", ["e", "a", "v"]);

