/**
 * DSL Handler Framework
 *
 * Provides an extensible system for adding new forms to the kernel.
 * DSL handlers can define:
 * - Form name (e.g., "entity-type", "action")
 * - Slot definitions with evaluation modes
 * - Compilation to IR
 * - LSP features (completions, hover)
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
} from "./types.js";

export { EvaluatedSlots } from "./types.js";

// Context
export { CompileContext, CompileError, createCompileContext } from "./context.js";
export type { CompileOptions } from "./context.js";

// Registry
export { DSLRegistry, emptyRegistry } from "./registry.js";

// Slots
export { evaluateSlot, evaluateSlots, getSlotType } from "./slots.js";

// Compilation
export {
  compile,
  compileExprs,
  compileExpr,
  compileSimple,
  compileWithTypecheck,
  isDSLOnly,
} from "./compile.js";
export type { CompileResult, CompileResultItem, TypeCheckedCompileResult } from "./compile.js";
