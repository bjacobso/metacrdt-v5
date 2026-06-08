import { parse, isRedNode, type RedNode } from "../reader/index.js";

export interface OffsetRange {
  readonly start: number;
  readonly end: number;
}

export interface StructuralEditResult {
  readonly source: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
}

interface NodeRef {
  readonly node: RedNode;
  readonly parentList: RedNode | null;
  readonly container: readonly RedNode[];
  readonly indexInContainer: number;
}

interface ParseContext {
  readonly refs: readonly NodeRef[];
  readonly listRefs: readonly NodeRef[];
}

function clampOffset(offset: number, sourceLength: number): number {
  if (sourceLength <= 0) return 0;
  if (offset < 0) return 0;
  if (offset > sourceLength) return sourceLength;
  return offset;
}

function normalizeRange(start: number, end: number, sourceLength: number): OffsetRange {
  const clampedStart = clampOffset(start, sourceLength);
  const clampedEnd = clampOffset(end, sourceLength);

  return clampedStart <= clampedEnd
    ? { start: clampedStart, end: clampedEnd }
    : { start: clampedEnd, end: clampedStart };
}

function probeOffsetForCursor(offset: number, sourceLength: number): number {
  if (sourceLength <= 0) return 0;
  const clamped = clampOffset(offset, sourceLength);
  if (clamped === sourceLength) return sourceLength - 1;
  return clamped;
}

function getNodeChildren(node: RedNode): RedNode[] {
  return node.children().filter(isRedNode);
}

function parseContext(source: string): ParseContext | null {
  const result = parse(source);
  if (result.errors.length > 0) return null;

  const refs: NodeRef[] = [];
  const listRefs: NodeRef[] = [];

  const rootChildren = getNodeChildren(result.redTree);

  const visit = (
    node: RedNode,
    parentList: RedNode | null,
    container: readonly RedNode[],
    indexInContainer: number,
  ) => {
    const ref: NodeRef = { node, parentList, container, indexInContainer };
    refs.push(ref);

    if (node.kind() === "List") {
      listRefs.push(ref);
    }

    const childNodes = getNodeChildren(node);
    const childParentList = node.kind() === "List" ? node : parentList;

    childNodes.forEach((child, index) => {
      visit(child, childParentList, childNodes, index);
    });
  };

  rootChildren.forEach((node, index) => {
    visit(node, null, rootChildren, index);
  });

  return { refs, listRefs };
}

function spanSize(node: RedNode): number {
  const span = node.span();
  return span.end - span.start;
}

function sanitizeHead(head: string): string {
  const trimmed = head.trim();
  return trimmed.length > 0 ? trimmed : "do";
}

function resolveTargetRange(
  context: ParseContext,
  sourceLength: number,
  selectionStart: number,
  selectionEnd: number,
): OffsetRange | null {
  const range = normalizeRange(selectionStart, selectionEnd, sourceLength);

  if (range.start === range.end) {
    const target = findSmallestNodeAtOffset(context, range.start, sourceLength);
    if (!target) return null;

    const targetSpan = target.node.span();
    return { start: targetSpan.start, end: targetSpan.end };
  }

  return range;
}

function findTopLevelList(node: RedNode): RedNode | null {
  let current: RedNode | null = node;
  let lastList: RedNode | null = null;

  while (current) {
    if (current.kind() === "List") {
      lastList = current;
    }

    if (!current.parent || current.parent.kind() === "Root") {
      break;
    }

    current = current.parent;
  }

  return lastList;
}

function findInnermostListAtOffset(
  context: ParseContext,
  offset: number,
  sourceLength: number,
): NodeRef | null {
  const probe = probeOffsetForCursor(offset, sourceLength);

  const candidates = context.listRefs.filter((ref) => {
    const span = ref.node.span();
    return span.start <= probe && probe < span.end;
  });

  if (candidates.length === 0) return null;

  return candidates.reduce((smallest, current) =>
    spanSize(current.node) < spanSize(smallest.node) ? current : smallest,
  );
}

function findSmallestNodeAtOffset(
  context: ParseContext,
  offset: number,
  sourceLength: number,
): NodeRef | null {
  const probe = probeOffsetForCursor(offset, sourceLength);

  const candidates = context.refs.filter((ref) => {
    const span = ref.node.span();
    return span.start <= probe && probe < span.end;
  });

  if (candidates.length === 0) return null;

  return candidates.reduce((smallest, current) =>
    spanSize(current.node) < spanSize(smallest.node) ? current : smallest,
  );
}

export function selectEnclosingListRange(
  source: string,
  selectionStart: number,
  selectionEnd = selectionStart,
): OffsetRange | null {
  const context = parseContext(source);
  if (!context) return null;

  const range = normalizeRange(selectionStart, selectionEnd, source.length);

  let candidates: NodeRef[];
  if (range.start === range.end) {
    const probe = probeOffsetForCursor(range.start, source.length);
    candidates = context.listRefs.filter((ref) => {
      const span = ref.node.span();
      return span.start <= probe && probe < span.end;
    });
  } else {
    candidates = context.listRefs.filter((ref) => {
      const span = ref.node.span();
      return span.start <= range.start && range.end <= span.end;
    });
  }

  if (candidates.length === 0) return null;

  candidates = [...candidates].sort((a, b) => spanSize(a.node) - spanSize(b.node));

  const smallest = candidates[0]!;
  const smallestSpan = smallest.node.span();
  const matchesSelection = smallestSpan.start === range.start && smallestSpan.end === range.end;
  const chosen = matchesSelection && candidates.length > 1 ? candidates[1]! : smallest;
  const chosenSpan = chosen.node.span();

  return {
    start: chosenSpan.start,
    end: chosenSpan.end,
  };
}

export function wrapSelectionWithHead(
  source: string,
  selectionStart: number,
  selectionEnd: number,
  head: string,
): StructuralEditResult | null {
  const context = parseContext(source);
  if (!context) return null;

  const targetRange = resolveTargetRange(context, source.length, selectionStart, selectionEnd);
  if (!targetRange) return null;

  const formHead = sanitizeHead(head);
  const open = `(${formHead} `;
  const wrapped =
    source.slice(0, targetRange.start) +
    open +
    source.slice(targetRange.start, targetRange.end) +
    ")" +
    source.slice(targetRange.end);

  return {
    source: wrapped,
    selectionStart: targetRange.start + open.length,
    selectionEnd: targetRange.end + open.length,
  };
}

export function slurpForwardAtOffset(source: string, offset: number): StructuralEditResult | null {
  const context = parseContext(source);
  if (!context) return null;

  const listRef = findInnermostListAtOffset(context, offset, source.length);
  if (!listRef) return null;

  const sibling = listRef.container[listRef.indexInContainer + 1];
  if (!sibling) return null;

  const siblingSpan = sibling.span();
  const listSpan = listRef.node.span();

  const movedText = source.slice(siblingSpan.start, siblingSpan.end);
  if (movedText.length === 0) return null;

  const closeParenOffset = listSpan.end - 1;

  let removeStart = siblingSpan.start;
  while (removeStart > listSpan.end && /\s/.test(source[removeStart - 1] ?? "")) {
    removeStart -= 1;
  }

  const withoutSibling = source.slice(0, removeStart) + source.slice(siblingSpan.end);
  const insertedText = ` ${movedText}`;
  const nextSource =
    withoutSibling.slice(0, closeParenOffset) +
    insertedText +
    withoutSibling.slice(closeParenOffset);

  const movedStart = closeParenOffset + 1;

  return {
    source: nextSource,
    selectionStart: movedStart,
    selectionEnd: movedStart + movedText.length,
  };
}

export function barfForwardAtOffset(source: string, offset: number): StructuralEditResult | null {
  const context = parseContext(source);
  if (!context) return null;

  const listRef = findInnermostListAtOffset(context, offset, source.length);
  if (!listRef) return null;

  const children = getNodeChildren(listRef.node);
  if (children.length <= 1) return null;

  const previous = children[children.length - 2]!;
  const last = children[children.length - 1]!;

  const previousSpan = previous.span();
  const lastSpan = last.span();
  const listSpan = listRef.node.span();
  const closeParenOffset = listSpan.end - 1;

  const movedText = source.slice(lastSpan.start, lastSpan.end);
  if (movedText.length === 0) return null;

  let removeStart = lastSpan.start;
  while (removeStart > previousSpan.end && /\s/.test(source[removeStart - 1] ?? "")) {
    removeStart -= 1;
  }

  let removeEnd = lastSpan.end;
  while (removeEnd < closeParenOffset && /\s/.test(source[removeEnd] ?? "")) {
    removeEnd += 1;
  }

  const withoutLast = source.slice(0, removeStart) + source.slice(removeEnd);
  const closeParenAfterRemoval = closeParenOffset - (removeEnd - removeStart);

  const insertedText = ` ${movedText}`;
  const nextSource =
    withoutLast.slice(0, closeParenAfterRemoval + 1) +
    insertedText +
    withoutLast.slice(closeParenAfterRemoval + 1);

  const movedStart = closeParenAfterRemoval + 2;

  return {
    source: nextSource,
    selectionStart: movedStart,
    selectionEnd: movedStart + movedText.length,
  };
}

export function slurpBackwardAtOffset(source: string, offset: number): StructuralEditResult | null {
  const context = parseContext(source);
  if (!context) return null;

  const listRef = findInnermostListAtOffset(context, offset, source.length);
  if (!listRef) return null;

  const sibling = listRef.container[listRef.indexInContainer - 1];
  if (!sibling) return null;

  const siblingSpan = sibling.span();
  const listSpan = listRef.node.span();

  const movedText = source.slice(siblingSpan.start, siblingSpan.end);
  if (movedText.length === 0) return null;

  let removeEnd = siblingSpan.end;
  while (removeEnd < listSpan.start && /\s/.test(source[removeEnd] ?? "")) {
    removeEnd += 1;
  }

  const withoutSibling = source.slice(0, siblingSpan.start) + source.slice(removeEnd);
  const listStartAfterRemoval = listSpan.start - (removeEnd - siblingSpan.start);

  const insertedText = `${movedText} `;
  const insertOffset = listStartAfterRemoval + 1;
  const nextSource =
    withoutSibling.slice(0, insertOffset) + insertedText + withoutSibling.slice(insertOffset);

  return {
    source: nextSource,
    selectionStart: insertOffset,
    selectionEnd: insertOffset + movedText.length,
  };
}

export function barfBackwardAtOffset(source: string, offset: number): StructuralEditResult | null {
  const context = parseContext(source);
  if (!context) return null;

  const listRef = findInnermostListAtOffset(context, offset, source.length);
  if (!listRef) return null;

  const children = getNodeChildren(listRef.node);
  if (children.length <= 1) return null;

  const first = children[0]!;
  const second = children[1]!;

  const firstSpan = first.span();
  const secondSpan = second.span();
  const listSpan = listRef.node.span();
  const openParenOffset = listSpan.start;

  const movedText = source.slice(firstSpan.start, firstSpan.end);
  if (movedText.length === 0) return null;

  let removeStart = firstSpan.start;
  while (removeStart > openParenOffset + 1 && /\s/.test(source[removeStart - 1] ?? "")) {
    removeStart -= 1;
  }

  let removeEnd = firstSpan.end;
  while (removeEnd < secondSpan.start && /\s/.test(source[removeEnd] ?? "")) {
    removeEnd += 1;
  }

  const withoutFirst = source.slice(0, removeStart) + source.slice(removeEnd);
  const insertedText = `${movedText} `;
  const nextSource =
    withoutFirst.slice(0, openParenOffset) + insertedText + withoutFirst.slice(openParenOffset);

  return {
    source: nextSource,
    selectionStart: openParenOffset,
    selectionEnd: openParenOffset + movedText.length,
  };
}

export function spliceAtOffset(source: string, offset: number): StructuralEditResult | null {
  const context = parseContext(source);
  if (!context) return null;

  const listRef = findInnermostListAtOffset(context, offset, source.length);
  if (!listRef) return null;

  const listSpan = listRef.node.span();
  if (listSpan.end - listSpan.start <= 2) return null;

  const withoutOpen = source.slice(0, listSpan.start) + source.slice(listSpan.start + 1);
  const closeParenOffset = listSpan.end - 1;
  const closeParenAfterRemoval = closeParenOffset - 1;
  const withoutBoth =
    withoutOpen.slice(0, closeParenAfterRemoval) + withoutOpen.slice(closeParenAfterRemoval + 1);

  return {
    source: withoutBoth,
    selectionStart: listSpan.start,
    selectionEnd: listSpan.start,
  };
}

export function raiseAtOffset(source: string, offset: number): StructuralEditResult | null {
  const context = parseContext(source);
  if (!context) return null;

  const nodeRef = findSmallestNodeAtOffset(context, offset, source.length);
  if (!nodeRef) return null;

  const parent = nodeRef.parentList;
  if (!parent) return null;

  const parentSpan = parent.span();
  const childSpan = nodeRef.node.span();
  const childText = source.slice(childSpan.start, childSpan.end);

  if (childText.length === 0) return null;

  const nextSource = source.slice(0, parentSpan.start) + childText + source.slice(parentSpan.end);

  return {
    source: nextSource,
    selectionStart: parentSpan.start,
    selectionEnd: parentSpan.start + childText.length,
  };
}

export function transposeForwardAtOffset(
  source: string,
  offset: number,
): StructuralEditResult | null {
  const context = parseContext(source);
  if (!context) return null;

  const nodeRef = findSmallestNodeAtOffset(context, offset, source.length);
  if (!nodeRef) return null;

  const container = nodeRef.container;
  const index = nodeRef.indexInContainer;
  const next = container[index + 1];
  if (!next) return null;

  const firstSpan = nodeRef.node.span();
  const secondSpan = next.span();

  const firstText = source.slice(firstSpan.start, firstSpan.end);
  const secondText = source.slice(secondSpan.start, secondSpan.end);
  const betweenText = source.slice(firstSpan.end, secondSpan.start);

  const nextSource =
    source.slice(0, firstSpan.start) +
    secondText +
    betweenText +
    firstText +
    source.slice(secondSpan.end);

  const newStart = firstSpan.start + secondText.length + betweenText.length;
  return {
    source: nextSource,
    selectionStart: newStart,
    selectionEnd: newStart + firstText.length,
  };
}

export function transposeBackwardAtOffset(
  source: string,
  offset: number,
): StructuralEditResult | null {
  const context = parseContext(source);
  if (!context) return null;

  const nodeRef = findSmallestNodeAtOffset(context, offset, source.length);
  if (!nodeRef) return null;

  const container = nodeRef.container;
  const index = nodeRef.indexInContainer;
  if (index <= 0) return null;

  const previous = container[index - 1];
  if (!previous) return null;

  const firstSpan = previous.span();
  const secondSpan = nodeRef.node.span();

  const firstText = source.slice(firstSpan.start, firstSpan.end);
  const secondText = source.slice(secondSpan.start, secondSpan.end);
  const betweenText = source.slice(firstSpan.end, secondSpan.start);

  const nextSource =
    source.slice(0, firstSpan.start) +
    secondText +
    betweenText +
    firstText +
    source.slice(secondSpan.end);

  return {
    source: nextSource,
    selectionStart: firstSpan.start,
    selectionEnd: firstSpan.start + secondText.length,
  };
}

export function raiseToTopLevelAtOffset(
  source: string,
  offset: number,
): StructuralEditResult | null {
  const context = parseContext(source);
  if (!context) return null;

  const nodeRef = findSmallestNodeAtOffset(context, offset, source.length);
  if (!nodeRef) return null;

  const targetRange = resolveTargetRange(context, source.length, offset, offset);
  if (!targetRange) return null;

  const topList = findTopLevelList(nodeRef.node);
  if (!topList) return null;

  const topSpan = topList.span();
  const targetText = source.slice(targetRange.start, targetRange.end);
  if (targetText.length === 0) return null;

  const nextSource = source.slice(0, topSpan.start) + targetText + source.slice(topSpan.end);

  return {
    source: nextSource,
    selectionStart: topSpan.start,
    selectionEnd: topSpan.start + targetText.length,
  };
}
