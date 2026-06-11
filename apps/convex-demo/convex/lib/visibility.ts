import {
  isFactVisible,
  valueKey,
  type BitemporalCoord,
  type VisibilityOpts,
} from "@metacrdt/convex";
import type { Doc } from "../_generated/dataModel";

export { valueKey, type BitemporalCoord, type VisibilityOpts };

/**
 * Whether a folded fact projection is visible at a (txTime, validTime)
 * coordinate. The protocol predicate lives in @metacrdt/convex, which delegates
 * to @metacrdt/core's deterministic fold (SPEC §5.3).
 */
export function isVisible(
  fact: Doc<"facts">,
  coord: BitemporalCoord,
  opts: VisibilityOpts = {},
): boolean {
  return isFactVisible(fact, coord, opts);
}
