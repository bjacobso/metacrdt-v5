/**
 * Red Tree - Navigable wrapper around the green tree
 *
 * The red tree provides parent pointers and absolute positions on top of
 * the immutable green tree. This enables LSP-style navigation like finding
 * nodes at positions, walking ancestors, etc.
 */

import {
  type GreenNode,
  type GreenToken,
  type GreenElement,
  type SyntaxKind,
  isGreenToken,
} from "./green-tree.js";
import type { Loc, Span, Trivia } from "./types.js";
import type { Token } from "./lexer.js";

// =============================================================================
// Red Tree Types
// =============================================================================

/**
 * A navigable syntax node (wraps green node)
 */
export interface RedNode {
  readonly green: GreenNode;
  readonly parent: RedNode | null;
  readonly offset: number; // Absolute byte offset in source

  // Identity
  kind(): SyntaxKind;
  isError(): boolean;

  // Children
  children(): readonly RedElement[];
  childCount(): number;
  child(index: number): RedElement | undefined;
  firstChild(): RedElement | undefined;
  lastChild(): RedElement | undefined;

  // Siblings
  nextSibling(): RedElement | undefined;
  prevSibling(): RedElement | undefined;
  indexInParent(): number;

  // Traversal
  descendants(): Iterable<RedElement>;
  ancestors(): Iterable<RedNode>;

  // Source spans
  span(): Span; // Excludes leading trivia
  fullSpan(): Span; // Includes leading trivia
  text(): string;
  fullText(): string;
}

/**
 * A navigable token (wraps green token)
 */
export interface RedToken {
  readonly green: GreenToken;
  readonly parent: RedNode;
  readonly offset: number;

  // Identity
  tokenType(): Token["type"];
  leadingTrivia(): readonly Trivia[];
  loc(): Loc; // Original token location with line/col

  // Source spans
  span(): Span;
  fullSpan(): Span;
  text(): string;
  fullText(): string;
}

/**
 * A red tree element is either a node or a token
 */
export type RedElement = RedNode | RedToken;

// =============================================================================
// Red Node Implementation
// =============================================================================

class RedNodeImpl implements RedNode {
  private readonly _indexInParent: number;
  private readonly _source: string;
  private _children: readonly RedElement[] | null = null;

  constructor(
    readonly green: GreenNode,
    readonly parent: RedNode | null,
    readonly offset: number,
    indexInParent: number,
    source: string,
  ) {
    this._indexInParent = indexInParent;
    this._source = source;
  }

  kind(): SyntaxKind {
    return this.green.kind;
  }

  isError(): boolean {
    return this.green.kind === "Error";
  }

  childCount(): number {
    return this.green.children.length;
  }

  children(): readonly RedElement[] {
    if (this._children === null) {
      const result: RedElement[] = [];
      let childOffset = this.offset;

      for (let i = 0; i < this.green.children.length; i++) {
        const child = this.green.children[i]!;
        result.push(this._wrapChild(child, childOffset, i));
        childOffset += child.width;
      }

      this._children = result;
    }
    return this._children;
  }

  child(index: number): RedElement | undefined {
    if (index < 0 || index >= this.green.children.length) return undefined;

    // Compute offset to the specific child
    let childOffset = this.offset;
    for (let i = 0; i < index; i++) {
      childOffset += this.green.children[i]!.width;
    }

    return this._wrapChild(this.green.children[index]!, childOffset, index);
  }

  firstChild(): RedElement | undefined {
    return this.child(0);
  }

  lastChild(): RedElement | undefined {
    return this.child(this.green.children.length - 1);
  }

  indexInParent(): number {
    return this._indexInParent;
  }

  nextSibling(): RedElement | undefined {
    if (!this.parent) return undefined;
    return this.parent.child(this._indexInParent + 1);
  }

  prevSibling(): RedElement | undefined {
    if (!this.parent) return undefined;
    return this.parent.child(this._indexInParent - 1);
  }

  *descendants(): Iterable<RedElement> {
    for (const child of this.children()) {
      yield child;
      if (isRedNode(child)) {
        yield* child.descendants();
      }
    }
  }

  *ancestors(): Iterable<RedNode> {
    let node: RedNode | null = this.parent;
    while (node) {
      yield node;
      node = node.parent;
    }
  }

  span(): Span {
    // Skip leading trivia of first child
    const firstChild = this.green.children[0];
    const triviaWidth =
      firstChild && isGreenToken(firstChild)
        ? firstChild.leadingTrivia.reduce((sum, t) => sum + t.text.length, 0)
        : 0;

    return {
      start: this.offset + triviaWidth,
      end: this.offset + this.green.width,
    };
  }

  fullSpan(): Span {
    return {
      start: this.offset,
      end: this.offset + this.green.width,
    };
  }

  text(): string {
    const { start, end } = this.span();
    return this._source.slice(start, end);
  }

  fullText(): string {
    const { start, end } = this.fullSpan();
    return this._source.slice(start, end);
  }

  private _wrapChild(child: GreenElement, childOffset: number, index: number): RedElement {
    if (isGreenToken(child)) {
      return new RedTokenImpl(child, this, childOffset, this._source);
    }
    return new RedNodeImpl(child as GreenNode, this, childOffset, index, this._source);
  }
}

// =============================================================================
// Red Token Implementation
// =============================================================================

class RedTokenImpl implements RedToken {
  private readonly _source: string;

  constructor(
    readonly green: GreenToken,
    readonly parent: RedNode,
    readonly offset: number,
    source: string,
  ) {
    this._source = source;
  }

  tokenType(): Token["type"] {
    return this.green.tokenType;
  }

  leadingTrivia(): readonly Trivia[] {
    return this.green.leadingTrivia;
  }

  loc(): Loc {
    return this.green.loc;
  }

  span(): Span {
    const triviaWidth = this.green.leadingTrivia.reduce((sum, t) => sum + t.text.length, 0);
    return {
      start: this.offset + triviaWidth,
      end: this.offset + this.green.width,
    };
  }

  fullSpan(): Span {
    return {
      start: this.offset,
      end: this.offset + this.green.width,
    };
  }

  text(): string {
    return this.green.text;
  }

  fullText(): string {
    const { start, end } = this.fullSpan();
    return this._source.slice(start, end);
  }
}

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if a red element is a node
 */
export function isRedNode(element: RedElement): element is RedNode {
  return "children" in element;
}

/**
 * Check if a red element is a token
 */
export function isRedToken(element: RedElement): element is RedToken {
  return "tokenType" in element;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Create a red tree from a green tree
 */
export function createRedTree(green: GreenNode, source: string): RedNode {
  return new RedNodeImpl(green, null, 0, -1, source);
}

/**
 * Find the deepest element containing a position
 */
export function elementAtOffset(root: RedNode, offset: number): RedElement | undefined {
  const fullSpan = root.fullSpan();
  if (offset < fullSpan.start || offset >= fullSpan.end) {
    return undefined;
  }

  for (const child of root.children()) {
    const childSpan = child.fullSpan();
    if (offset >= childSpan.start && offset < childSpan.end) {
      if (isRedNode(child)) {
        return elementAtOffset(child, offset) ?? child;
      }
      return child;
    }
  }

  return root;
}

/**
 * Find the deepest node containing a position
 */
export function nodeAtOffset(root: RedNode, offset: number): RedNode | undefined {
  const element = elementAtOffset(root, offset);
  if (!element) return undefined;
  return isRedNode(element) ? element : element.parent;
}

/**
 * Find all elements intersecting a range
 */
export function elementsInRange(root: RedNode, start: number, end: number): RedElement[] {
  const result: RedElement[] = [];

  function visit(element: RedElement): void {
    const span = element.fullSpan();

    // Skip if completely outside range
    if (span.end <= start || span.start >= end) {
      return;
    }

    result.push(element);

    if (isRedNode(element)) {
      for (const child of element.children()) {
        visit(child);
      }
    }
  }

  visit(root);
  return result;
}
