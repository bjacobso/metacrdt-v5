import { Doc } from "../_generated/dataModel";

export type BitemporalCoord = {
  txTime: number;
  validTime: number;
};

export type VisibilityOpts = {
  includeTombstoned?: boolean;
  includeRetracted?: boolean;
};

/**
 * The core bitemporal predicate. A fact is visible at a (txTime, validTime)
 * coordinate when it had been asserted and not yet retracted as of txTime, its
 * valid interval covers validTime, and it has not been tombstoned.
 *
 * Audit reads may opt into tombstoned / retracted facts via `opts`.
 */
export function isVisible(
  fact: Doc<"facts">,
  coord: BitemporalCoord,
  opts: VisibilityOpts = {},
): boolean {
  const { txTime, validTime } = coord;

  if (fact.assertedAt > txTime) return false;

  if (!opts.includeRetracted) {
    if (fact.retractedAt !== undefined && fact.retractedAt <= txTime) {
      return false;
    }
  }

  if (fact.validFrom > validTime) return false;
  if (fact.validTo !== undefined && fact.validTo <= validTime) return false;

  if (!opts.includeTombstoned && fact.tombstonedAt !== undefined) {
    return false;
  }

  return true;
}

/**
 * Stable equality key for a triple value used in dedup / current-fact
 * comparisons. Convex values are JSON-serializable; object key order is not
 * guaranteed, so this is only sound for scalars and entity refs (the common
 * case for indexed attributes). Structured values fall back to JSON and should
 * not be relied on for equality semantics.
 */
export function valueKey(value: unknown): string {
  if (value === null || value === undefined) return "null";
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    return `${t}:${String(value)}`;
  }
  return `json:${JSON.stringify(value)}`;
}
