/**
 * Core S-expression AST types used throughout the compilation pipeline.
 *
 * @module SExpr
 */

// Types and constructors
export type { SExpr, Loc, Span, Trivia, TriviaKind } from "./reader/types.js";
export {
  List,
  Vector,
  SMap,
  SSet,
  Sym,
  Str,
  Num,
  Bool,
  ErrorNode,
  ParseError,
} from "./reader/types.js";

// Structural combinators
export { children, headSym, tail } from "./reader/types.js";

// Domain-specific extractors
export { asSym, asVector, asStr, asNum, asList, trySym, bindingPairs } from "./reader/types.js";
