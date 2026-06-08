import type { BuiltinFn } from "../evaluator/types.js";
import { arithmeticBuiltins } from "./arithmetic.js";
import { comparisonBuiltins } from "./comparison.js";
import { stringBuiltins } from "./strings.js";
import { collectionBuiltins } from "./collections.js";
import { dataBuiltins } from "./data.js";
import { typecheckBuiltins } from "./typecheck.js";
import { controlBuiltins } from "./control.js";
import { macroBuiltins } from "./macro.js";
import { meta } from "./meta.js";
import { schemaBuiltins } from "./schema.js";

export const defaultBuiltins: Record<string, BuiltinFn> = {
  ...arithmeticBuiltins,
  ...comparisonBuiltins,
  ...stringBuiltins,
  ...collectionBuiltins,
  ...dataBuiltins,
  ...typecheckBuiltins,
  ...controlBuiltins,
  ...macroBuiltins,
  ...schemaBuiltins,
  meta,
};
