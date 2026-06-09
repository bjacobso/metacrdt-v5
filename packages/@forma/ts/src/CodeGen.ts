/**
 * S-Expression AST Builder and Pretty-Printer
 *
 * All emitters produce `SExp` nodes; the renderer converts to formatted strings.
 *
 * @module
 */

// =============================================================================
// Types
// =============================================================================

export type SExp =
  | { readonly _tag: "atom"; readonly value: string }
  | { readonly _tag: "string"; readonly value: string }
  | { readonly _tag: "list"; readonly elements: readonly SExp[] }
  | { readonly _tag: "bracket"; readonly elements: readonly SExp[] }
  | { readonly _tag: "comment"; readonly text: string }
  | { readonly _tag: "blank" };

// =============================================================================
// Constructors
// =============================================================================

export function atom(v: string): SExp {
  return { _tag: "atom", value: v };
}

/** Quoted string literal. Escapes backslashes, quotes, and newlines. */
export function str(v: string): SExp {
  return { _tag: "string", value: v };
}

export function list(...els: SExp[]): SExp {
  return { _tag: "list", elements: els };
}

export function bracket(...els: SExp[]): SExp {
  return { _tag: "bracket", elements: els };
}

export function comment(text: string): SExp {
  return { _tag: "comment", text };
}

export function blank(): SExp {
  return { _tag: "blank" };
}

// =============================================================================
// Pretty-printer
// =============================================================================

const SOFT_WRAP = 80;
const INDENT_SIZE = 2;

/** Escape a string value for embedding in Lisp source. */
function escapeString(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
}

/** Check if a string needs triple-quoting (contains newlines or backslash-n). */
function needsTripleQuote(s: string): boolean {
  return s.includes("\n");
}

/** Render a single SExp node as a flat (single-line) string. Returns null if too long. */
function renderFlat(node: SExp): string {
  switch (node._tag) {
    case "atom":
      return node.value;
    case "string":
      if (needsTripleQuote(node.value)) {
        return `"""${node.value}"""`;
      }
      return `"${escapeString(node.value)}"`;
    case "list": {
      const inner = node.elements.map(renderFlat).join(" ");
      return `(${inner})`;
    }
    case "bracket": {
      const inner = node.elements.map(renderFlat).join(" ");
      return `[${inner}]`;
    }
    case "comment":
      return `;; ${node.text}`;
    case "blank":
      return "";
  }
}

/**
 * Render a single SExp node with indentation, breaking long lists.
 * Returns an array of lines (without trailing newlines).
 */
function renderNode(node: SExp, indent: number): string[] {
  const pad = " ".repeat(indent);

  switch (node._tag) {
    case "comment":
      return [`${pad};; ${node.text}`];
    case "blank":
      return [""];
    case "atom":
      return [`${pad}${node.value}`];
    case "string": {
      if (needsTripleQuote(node.value)) {
        return [`${pad}"""${node.value}"""`];
      }
      return [`${pad}"${escapeString(node.value)}"`];
    }
    case "bracket": {
      const flat = renderFlat(node);
      if (indent + flat.length <= SOFT_WRAP) {
        return [`${pad}${flat}`];
      }
      // Break after first element
      if (node.elements.length === 0) return [`${pad}[]`];
      const lines: string[] = [];
      const first = renderFlat(node.elements[0]!);
      lines.push(`${pad}[${first}`);
      for (let i = 1; i < node.elements.length; i++) {
        const childLines = renderNode(node.elements[i]!, indent + INDENT_SIZE);
        lines.push(...childLines);
      }
      lines[lines.length - 1] += "]";
      return lines;
    }
    case "list": {
      if (node.elements.length === 0) return [`${pad}()`];

      // Try flat rendering first
      const flat = renderFlat(node);
      if (indent + flat.length <= SOFT_WRAP) {
        return [`${pad}${flat}`];
      }

      // Break: head stays on first line, rest indented
      const head = node.elements[0]!;
      const headStr = renderFlat(head);
      const rest = node.elements.slice(1);

      if (rest.length === 0) {
        return [`${pad}(${headStr})`];
      }

      // Check if head + first arg fit on one line
      const childIndent = indent + INDENT_SIZE;
      const lines: string[] = [];

      // For short heads, try to keep head + first simple arg on same line
      if (rest.length > 0) {
        const firstRest = rest[0]!;
        const firstRestFlat = renderFlat(firstRest);
        const oneLinerLen = indent + 1 + headStr.length + 1 + firstRestFlat.length + 1;

        if (
          oneLinerLen <= SOFT_WRAP &&
          rest.length === 1 &&
          (firstRest._tag === "atom" || firstRest._tag === "string")
        ) {
          return [`${pad}(${headStr} ${firstRestFlat})`];
        }
      }

      lines.push(`${pad}(${headStr}`);
      for (let i = 0; i < rest.length; i++) {
        const childLines = renderNode(rest[i]!, childIndent);
        lines.push(...childLines);
      }
      // Close paren on last line
      lines[lines.length - 1] += ")";
      return lines;
    }
  }
}

/**
 * Render an array of top-level SExp nodes into a formatted string.
 */
export function render(nodes: readonly SExp[], indent: number = 0): string {
  const allLines: string[] = [];
  for (const node of nodes) {
    allLines.push(...renderNode(node, indent));
  }
  return allLines.join("\n") + "\n";
}
