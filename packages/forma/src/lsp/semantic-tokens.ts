/**
 * Semantic Tokens for LSP
 *
 * Generates semantic tokens for syntax highlighting based on form semantics.
 * Walks the parsed tree, matches forms, and classifies each node by its
 * semantic meaning (keyword, variable, type, etc.).
 *
 * @module
 */

import { Effect } from "effect";
import { parse, type RedNode, type RedElement, isRedNode, isRedToken } from "../reader/index.js";
import type { DSLType, SemanticKind } from "../form/core.js";
import type { Form, FormRegistry } from "../form/form.js";
import { getContentChildren, getNodeText, getNodeLoc } from "../form/pattern.js";

// =============================================================================
// Token Types and Modifiers
// =============================================================================

/**
 * LSP semantic token types (order matters - index is used in encoding)
 */
export const TOKEN_TYPES: readonly SemanticKind[] = [
  "keyword",
  "variable",
  "type",
  "property",
  "function",
  "operator",
  "string",
  "number",
  "comment",
  "parameter",
  "enum",
  "enumMember",
] as const;

/**
 * LSP semantic token modifiers (bit flags)
 */
export const TOKEN_MODIFIERS = ["definition", "declaration", "readonly", "deprecated"] as const;

/**
 * A single semantic token before encoding
 */
export interface SemanticToken {
  /** Absolute byte offset in source */
  readonly offset: number;
  /** Length in bytes */
  readonly length: number;
  /** Token type (index into TOKEN_TYPES) */
  readonly tokenType: number;
  /** Token modifiers (bit flags) */
  readonly tokenModifiers: number;
}

/**
 * Result of semantic token generation
 */
export interface SemanticTokensResult {
  /** Encoded token data in LSP format (delta-encoded) */
  readonly data: readonly number[];
  /** Raw tokens before encoding (for debugging) */
  readonly tokens: readonly SemanticToken[];
}

// =============================================================================
// Token Generation
// =============================================================================

/**
 * Generate semantic tokens for a source string.
 *
 * @param source - The source code to analyze
 * @param registry - Form registry to look up forms
 * @returns Encoded semantic tokens in LSP format
 */
// Module-scoped source for multiline token splitting in addToken
let _currentSource: string | undefined;

export function generateSemanticTokens<T extends DSLType>(
  source: string,
  registry: FormRegistry<T>,
): Effect.Effect<SemanticTokensResult, never> {
  return Effect.gen(function* () {
    _currentSource = source;
    // Parse the source
    const parseResult = parse(source);
    const tokens: SemanticToken[] = [];

    // Add comment tokens from trivia
    collectCommentTokens(parseResult.redTree, tokens);

    // Walk all top-level forms
    const topLevel = getContentChildren(parseResult.redTree).filter(isRedNode);
    for (const node of topLevel) {
      collectFormTokens(node, registry, tokens);
    }

    // Sort by offset
    tokens.sort((a, b) => a.offset - b.offset);

    // Encode to LSP delta format
    const data = encodeTokens(tokens, source);

    return { data, tokens };
  });
}

/**
 * Collect comment tokens from trivia in the tree
 */
function collectCommentTokens(node: RedElement, tokens: SemanticToken[]): void {
  if (isRedToken(node)) {
    // Check leading trivia for comments
    for (const trivia of node.leadingTrivia()) {
      if (trivia.kind === "line-comment") {
        tokens.push({
          offset: trivia.loc.start,
          length: trivia.loc.end - trivia.loc.start,
          tokenType: TOKEN_TYPES.indexOf("comment"),
          tokenModifiers: 0,
        });
      }
    }
  } else if (isRedNode(node)) {
    // Recurse into children
    for (const child of node.children()) {
      collectCommentTokens(child, tokens);
    }
  }
}

/**
 * Collect tokens from a form node
 */
function collectFormTokens<T extends DSLType>(
  node: RedNode,
  registry: FormRegistry<T>,
  tokens: SemanticToken[],
): void {
  const kind = node.kind();
  if (kind === "Vector" || kind === "Map" || kind === "Set") {
    // Recurse into container children to find nested forms
    const containerChildren = getContentChildren(node).filter(isRedNode);
    for (const child of containerChildren) {
      collectFormTokens(child, registry, tokens);
    }
    return;
  }
  if (kind !== "List") {
    // Atom - classify as literal
    classifyLiteral(node, tokens);
    return;
  }

  const children = getContentChildren(node).filter(isRedNode);
  if (children.length === 0) return;

  const headNode = children[0]!;
  const headText = getNodeText(headNode);
  const form = registry.get(headText);

  if (form) {
    // Known form - use semantic classification
    classifyForm(node, form, children, registry, tokens);
  } else {
    // Unknown form - classify head as function, recurse on args
    addToken(headNode, "function", tokens);
    for (let i = 1; i < children.length; i++) {
      collectFormTokens(children[i]!, registry, tokens);
    }
  }
}

/**
 * Classify a form using its semantic hints
 */
function classifyForm<T extends DSLType>(
  _node: RedNode,
  form: Form<T, unknown, unknown>,
  children: readonly RedNode[],
  registry: FormRegistry<T>,
  tokens: SemanticToken[],
): void {
  const semantic = form.semantic;
  const headNode = children[0]!;

  // Classify the head
  const headKind = semantic?.head ?? "keyword";
  addToken(headNode, headKind, tokens);

  // Get argument names from pattern (if available)
  const argNames = getPatternArgNames(form);

  // Classify each argument
  for (let i = 1; i < children.length; i++) {
    const argNode = children[i]!;
    const argName = argNames[i - 1]; // -1 because first child is head

    // Check if we have a semantic hint for this argument
    const argKind = argName && semantic?.args?.[argName];

    if (argKind) {
      // Use the specified semantic kind
      if (argNode.kind() === "List") {
        // Nested form - check if it's a known form first
        const nestedChildren = getContentChildren(argNode).filter(isRedNode);
        if (nestedChildren.length > 0) {
          const nestedHead = getNodeText(nestedChildren[0]!);
          const nestedForm = registry.get(nestedHead);
          if (nestedForm) {
            // Recurse with the nested form's classification
            collectFormTokens(argNode, registry, tokens);
          } else {
            // Not a known form, classify the whole thing
            addToken(argNode, argKind, tokens);
          }
        }
      } else {
        // Simple token - classify directly
        addToken(argNode, argKind, tokens);
      }
    } else {
      // No hint - recurse to find nested forms
      collectFormTokens(argNode, registry, tokens);
    }
  }
}

/**
 * Classify a literal node (not a list)
 */
function classifyLiteral(node: RedNode, tokens: SemanticToken[]): void {
  const kind = node.kind();

  switch (kind) {
    case "String":
      addToken(node, "string", tokens);
      break;
    case "Number":
      addToken(node, "number", tokens);
      break;
    case "Boolean":
      addToken(node, "keyword", tokens);
      break;
    case "Symbol": {
      // Symbols starting with : are properties/keywords
      const text = getNodeText(node);
      if (text.startsWith(":")) {
        addToken(node, "property", tokens);
      }
      // Other symbols are left unclassified (could be variables)
      break;
    }
  }
}

/**
 * Add a token to the collection.
 *
 * If the node spans multiple lines (e.g., a triple-quoted string), it is
 * split into per-line tokens since LSP semantic tokens are single-line entries.
 */
function addToken(node: RedNode, kind: SemanticKind, tokens: SemanticToken[]): void {
  const loc = getNodeLoc(node);
  const typeIndex = TOKEN_TYPES.indexOf(kind);
  if (typeIndex === -1) return;

  const start = loc.start;
  const end = loc.end;

  // Split multiline tokens into per-line entries (LSP requires single-line tokens)
  if (_currentSource) {
    const text = _currentSource.slice(start, end);
    if (text.includes("\n")) {
      // Split into per-line tokens
      let lineStart = start;
      for (let i = 0; i < text.length; i++) {
        if (text[i] === "\n") {
          const lineLen = start + i - lineStart;
          if (lineLen > 0) {
            tokens.push({
              offset: lineStart,
              length: lineLen,
              tokenType: typeIndex,
              tokenModifiers: 0,
            });
          }
          lineStart = start + i + 1;
        }
      }
      // Last line (after final newline or if no trailing newline)
      const remaining = end - lineStart;
      if (remaining > 0) {
        tokens.push({
          offset: lineStart,
          length: remaining,
          tokenType: typeIndex,
          tokenModifiers: 0,
        });
      }
      return;
    }
  }

  tokens.push({
    offset: start,
    length: end - start,
    tokenType: typeIndex,
    tokenModifiers: 0,
  });
}

/**
 * Get argument names from a form's pattern (best effort)
 */
function getPatternArgNames<T extends DSLType>(form: Form<T, unknown, unknown>): string[] {
  const meta = form.pattern.meta;
  if (meta?.type === "list" && "argNames" in meta && Array.isArray(meta.argNames)) {
    return meta.argNames as string[];
  }
  // Fallback: extract keys from meta.args if available
  if (meta?.type === "list" && meta.args) {
    return Object.keys(meta.args);
  }
  return [];
}

// =============================================================================
// Token Encoding
// =============================================================================

/**
 * Encode tokens to LSP delta format.
 *
 * LSP semantic tokens are encoded as a flat array of 5-tuples:
 * [deltaLine, deltaStartChar, length, tokenType, tokenModifiers]
 *
 * Each value is relative to the previous token.
 */
function encodeTokens(tokens: readonly SemanticToken[], source: string): number[] {
  const result: number[] = [];

  // Build line start offsets for efficient line/col lookup
  const lineStarts = buildLineStarts(source);

  let prevLine = 0;
  let prevChar = 0;

  for (const token of tokens) {
    const { line, col } = offsetToLineCol(token.offset, lineStarts);

    const deltaLine = line - prevLine;
    const deltaChar = deltaLine === 0 ? col - prevChar : col;

    result.push(deltaLine, deltaChar, token.length, token.tokenType, token.tokenModifiers);

    prevLine = line;
    prevChar = col;
  }

  return result;
}

/**
 * Build array of line start offsets
 */
function buildLineStarts(source: string): number[] {
  const starts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

/**
 * Convert byte offset to 0-indexed line and column
 */
function offsetToLineCol(offset: number, lineStarts: number[]): { line: number; col: number } {
  // Binary search for the line
  let low = 0;
  let high = lineStarts.length - 1;

  while (low < high) {
    const mid = Math.floor((low + high + 1) / 2);
    if (lineStarts[mid]! <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return {
    line: low,
    col: offset - lineStarts[low]!,
  };
}
