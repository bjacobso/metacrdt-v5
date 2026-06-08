/**
 * DSL handler framework: elaborator protocol, slots, compilation.
 *
 * @module Elaboration
 */

// Types
export type {
  SlotMode,
  SlotDefinition,
  EvaluatedSlot,
  DSLHandler,
  CompletionPosition,
  Completion,
  HoverPosition,
  HoverInfo,
} from "./elaboration/types.js";

export { EvaluatedSlots } from "./elaboration/types.js";

// Context
export { CompileContext, CompileError, createCompileContext } from "./elaboration/context.js";
export type { CompileOptions } from "./elaboration/context.js";

// Registry
export { DSLRegistry, emptyRegistry } from "./elaboration/registry.js";

// Slots
export { evaluateSlot, evaluateSlots, getSlotType } from "./elaboration/slots.js";

// Compilation
export {
  compile,
  compileExprs,
  compileExpr,
  compileSimple,
  compileWithTypecheck,
  isDSLOnly,
} from "./elaboration/compile.js";

export type {
  CompileResult,
  CompileResultItem,
  TypeCheckedCompileResult,
} from "./elaboration/compile.js";
