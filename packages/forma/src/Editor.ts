/**
 * Structural editing transforms.
 *
 * @module Editor
 */

export {
  barfBackwardAtOffset,
  barfForwardAtOffset,
  raiseAtOffset,
  raiseToTopLevelAtOffset,
  selectEnclosingListRange,
  slurpBackwardAtOffset,
  slurpForwardAtOffset,
  spliceAtOffset,
  transposeBackwardAtOffset,
  transposeForwardAtOffset,
  wrapSelectionWithHead,
  type OffsetRange,
  type StructuralEditResult,
} from "./editor/structural-editing.js";
