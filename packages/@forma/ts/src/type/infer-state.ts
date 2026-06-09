/**
 * Module-level mutable state shared across inference modules.
 *
 * These maps are set during inferProgram() and read by various infer* functions.
 * Using getter/setter access avoids circular dependency issues.
 */
import type { Scheme } from "./types.js";
import type { DSLTypeProvider } from "./dsl-provider.js";
import type { SExpr } from "../reader/index.js";

// ---------------------------------------------------------------------------
// DSL provider state
// ---------------------------------------------------------------------------

let _inferDslProvider: DSLTypeProvider | undefined;
let _inferRawExprs: readonly SExpr[] | undefined;

export function getInferDslProvider(): DSLTypeProvider | undefined {
  return _inferDslProvider;
}
export function setInferDslProvider(p: DSLTypeProvider | undefined): void {
  _inferDslProvider = p;
}

export function getInferRawExprs(): readonly SExpr[] | undefined {
  return _inferRawExprs;
}
export function setInferRawExprs(e: readonly SExpr[] | undefined): void {
  _inferRawExprs = e;
}

// ---------------------------------------------------------------------------
// ADT constructor schemes (registered by inferTypeDef, consumed by inferProgram)
// ---------------------------------------------------------------------------

const _adtConstructorSchemes = new Map<string, Scheme>();

export function getAdtConstructorSchemes(): Map<string, Scheme> {
  return _adtConstructorSchemes;
}

// ---------------------------------------------------------------------------
// Class method schemes (registered by inferDefClass, consumed by inferProgram)
// ---------------------------------------------------------------------------

const _classMethodSchemes = new Map<string, Scheme>();

export function getClassMethodSchemes(): Map<string, Scheme> {
  return _classMethodSchemes;
}

// ---------------------------------------------------------------------------
// Service method schemes (registered by inferDefService, consumed by inferProgram)
// ---------------------------------------------------------------------------

const _serviceMethodSchemes = new Map<string, Scheme>();

export function getServiceMethodSchemes(): Map<string, Scheme> {
  return _serviceMethodSchemes;
}
