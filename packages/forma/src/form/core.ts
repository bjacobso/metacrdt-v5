/**
 * Core Abstractions for the Unified DSL Framework
 *
 * This module defines the fundamental types that all DSLs built on this
 * framework share: types, contexts, and errors.
 *
 * @module
 */

import type { Loc } from "../reader/index.js";

// =============================================================================
// DSL Type System
// =============================================================================

/**
 * Base interface for DSL types.
 *
 * Every DSL defines its own type system by extending this interface.
 * The `kind` discriminant enables exhaustive pattern matching.
 *
 * @example
 * ```typescript
 * type MyType =
 *   | { kind: "string" }
 *   | { kind: "number" }
 *   | { kind: "list"; element: MyType }
 * ```
 */
export interface DSLType {
  readonly kind: string;
}

// =============================================================================
// Context
// =============================================================================

/**
 * Immutable context that flows through form evaluation.
 *
 * The context tracks:
 * - Variable bindings (name → type)
 * - Custom DSL-specific data
 *
 * Context is immutable - extending it returns a new context.
 *
 * @typeParam T - The DSL's type system
 */
export interface Ctx<T extends DSLType> {
  /** Variable → Type bindings */
  readonly bindings: ReadonlyMap<string, T>;

  /** Look up a binding by name */
  lookup(name: string): T | undefined;

  /** Create a new context with an additional binding */
  extend(name: string, type: T): Ctx<T>;

  /** Get all available bindings (for completions) */
  available(): readonly { name: string; type: T }[];

  /** Custom DSL-specific data store */
  readonly data: ReadonlyMap<string, unknown>;

  /** Create a new context with additional data */
  withData<V>(key: string, value: V): Ctx<T>;

  /** Get custom data by key */
  getData<V>(key: string): V | undefined;
}

/**
 * Create an empty context
 */
export function emptyCtx<T extends DSLType>(): Ctx<T> {
  return createCtx(new Map(), new Map());
}

/**
 * Create a context with initial bindings
 */
export function createCtx<T extends DSLType>(
  bindings: ReadonlyMap<string, T>,
  data: ReadonlyMap<string, unknown> = new Map(),
): Ctx<T> {
  return {
    bindings,
    data,

    lookup(name: string): T | undefined {
      return bindings.get(name);
    },

    extend(name: string, type: T): Ctx<T> {
      const newBindings = new Map(bindings);
      newBindings.set(name, type);
      return createCtx(newBindings, data);
    },

    available(): readonly { name: string; type: T }[] {
      return Array.from(bindings.entries()).map(([name, type]) => ({ name, type }));
    },

    withData<V>(key: string, value: V): Ctx<T> {
      const newData = new Map(data);
      newData.set(key, value);
      return createCtx(bindings, newData);
    },

    getData<V>(key: string): V | undefined {
      return data.get(key) as V | undefined;
    },
  };
}

// =============================================================================
// Errors
// =============================================================================

/**
 * Origin info for errors in macro-expanded code.
 */
export interface MacroOrigin {
  readonly macroName: string;
  readonly loc: Loc;
}

/**
 * DSL error with source location and optional suggestions.
 *
 * Errors carry enough information for:
 * - CLI error messages with source context
 * - LSP diagnostics with code actions
 * - IDE quick fixes
 */
export class DSLError extends Error {
  readonly _tag = "DSLError";

  constructor(
    message: string,
    readonly loc: Loc,
    readonly suggestions?: readonly string[],
    readonly macroOrigin?: MacroOrigin,
  ) {
    const suffix = macroOrigin
      ? ` (in expansion of macro '${macroOrigin.macroName}' at line ${macroOrigin.loc.line}, col ${macroOrigin.loc.col})`
      : "";
    super(`${message} at line ${loc.line}, column ${loc.col}${suffix}`);
    this.name = "DSLError";
  }
}

// =============================================================================
// Semantic Token Types
// =============================================================================

/**
 * Semantic token kinds for syntax highlighting.
 *
 * These map to LSP SemanticTokenTypes and are used to classify
 * tokens based on their semantic meaning (not just syntax).
 */
export type SemanticKind =
  | "keyword" // Form heads: query, from, where, object, field
  | "variable" // Bound variables: e, c, emp
  | "type" // Type names: Employee, Company, String, Number
  | "property" // Field/attribute names: name, email, status
  | "function" // Aggregates and functions: count, sum, avg
  | "operator" // Comparison/logical operators: =, <, >=, and, or
  | "string" // String literals
  | "number" // Number literals
  | "comment" // Comments (from trivia)
  | "parameter" // Function parameters
  | "enum" // Enum values
  | "enumMember"; // Enum members

/**
 * Semantic token modifiers for additional styling.
 */
export type SemanticModifier =
  | "definition" // Where a symbol is defined
  | "declaration" // Where a symbol is declared
  | "readonly" // Immutable binding
  | "deprecated"; // Deprecated symbol

/**
 * Semantic classification for a form or argument.
 */
export interface SemanticClassification {
  /** The semantic kind for the form head */
  readonly head?: SemanticKind;

  /** Semantic kinds for named arguments (by argument name) */
  readonly args?: Readonly<Record<string, SemanticKind>>;
}

// =============================================================================
// LSP Types
// =============================================================================

/**
 * Completion item for LSP integration
 */
export interface Completion {
  /** The text to display */
  readonly label: string;

  /** The kind of completion */
  readonly kind: CompletionKind;

  /** Additional details to display */
  readonly detail?: string;

  /** Text to insert (if different from label) */
  readonly insertText?: string;

  /** Documentation for this completion */
  readonly documentation?: string;

  /** Whether insertText is a snippet (with $0, $1 placeholders) */
  readonly isSnippet?: boolean;
}

/**
 * Completion item kinds
 */
export type CompletionKind =
  | "variable"
  | "field"
  | "type"
  | "keyword"
  | "function"
  | "constant"
  | "property"
  | "form"
  | "snippet";

/**
 * Hover information for LSP integration
 */
export interface HoverInfo {
  /** The content to display (supports markdown) */
  readonly content: string;

  /** Optional range this hover applies to */
  readonly range?: { start: Loc; end: Loc };
}

/**
 * Diagnostic for LSP integration
 */
export interface Diagnostic {
  /** The range of the error */
  readonly range: { start: Loc; end: Loc };

  /** Severity level */
  readonly severity: "error" | "warning" | "info" | "hint";

  /** The error message */
  readonly message: string;

  /** Suggested fixes */
  readonly suggestions?: readonly string[];
}

// =============================================================================
// Position Information
// =============================================================================

/**
 * Position information for completions
 */
export interface CompletionPosition {
  /** Which argument index is the cursor in? (-1 for head position) */
  readonly argIndex: number;

  /** Character offset within the argument */
  readonly offset: number;

  /** The partial text typed so far */
  readonly partial: string;

  /** The source location of the cursor */
  readonly loc: Loc;
}

/**
 * Position information for hover
 */
export interface HoverPosition {
  /** Which argument is being hovered? (-1 for head position) */
  readonly argIndex: number;

  /** The source location being hovered */
  readonly loc: Loc;
}

// =============================================================================
// Type Utilities
// =============================================================================

/**
 * Get a human-readable name for a type
 */
export function typeName(type: DSLType): string {
  return type.kind;
}

/**
 * Levenshtein distance for suggestion ranking
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  const firstRow = matrix[0]!;
  for (let j = 0; j <= a.length; j++) {
    firstRow[j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    const row = matrix[i]!;
    const prevRow = matrix[i - 1]!;
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        row[j] = prevRow[j - 1]!;
      } else {
        row[j] = Math.min(
          prevRow[j - 1]! + 1, // substitution
          row[j - 1]! + 1, // insertion
          prevRow[j]! + 1, // deletion
        );
      }
    }
  }

  return matrix[b.length]![a.length]!;
}

/**
 * Sort suggestions by relevance to a query
 */
export function sortSuggestions(query: string, suggestions: readonly string[]): string[] {
  return [...suggestions].sort((a, b) => {
    const distA = levenshteinDistance(query.toLowerCase(), a.toLowerCase());
    const distB = levenshteinDistance(query.toLowerCase(), b.toLowerCase());
    return distA - distB;
  });
}

/**
 * Find the closest matches to a query from a list of options
 */
export function findClosestMatches(
  query: string,
  options: readonly string[],
  maxDistance: number = 3,
): string[] {
  return sortSuggestions(query, options).filter(
    (opt) => levenshteinDistance(query.toLowerCase(), opt.toLowerCase()) <= maxDistance,
  );
}
