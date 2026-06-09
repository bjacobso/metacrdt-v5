/**
 * Green Tree - Immutable, content-addressable syntax tree
 *
 * The green tree stores the syntactic structure without parent pointers.
 * It uses width-based spans instead of absolute positions, making it
 * suitable for incremental reparsing and structural sharing.
 */

import type { Token } from "./lexer.js";
import type { Loc, Trivia } from "./types.js";

// =============================================================================
// Syntax Kinds
// =============================================================================

/**
 * Node kinds matching grammar rules
 */
export type SyntaxKind =
  | "Root" // Top-level, contains multiple forms
  | "List" // (...)
  | "Vector" // [...]
  | "Map" // {...}
  | "Set" // {a b c} — odd-element all-symbol braces
  | "Symbol"
  | "String"
  | "Number"
  | "Boolean"
  | "ReaderMacro" // `expr, ~expr, ~@expr
  | "Error"; // Error recovery node

// =============================================================================
// Green Tree Types
// =============================================================================

/**
 * A green tree element is either a node or a token
 */
export type GreenElement = GreenNode | GreenToken;

/**
 * A syntax node in the green tree (immutable)
 *
 * Nodes contain children and track their total width in bytes.
 * The width includes all trivia (whitespace/comments) of children.
 */
export interface GreenNode {
  readonly kind: SyntaxKind;
  readonly children: readonly GreenElement[];
  readonly width: number; // Total text width including all trivia
}

/**
 * A token in the green tree (immutable)
 *
 * Tokens store their text and leading trivia. The width is the
 * combined length of trivia + token text.
 */
export interface GreenToken {
  readonly kind: "token";
  readonly tokenType: Token["type"];
  readonly text: string;
  readonly leadingTrivia: readonly Trivia[];
  readonly width: number; // leadingTrivia width + text width
  readonly loc: Loc; // Original token location with line/col
}

// =============================================================================
// Constructors
// =============================================================================

/**
 * Create a green node from children
 */
export const GreenNode = (kind: SyntaxKind, children: readonly GreenElement[]): GreenNode => ({
  kind,
  children,
  width: children.reduce((sum, c) => sum + c.width, 0),
});

/**
 * Create a green token with trivia
 */
export const GreenToken = (
  tokenType: Token["type"],
  text: string,
  leadingTrivia: readonly Trivia[],
  loc: Loc,
): GreenToken => ({
  kind: "token",
  tokenType,
  text,
  leadingTrivia,
  width: leadingTrivia.reduce((sum, t) => sum + t.text.length, 0) + text.length,
  loc,
});

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a green element is a node
 */
export const isGreenNode = (element: GreenElement): element is GreenNode =>
  element.kind !== "token";

/**
 * Check if a green element is a token
 */
export const isGreenToken = (element: GreenElement): element is GreenToken =>
  element.kind === "token";
