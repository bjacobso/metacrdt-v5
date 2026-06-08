import { DatabaseSchema } from "@confect/server";

import { CurrentFacts } from "./tables/CurrentFacts";
import { FactEvents } from "./tables/FactEvents";
import { Rules } from "./tables/Rules";
import { Transactions } from "./tables/Transactions";

export default DatabaseSchema.make()
  .addTable(Transactions)
  .addTable(FactEvents)
  .addTable(CurrentFacts)
  .addTable(Rules);
