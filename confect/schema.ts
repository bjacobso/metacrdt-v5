import { DatabaseSchema } from "@confect/server";

import { CurrentFacts } from "./tables/CurrentFacts";
import { DerivedFacts } from "./tables/DerivedFacts";
import { FactEvents } from "./tables/FactEvents";
import { Rules } from "./tables/Rules";
import { Transactions } from "./tables/Transactions";

export default DatabaseSchema.make()
  .addTable(Transactions)
  .addTable(FactEvents)
  .addTable(DerivedFacts)
  .addTable(CurrentFacts)
  .addTable(Rules);
