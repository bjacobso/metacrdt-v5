import { GenericId } from "@confect/core";
import { Table } from "@confect/server";
import { Schema } from "effect";

export const TenantId = GenericId.GenericId("tenants");

export const Tenants = Table.make(
  "tenants",
  Schema.Struct({
    slug: Schema.String,
    name: Schema.String,
    kind: Schema.optionalWith(
      Schema.Literal("staffing", "legal", "custom"),
      { exact: true },
    ),
    createdAt: Schema.Number,
    updatedAt: Schema.Number,
  }),
).index("by_slug", ["slug"]);
