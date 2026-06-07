import { Doc } from "../_generated/dataModel";
import {
  fromEvents,
  visible as coreVisible,
  type Event,
  type Value,
} from "@metacrdt/core";

export type BitemporalCoord = {
  txTime: number;
  validTime: number;
};

export type VisibilityOpts = {
  includeTombstoned?: boolean;
  includeRetracted?: boolean;
};

// The bitemporal visibility predicate is defined once, in @metacrdt/core (SPEC
// §5.3), and shared by every runtime. This Convex adapter maps a folded `facts`
// row back to the core events its lifecycle represents — an assert, plus a
// retract and/or tombstone targeting it — and asks the core. Synthetic event ids
// are fine: these events are ephemeral inputs to the fold, never stored or synced
// (so we skip content hashing entirely).

const SYS = { actor: "convex", actorType: "system" as const, causalRefs: [] };
const hlc = (pt: number) => ({ pt, l: 0, r: "convex" });

function factToFold(fact: Doc<"facts">): {
  assertEv: Event;
  log: ReturnType<typeof fromEvents>;
} {
  const assertEv: Event = {
    ...SYS,
    id: "assert",
    kind: "assert",
    hlc: hlc(fact.assertedAt),
    e: fact.e,
    a: fact.a,
    v: fact.v as Value,
    validFrom: fact.validFrom,
    validTo: fact.validTo ?? null,
  };
  const evs: Event[] = [assertEv];
  if (fact.retractedAt !== undefined) {
    evs.push({ ...SYS, id: "retract", kind: "retract", target: "assert", hlc: hlc(fact.retractedAt) });
  }
  if (fact.tombstonedAt !== undefined) {
    // Current Convex semantics: a tombstoned fact is hidden regardless of the
    // query's txTime, so the tombstone is effective from the start of time.
    evs.push({ ...SYS, id: "tomb", kind: "tombstone", target: "assert", hlc: hlc(0) });
  }
  return { assertEv, log: fromEvents(evs) };
}

/**
 * Whether a fact is visible at a (txTime, validTime) coordinate — asserted and
 * not yet retracted as of txTime, valid interval covering validTime, not
 * tombstoned. Delegates to @metacrdt/core's `visible` (SPEC §5.3). Audit reads
 * may opt into tombstoned / retracted facts via `opts`.
 */
export function isVisible(
  fact: Doc<"facts">,
  coord: BitemporalCoord,
  opts: VisibilityOpts = {},
): boolean {
  const { assertEv, log } = factToFold(fact);
  return coreVisible(assertEv, coord, log, {
    includeRetracted: opts.includeRetracted,
    includeTombstoned: opts.includeTombstoned,
  });
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
