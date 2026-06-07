// The event log: a grow-only set (G-Set) keyed by content-addressed EventId
// (SPEC §4). Merge is set union — commutative, associative, idempotent — which
// is what yields Strong Eventual Consistency. Events are only ever added.

import { Event, EventId } from "./event.js";

export type Log = ReadonlyMap<EventId, Event>;

export function emptyLog(): Log {
  return new Map();
}

export function fromEvents(events: Iterable<Event>): Log {
  const m = new Map<EventId, Event>();
  for (const e of events) m.set(e.id, e);
  return m;
}

/** Return a new log with `event` added (does not mutate the input). */
export function add(log: Log, event: Event): Log {
  const m = new Map(log);
  m.set(event.id, event);
  return m;
}

/** Union two logs (SPEC §4.3). Commutative, associative, idempotent. */
export function merge(a: Log, b: Log): Log {
  const m = new Map(a);
  for (const [id, e] of b) m.set(id, e);
  return m;
}

export function events(log: Log): Event[] {
  return [...log.values()];
}

export function has(log: Log, id: EventId): boolean {
  return log.has(id);
}
