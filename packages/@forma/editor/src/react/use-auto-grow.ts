/**
 * useAutoGrow
 *
 * Simplified hook for auto-growing an editor container.
 * With CodeMirror 6, content height is tracked via the update listener
 * directly in the editor component, so this is a minimal utility.
 */

export interface UseAutoGrowOptions {
  /** Minimum height in pixels (default: 60) */
  minHeight?: number;
  /** Maximum height in pixels — scrolls beyond this (default: Infinity) */
  maxHeight?: number;
}

export function clampHeight(contentHeight: number, options: UseAutoGrowOptions = {}): number {
  const { minHeight = 60, maxHeight = Infinity } = options;
  return Math.max(minHeight, Math.min(maxHeight, contentHeight));
}
