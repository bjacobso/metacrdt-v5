import { DatabaseSchema } from "@confect/server";

import { DerivedFacts } from "./tables/DerivedFacts";
import { FactEvents } from "./tables/FactEvents";
import { Rules } from "./tables/Rules";
import { TenantMemberships } from "./tables/TenantMemberships";
import { Tenants } from "./tables/Tenants";
import { Transactions } from "./tables/Transactions";

export default DatabaseSchema.make()
  .addTable(Tenants)
  .addTable(TenantMemberships)
  .addTable(Transactions)
  .addTable(FactEvents)
  .addTable(DerivedFacts)
  .addTable(Rules);
