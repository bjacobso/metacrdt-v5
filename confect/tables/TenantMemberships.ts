import { Table } from "@confect/server";
import { Schema } from "effect";

import { TenantId } from "./Tenants";

export const TenantMemberships = Table.make(
  "tenantMemberships",
  Schema.Struct({
    tenantId: TenantId,
    principal: Schema.String,
    role: Schema.Literal("owner", "admin", "editor", "viewer"),
    createdAt: Schema.Number,
  }),
)
  .index("by_principal", ["principal"])
  .index("by_tenant_and_principal", ["tenantId", "principal"]);
