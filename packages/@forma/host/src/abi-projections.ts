import type { Diagnostic, TypeProjection } from "./types.js";

type DiagnosticPhase = NonNullable<Diagnostic["phase"]>;

export function typeProjection(display: string): TypeProjection {
  const named = new Set([
    "Int",
    "Float",
    "Bool",
    "Str",
    "String",
    "Unit",
    "Nil",
    "Keyword",
    "Symbol",
    "Syntax",
    "Any",
    "Map",
    "List",
    "Vector",
    "Declaration",
  ]);
  if (named.has(display)) {
    return { kind: "named", name: display === "String" ? "Str" : display, display };
  }
  return { kind: "display", display };
}

export function diagnosticFromAbi(value: unknown, phase: DiagnosticPhase): Diagnostic {
  const candidate = value as {
    code?: unknown;
    severity?: unknown;
    message?: unknown;
    span?: {
      sourceId?: unknown;
      startOffset?: unknown;
      endOffset?: unknown;
      startLine?: unknown;
      startColumn?: unknown;
      endLine?: unknown;
      endColumn?: unknown;
    };
  };
  const span =
    candidate.span &&
    typeof candidate.span.sourceId === "string" &&
    typeof candidate.span.startOffset === "number" &&
    typeof candidate.span.endOffset === "number"
      ? {
          sourceId: candidate.span.sourceId,
          startOffset: candidate.span.startOffset,
          endOffset: candidate.span.endOffset,
          ...(typeof candidate.span.startLine === "number"
            ? { startLine: candidate.span.startLine }
            : {}),
          ...(typeof candidate.span.startColumn === "number"
            ? { startColumn: candidate.span.startColumn }
            : {}),
          ...(typeof candidate.span.endLine === "number"
            ? { endLine: candidate.span.endLine }
            : {}),
          ...(typeof candidate.span.endColumn === "number"
            ? { endColumn: candidate.span.endColumn }
            : {}),
        }
      : undefined;
  return {
    code: typeof candidate.code === "string" ? candidate.code : `${phase}/diagnostic`,
    severity:
      candidate.severity === "warning" || candidate.severity === "info"
        ? candidate.severity
        : "error",
    message: typeof candidate.message === "string" ? candidate.message : JSON.stringify(value),
    phase,
    ...(span ? { span } : {}),
  };
}
