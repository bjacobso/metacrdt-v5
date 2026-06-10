import {
  fromEvents,
  visible as coreVisible,
  type Event,
} from "@metacrdt/core";
import {
  asCoreValue,
  type BitemporalCoord,
  type FactProjectionRow,
  type VisibilityOpts,
} from "./types";

const SYS = {
  actor: "convex",
  actorType: "system" as const,
  causalRefs: [],
};
const hlc = (pt: number) => ({ pt, l: 0, r: "convex" });

export function foldEventsForFactProjection(fact: FactProjectionRow): {
  readonly assertEv: Event;
  readonly log: ReturnType<typeof fromEvents>;
} {
  const assertEv: Event = {
    ...SYS,
    id: fact.assertEventId ?? "assert",
    kind: "assert",
    hlc: hlc(fact.assertedAt),
    e: fact.e,
    a: fact.a,
    v: asCoreValue(fact.v),
    validFrom: fact.validFrom,
    validTo: fact.validTo ?? null,
  };
  const evs: Event[] = [assertEv];
  if (fact.retractedAt !== undefined) {
    evs.push({
      ...SYS,
      id: `${assertEv.id}:retract`,
      kind: "retract",
      target: assertEv.id,
      hlc: hlc(fact.retractedAt),
    });
  }
  if (fact.tombstonedAt !== undefined) {
    // SPEC §5.3: tombstone visibility is time-indexed (T.hlc.pt ≤ C.txTime) —
    // before the tombstone landed, the assert was visible ("what was known
    // then"). Keeps the facts projection in agreement with the core fold over
    // factEvents at every coordinate.
    evs.push({
      ...SYS,
      id: `${assertEv.id}:tombstone`,
      kind: "tombstone",
      target: assertEv.id,
      hlc: hlc(fact.tombstonedAt),
    });
  }
  return { assertEv, log: fromEvents(evs) };
}

export function isFactVisible(
  fact: FactProjectionRow,
  coord: BitemporalCoord,
  opts: VisibilityOpts = {},
): boolean {
  const { assertEv, log } = foldEventsForFactProjection(fact);
  return coreVisible(assertEv, coord, log, {
    includeRetracted: opts.includeRetracted,
    includeTombstoned: opts.includeTombstoned,
  });
}

export function valueKey(value: unknown): string {
  if (value === null || value === undefined) return "null";
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    return `${t}:${String(value)}`;
  }
  return `json:${JSON.stringify(value)}`;
}
