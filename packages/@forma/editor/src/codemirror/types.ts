/**
 * Provider interfaces for pluggable editor intelligence.
 *
 * Domain-specific editors implement these interfaces
 * to inject completions, hover, diagnostics, and semantic highlighting
 * into the generic Lisp editor.
 */

export interface EditorCompletion {
  readonly label: string;
  readonly type: string;
  readonly apply: string;
  readonly detail?: string | undefined;
  readonly info?: string | undefined;
}

export interface CompletionProvider {
  getCompletions(
    source: string,
    offset: number,
  ): { readonly from: number; readonly options: readonly EditorCompletion[] } | null;
}

export interface EditorHover {
  readonly content: string;
  readonly range: { readonly start: number; readonly end: number };
}

export interface HoverProvider {
  getHover(source: string, offset: number): EditorHover | null;
}

export interface EditorDiagnostic {
  readonly severity: string;
  readonly message: string;
  readonly loc?: { readonly line: number; readonly col: number };
}

export interface DiagnosticsProvider {
  getDiagnostics(source: string): readonly EditorDiagnostic[];
}

export interface SemanticRange {
  readonly from: number;
  readonly to: number;
  readonly cls: string;
}

export interface SemanticRangeProvider {
  getRanges(source: string): readonly SemanticRange[];
}

export interface LispEditorIntelligence {
  completion?: CompletionProvider;
  hover?: HoverProvider;
  diagnostics?: DiagnosticsProvider;
  semanticHighlight?: SemanticRangeProvider;
}

/**
 * Convert a line/col location to a character offset range for diagnostics.
 */
export function diagnosticRangeFromLoc(
  source: string,
  loc?: { readonly line: number; readonly col: number },
): { readonly from: number; readonly to: number } {
  const from = loc ? lineColToOffset(source, loc.line, loc.col) : 0;
  const symbol = symbolRangeAtOffset(source, from);
  return symbol
    ? { from: symbol.start, to: symbol.end }
    : { from, to: Math.min(source.length, from + 1) };
}

const SYMBOL_CHAR = /[\w!?*+/<>=$.&:-]/;

function lineColToOffset(source: string, line: number, col: number): number {
  let currentLine = 1;
  let index = 0;
  while (index < source.length && currentLine < line) {
    if (source[index] === "\n") currentLine += 1;
    index += 1;
  }
  return Math.min(source.length, index + Math.max(0, col - 1));
}

function symbolRangeAtOffset(
  source: string,
  offset: number,
): { readonly start: number; readonly end: number; readonly text: string } | null {
  if (!source.length) return null;
  let start = Math.max(0, Math.min(offset, source.length));
  let end = start;
  if (start > 0 && !SYMBOL_CHAR.test(source[start] ?? "") && SYMBOL_CHAR.test(source[start - 1]!)) {
    start -= 1;
    end = start + 1;
  }
  while (start > 0 && SYMBOL_CHAR.test(source[start - 1]!)) start -= 1;
  while (end < source.length && SYMBOL_CHAR.test(source[end]!)) end += 1;
  if (start === end) return null;
  return { start, end, text: source.slice(start, end) };
}
