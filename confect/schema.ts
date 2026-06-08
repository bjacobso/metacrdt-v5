import { DatabaseSchema } from "@confect/server";

import { FactEvents } from "./tables/FactEvents";
import { Transactions } from "./tables/Transactions";

export default DatabaseSchema.make()
  .addTable(Transactions)
  .addTable(FactEvents);
