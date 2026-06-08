import { GenericId } from "@confect/core";
import { Table } from "@confect/server";
import { Schema } from "effect";

export const ActorType = Schema.Literal(
  "user",
  "system",
  "agent",
  "migration",
);

export const Transactions = Table.make(
  "transactions",
  Schema.Struct({
    actorId: Schema.String,
    actorType: ActorType,
    reason: Schema.optionalWith(Schema.String, { exact: true }),
    source: Schema.optionalWith(Schema.String, { exact: true }),
    txTime: Schema.Number,
    requestId: Schema.optionalWith(Schema.String, { exact: true }),
    workflowId: Schema.optionalWith(Schema.String, { exact: true }),
    branchId: Schema.optionalWith(Schema.String, { exact: true }),
    metadata: Schema.optionalWith(Schema.Any, { exact: true }),
  }),
)
  .index("by_txTime", ["txTime"])
  .index("by_actor", ["actorId", "txTime"]);

export const TransactionId = GenericId.GenericId("transactions");
