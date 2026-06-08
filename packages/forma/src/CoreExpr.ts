/**
 * Typed core expression AST — output of the lowering phase.
 *
 * @module CoreExpr
 */

export type {
  CoreExpr,
  CLit,
  CVar,
  CLam,
  CApp,
  CLet,
  CIf,
  CRecord,
  CGet,
  CDef,
  CDSLForm,
  CTypeDef,
  CMatch,
  DSLFormChild,
  Span,
  MatchArm,
  Pattern,
  ADTConstructor,
  CDefClass,
  CInstance,
  ClassTypeParam,
  ClassConstraint,
  ClassMethod,
  InstanceMethod,
} from "./type/core-expr.js";

export { lower, lowerProgram } from "./type/lower.js";
export { resetNodeIds, exprChildren } from "./type/core-expr.js";
