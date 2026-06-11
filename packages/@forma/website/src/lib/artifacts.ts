import type { AstNode, Span, TimedPassResult } from "../engine/protocol";

export type SpanRange = readonly [number, number];

export function spanRange(span: Span | undefined): SpanRange | null {
  if (!span) return null;
  return [span.startOffset, span.endOffset];
}

export function sameSpan(a: SpanRange | null, b: SpanRange | null): boolean {
  return Boolean(a && b && a[0] === b[0] && a[1] === b[1]);
}

export function spanContains(span: SpanRange | null, offset: number | null): boolean {
  return Boolean(span && offset !== null && span[0] <= offset && offset <= span[1]);
}

export function spanSize(span: SpanRange): number {
  return span[1] - span[0];
}

export function spanContainsRange(span: SpanRange | null, range: SpanRange | null): boolean {
  return Boolean(span && range && span[0] <= range[0] && range[1] <= span[1]);
}

export function collectAstSpans(nodes: readonly AstNode[] | undefined): SpanRange[] {
  if (!nodes) return [];
  const spans: SpanRange[] = [];
  for (const node of nodes) collectNodeSpans(node, spans);
  return spans;
}

export function uniqueSpans(spans: readonly (SpanRange | null | undefined)[]): SpanRange[] {
  const seen = new Set<string>();
  const result: SpanRange[] = [];
  for (const span of spans) {
    if (!span) continue;
    const key = `${span[0]}:${span[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(span);
  }
  return result.sort((a, b) => spanSize(a) - spanSize(b));
}

export function passOf<P extends TimedPassResult["pass"]>(
  results: readonly TimedPassResult[],
  pass: P,
): Extract<TimedPassResult, { readonly pass: P }> | null {
  return (results.find((result) => result.pass === pass) as Extract<
    TimedPassResult,
    { readonly pass: P }
  > | undefined) ?? null;
}

export function astToSource(nodes: readonly AstNode[] | undefined): string {
  if (!nodes || nodes.length === 0) return "";
  return nodes.map((node) => nodeToSource(node)).join("\n");
}

export function nodeToSource(node: AstNode): string {
  switch (node.kind) {
    case "nil":
      return "nil";
    case "bool":
      return node.value ? "true" : "false";
    case "int":
    case "float":
      return String(node.value);
    case "string":
      return JSON.stringify(node.value);
    case "symbol":
    case "keyword":
      return node.value;
    case "list":
      return `(${node.items.map(nodeToSource).join(" ")})`;
    case "vector":
      return `[${node.items.map(nodeToSource).join(" ")}]`;
    case "set":
      return `{${node.items.map(nodeToSource).join(" ")}}`;
    case "map":
      return `{${node.entries
        .map((entry) => `${nodeToSource(entry.key)} ${nodeToSource(entry.value)}`)
        .join(" ")}}`;
    case "error":
      return `<error: ${node.message}>`;
  }
}

export function formatJsonish(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function collectNodeSpans(node: AstNode, spans: SpanRange[]): void {
  const span = spanRange(node.span);
  if (span) spans.push(span);
  switch (node.kind) {
    case "list":
    case "vector":
    case "set":
      for (const item of node.items) collectNodeSpans(item, spans);
      break;
    case "map":
      for (const entry of node.entries) {
        collectNodeSpans(entry.key, spans);
        collectNodeSpans(entry.value, spans);
      }
      break;
    default:
      break;
  }
}
