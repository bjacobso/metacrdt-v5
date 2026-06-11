import { Table } from "@confect/server";
import { Schema } from "effect";

const Emit = Schema.Struct({
  e: Schema.String,
  a: Schema.String,
  v: Schema.Any,
});

const Closure = Schema.Struct({
  baseAttribute: Schema.String,
  closureAttribute: Schema.String,
  maxDepth: Schema.Number,
  reflexive: Schema.optionalWith(Schema.Boolean, { exact: true }),
});

export const Rules = Table.make(
  "rules",
  Schema.Struct({
    name: Schema.String,
    kind: Schema.optionalWith(Schema.Literal("datalog", "closure"), {
      exact: true,
    }),
    where: Schema.optionalWith(Schema.Array(Schema.Any), { exact: true }),
    emit: Schema.optionalWith(Emit, { exact: true }),
    closure: Schema.optionalWith(Closure, { exact: true }),
    enabled: Schema.Boolean,
    materialization: Schema.Literal("sync", "async", "manual"),
    dependsOnAttributes: Schema.Array(Schema.String),
    createdAt: Schema.Number,
    updatedAt: Schema.Number,
  }),
)
  .index("by_name", ["name"])
  .index("by_enabled", ["enabled"]);

