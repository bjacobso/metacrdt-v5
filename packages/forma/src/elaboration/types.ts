/**
 * DSL Handler Interface
 *
 * DSL handlers extend the kernel with new forms like `entity-type`, `action`, etc.
 * Each handler defines:
 * - The form name it handles
 * - Slots (sub-expressions) and their evaluation modes
 * - A compile function that produces IR
 */

import type { Effect } from "effect";
import type { SExpr, Loc } from "../reader/index.js";
import type { Type, Scheme } from "../type/types.js";
import type { KValue } from "../evaluator/types.js";
import type { CompileContext, CompileError } from "./context.js";

// =============================================================================
// Slot Modes
// =============================================================================

/**
 * How a slot should be processed.
 *
 * - immediate: Evaluate at compile time, value goes into IR
 * - deferred: Type-check at compile time, preserve AST for runtime evaluation
 * - quoted: Do not evaluate, pass AST through as-is
 * - pattern: Use pattern matching, no evaluation
 */
export type SlotMode = "immediate" | "deferred" | "quoted" | "pattern";

// =============================================================================
// Slot Definition
// =============================================================================

/**
 * Defines how a slot should be processed.
 */
export interface SlotDefinition {
  /** Slot name (for error messages and lookup) */
  readonly name: string;

  /** How to evaluate this slot */
  readonly mode: SlotMode;

  /** Expected type (for type checking) */
  readonly type?: Type;

  /** Whether this slot is required */
  readonly required?: boolean;

  /** Description for documentation and error messages */
  readonly description?: string;
}

// =============================================================================
// Evaluated Slots
// =============================================================================

/**
 * Evaluated slot value based on mode.
 */
export type EvaluatedSlot =
  | { readonly mode: "immediate"; readonly value: KValue }
  | { readonly mode: "deferred"; readonly ast: SExpr; readonly type: Type }
  | { readonly mode: "quoted"; readonly ast: SExpr }
  | { readonly mode: "pattern"; readonly ast: SExpr };

/**
 * Container for evaluated slots.
 */
export class EvaluatedSlots {
  private slots = new Map<string, EvaluatedSlot>();

  set(name: string, slot: EvaluatedSlot): void {
    this.slots.set(name, slot);
  }

  get(name: string): EvaluatedSlot | undefined {
    return this.slots.get(name);
  }

  has(name: string): boolean {
    return this.slots.has(name);
  }

  /**
   * Get an immediate slot value, or undefined if not present or wrong mode.
   */
  getImmediate(name: string): KValue | undefined {
    const slot = this.slots.get(name);
    if (slot?.mode === "immediate") {
      return slot.value;
    }
    return undefined;
  }

  /**
   * Get a deferred slot AST and type, or undefined if not present or wrong mode.
   */
  getDeferred(name: string): { ast: SExpr; type: Type } | undefined {
    const slot = this.slots.get(name);
    if (slot?.mode === "deferred") {
      return { ast: slot.ast, type: slot.type };
    }
    return undefined;
  }

  /**
   * Get a quoted slot AST, or undefined if not present or wrong mode.
   */
  getQuoted(name: string): SExpr | undefined {
    const slot = this.slots.get(name);
    if (slot?.mode === "quoted") {
      return slot.ast;
    }
    return undefined;
  }

  /**
   * Get a pattern slot AST, or undefined if not present or wrong mode.
   */
  getPattern(name: string): SExpr | undefined {
    const slot = this.slots.get(name);
    if (slot?.mode === "pattern") {
      return slot.ast;
    }
    return undefined;
  }

  /**
   * Get all slot names.
   */
  names(): IterableIterator<string> {
    return this.slots.keys();
  }
}

// =============================================================================
// DSL Handler
// =============================================================================

/**
 * A DSL handler extends the kernel with a new form.
 */
export interface DSLHandler<IR = unknown> {
  /** The form name this handler processes (e.g., "entity-type") */
  readonly name: string;

  /** Slot definitions describing expected sub-expressions */
  readonly slots: readonly SlotDefinition[];

  /** Optional type signature for the form result */
  readonly resultType?: Type;

  /** Description for documentation */
  readonly description?: string;

  /**
   * Compile the form to IR.
   * Receives the parsed SExpr, compilation context, and evaluated slots.
   */
  compile(expr: SExpr, ctx: CompileContext, slots: EvaluatedSlots): Effect.Effect<IR, CompileError>;

  /**
   * Optional hook to extract slots from the form.
   * If not provided, uses default extraction based on slot definitions.
   */
  extractSlots?(expr: SExpr, ctx: CompileContext): Effect.Effect<EvaluatedSlots, CompileError>;

  /**
   * Optional type-side slot extraction for HM/LSP.
   */
  extractTypedSlots?(rawExpr: SExpr): readonly {
    slotName: string;
    expr: SExpr;
    expectedType?: Type;
  }[];

  /**
   * Optional type binding extraction for HM/LSP.
   */
  getTypeBindings?(rawExpr: SExpr): ReadonlyMap<string, Scheme>;

  /**
   * Optional dynamic result type extraction for HM/LSP.
   */
  getResultTypeForExpr?(rawExpr: SExpr): Type | undefined;

  /**
   * Optional completions for LSP integration.
   */
  completions?(position: CompletionPosition): Completion[];

  /**
   * Optional hover info for LSP integration.
   */
  hover?(position: HoverPosition): HoverInfo | null;
}

// =============================================================================
// LSP Types (for future integration)
// =============================================================================

export interface CompletionPosition {
  readonly expr: SExpr;
  readonly offset: number;
  readonly ctx: CompileContext;
}

export interface Completion {
  readonly label: string;
  readonly kind: "keyword" | "type" | "function" | "variable" | "snippet";
  readonly detail?: string;
  readonly insertText?: string;
  readonly documentation?: string;
}

export interface HoverPosition {
  readonly expr: SExpr;
  readonly offset: number;
  readonly ctx: CompileContext;
}

export interface HoverInfo {
  readonly content: string;
  readonly range?: { start: Loc; end: Loc };
}
