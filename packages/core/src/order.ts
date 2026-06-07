// The strict total order ≺ over events (SPEC §5.1):
//   e1 ≺ e2  ⟺  hlc(e1) < hlc(e2)
//             ∨ (hlc equal ∧ actor(e1) < actor(e2))
//             ∨ (hlc & actor equal ∧ id(e1) < id(e2))
// Total (ties broken by the content-addressed id) and replica-independent — the
// normative basis for conflict resolution (e.g. cardinality-one supersession).

import { Event } from "./event.js";
import { compareHlc } from "./hlc.js";

export function precedes(a: Event, b: Event): boolean {
  const h = compareHlc(a.hlc, b.hlc);
  if (h !== 0) return h < 0;
  if (a.actor !== b.actor) return a.actor < b.actor;
  return a.id < b.id;
}

export function compareEvents(a: Event, b: Event): number {
  if (a.id === b.id) return 0;
  return precedes(a, b) ? -1 : 1;
}

/** The ≺-maximal event of a non-empty list. */
export function maxByOrder(events: readonly Event[]): Event | undefined {
  let max: Event | undefined;
  for (const e of events) if (max === undefined || precedes(max, e)) max = e;
  return max;
}
