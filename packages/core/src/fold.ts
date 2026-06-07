// The deterministic bitemporal fold (SPEC §5.3–5.4). Pure functions of (log,
// coordinate): given the same log, every replica computes the same projection at
// the same coordinate — convergence as a projection, not a destructive merge.

import { Event, EventId } from "./event.js";
import { Log, events as logEvents } from "./log.js";
import { maxByOrder } from "./order.js";

export interface Coord {
  readonly txTime: number;
  readonly validTime: number;
}

export interface Flags {
  readonly includeRetracted?: boolean;
  readonly includeTombstoned?: boolean;
}

/** Cardinality of an attribute at a coordinate (provided by @metacrdt/schema). */
export type CardinalityOf = (a: string, c: Coord, log: Log) => "one" | "many";

function actedOn(
  all: readonly Event[],
  kind: Event["kind"],
  target: EventId,
  byTx: number,
): Event[] {
  return all.filter((x) => x.kind === kind && x.target === target && x.hlc.pt <= byTx);
}

/** Is assert A tombstoned (and not subsequently untombstoned) as of txTime? */
function tombstoned(all: readonly Event[], a: Event, txTime: number): boolean {
  const tombs = actedOn(all, "tombstone", a.id, txTime);
  if (tombs.length === 0) return false;
  const untombs = actedOn(all, "untombstone", a.id, txTime);
  // Tombstoned unless some untombstone strictly follows the latest tombstone.
  const latestTomb = Math.max(...tombs.map((t) => t.hlc.pt));
  return !untombs.some((u) => u.hlc.pt > latestTomb);
}

/** The bitemporal visibility predicate (SPEC §5.3). */
export function visible(a: Event, c: Coord, log: Log, f: Flags = {}): boolean {
  if (a.kind !== "assert") return false;
  if (a.hlc.pt > c.txTime) return false;
  const all = logEvents(log);
  if (!f.includeRetracted && actedOn(all, "retract", a.id, c.txTime).length > 0)
    return false;
  if (!f.includeTombstoned && tombstoned(all, a, c.txTime)) return false;
  if (a.validFrom !== undefined && a.validFrom > c.validTime) return false;
  if (a.validTo !== undefined && a.validTo !== null && c.validTime >= a.validTo)
    return false;
  return true;
}

/** All visible assert events for `(e, a)` at coordinate `c`. */
export function visibleAsserts(
  e: string,
  a: string,
  c: Coord,
  log: Log,
  f?: Flags,
): Event[] {
  return logEvents(log).filter(
    (ev) => ev.kind === "assert" && ev.e === e && ev.a === a && visible(ev, c, log, f),
  );
}

/**
 * The current value(s) of `(e, a)` at coordinate `c`. For cardinality-`one`,
 * the ≺-maximal visible assert (deterministic, order-independent — SPEC §5.2);
 * for cardinality-`many`, all visible asserts.
 */
export function value(
  e: string,
  a: string,
  c: Coord,
  log: Log,
  cardinalityOf: CardinalityOf,
  f?: Flags,
): Event | Event[] | undefined {
  const cands = visibleAsserts(e, a, c, log, f);
  if (cardinalityOf(a, c, log) === "one") return maxByOrder(cands);
  return cands;
}

/** The current value(s) of `(e, a)` as raw value(s), dropping event wrapping. */
export function valueOf(
  e: string,
  a: string,
  c: Coord,
  log: Log,
  cardinalityOf: CardinalityOf,
  f?: Flags,
): unknown {
  const r = value(e, a, c, log, cardinalityOf, f);
  if (r === undefined) return undefined;
  return Array.isArray(r) ? r.map((ev) => ev.v) : r.v;
}

/** The full attribute map of an entity at a coordinate. */
export function entity(
  e: string,
  c: Coord,
  log: Log,
  cardinalityOf: CardinalityOf,
  f?: Flags,
): Record<string, Event | Event[]> {
  const attrs = new Set<string>();
  for (const ev of logEvents(log)) {
    if (ev.kind === "assert" && ev.e === e && ev.a !== undefined && visible(ev, c, log, f))
      attrs.add(ev.a);
  }
  const out: Record<string, Event | Event[]> = {};
  for (const a of attrs) {
    const r = value(e, a, c, log, cardinalityOf, f);
    if (r !== undefined) out[a] = r;
  }
  return out;
}
