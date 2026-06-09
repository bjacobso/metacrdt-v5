import type { EditorTypedSpan } from "./types.js";

export function findEditorTypeAtOffset(
  typedSpans: readonly EditorTypedSpan[],
  offset: number,
): EditorTypedSpan | undefined {
  const containing = typedSpans.filter(
    (span) => span.span.startOffset <= offset && offset < span.span.endOffset,
  );
  if (containing.length === 0) return undefined;
  return containing.reduce((smallest, current) => {
    const smallestSize = smallest.span.endOffset - smallest.span.startOffset;
    const currentSize = current.span.endOffset - current.span.startOffset;
    return currentSize < smallestSize ? current : smallest;
  });
}
