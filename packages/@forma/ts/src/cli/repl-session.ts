import { Effect } from "effect";
import * as Evaluator from "../Evaluator.js";
import * as Builtins from "../Builtins.js";
import * as Expander from "../Expander.js";
import * as Reader from "../Reader.js";
import type { Env } from "../Env.js";
import type { KernelError } from "../diagnostic/errors.js";
import type { ParseError } from "../reader/index.js";

export function createReplEnv(): Env {
  return Expander.getPreludeEnvSync(Builtins.defaultBuiltins);
}

export function evaluateReplLine(
  line: string,
  env: Env,
): Effect.Effect<Evaluator.KernelResult, KernelError | ParseError> {
  return Effect.flatMap(Reader.parseManyToSExpr(line), (exprs) =>
    Evaluator.evaluateCompileTimeExprs(exprs, {
      stepLimit: 50_000,
      builtins: Builtins.defaultBuiltins,
      env,
    }),
  );
}
