import type { Position, Range } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { CstExpr, CstSpan } from "./protocol.js";

export function spanToRange(document: TextDocument, span: CstSpan): Range {
  return {
    start: document.positionAt(clampOffset(document, span.startOffset)),
    end: document.positionAt(clampOffset(document, Math.max(span.startOffset, span.endOffset))),
  };
}

export function positionToOffset(document: TextDocument, position: Position): number {
  return clampOffset(document, document.offsetAt(position));
}

export function findSmallestExprAtOffset(
  exprs: readonly CstExpr[],
  offset: number,
): CstExpr | undefined {
  const containing = flattenExprs(exprs).filter(
    (expr) => expr.span.startOffset <= offset && offset < expr.span.endOffset,
  );
  return containing.reduce<CstExpr | undefined>((smallest, current) => {
    if (!smallest) return current;
    const smallestSize = smallest.span.endOffset - smallest.span.startOffset;
    const currentSize = current.span.endOffset - current.span.startOffset;
    return currentSize < smallestSize ? current : smallest;
  }, undefined);
}

export function findSymbolAtOffset(
  exprs: readonly CstExpr[],
  offset: number,
): { readonly name: string; readonly expr: CstExpr } | undefined {
  const expr = findSmallestExprAtOffset(exprs, offset);
  if (!expr) return undefined;
  if ((expr.kind === "symbol" || expr.kind === "keyword") && typeof expr.value === "string") {
    return { name: expr.value, expr };
  }
  return undefined;
}

export function flattenExprs(exprs: readonly CstExpr[]): readonly CstExpr[] {
  const result: CstExpr[] = [];
  const visit = (expr: CstExpr): void => {
    result.push(expr);
    if (expr.kind === "list" || expr.kind === "vector") {
      expr.items.forEach(visit);
    } else if (expr.kind === "map") {
      for (const entry of expr.entries) {
        visit(entry.key);
        visit(entry.value);
      }
    }
  };
  exprs.forEach(visit);
  return result;
}

function clampOffset(document: TextDocument, offset: number): number {
  return Math.max(0, Math.min(document.getText().length, offset));
}
