/**
 * Algorithm W over CoreExpr using the InferContext Effect service.
 *
 * This file re-exports from the decomposed inference modules.
 */
export { inferExpr } from "./infer-core.js";
export { inferProgram, inferProgramAll } from "./infer-program.js";
