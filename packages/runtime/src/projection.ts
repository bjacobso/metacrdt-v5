import {
  compareEvents,
  events as logEvents,
  visible,
  type CardinalityOf,
  type Coord,
  type Event,
  type Log,
  type Value,
} from "@metacrdt/core";
import type { ProjectionRow } from "./types.js";

function rowId(event: Event): string {
  return `${event.e}\u0000${event.a}\u0000${event.id}`;
}

function isAssertWithValue(
  event: Event,
): event is Event & { e: string; a: string; v: Value } {
  return (
    event.kind === "assert" &&
    event.e !== undefined &&
    event.a !== undefined &&
    event.v !== undefined
  );
}

function projectionRow(event: Event & { e: string; a: string; v: Value }): ProjectionRow {
  return {
    id: rowId(event),
    e: event.e,
    a: event.a,
    v: event.v,
    eventId: event.id,
    validFrom: event.validFrom,
    validTo: event.validTo,
    sourceEventIds: [event.id],
  };
}

/**
 * Fold a protocol log into deterministic materialized current projection rows.
 *
 * Targets own storage and indexing, but they must not own fold semantics. This
 * helper is the shared row builder for projection-store adapters: cardinality-one
 * keeps the `≺`-max visible assert, cardinality-many keeps all visible asserts,
 * and rows are sorted by `(e, a, eventId)` for stable replacement.
 */
export function projectionRowsFromLog(
  log: Log,
  coord: Coord,
  cardinalityOf: CardinalityOf,
): ProjectionRow[] {
  const visibleByAttr = new Map<string, (Event & { e: string; a: string; v: Value })[]>();
  for (const event of logEvents(log)) {
    if (!isAssertWithValue(event) || !visible(event, coord, log)) continue;
    const key = `${event.e}\u0000${event.a}`;
    const group = visibleByAttr.get(key);
    if (group === undefined) {
      visibleByAttr.set(key, [event]);
    } else {
      group.push(event);
    }
  }

  const rows: ProjectionRow[] = [];
  for (const group of visibleByAttr.values()) {
    const sample = group[0];
    if (sample === undefined) continue;
    if (cardinalityOf(sample.a, coord, log) === "one") {
      const winner = group.reduce((best, event) =>
        compareEvents(best, event) < 0 ? event : best,
      );
      rows.push(projectionRow(winner));
    } else {
      rows.push(...group.map(projectionRow));
    }
  }

  return rows.sort((a, b) => {
    const e = a.e.localeCompare(b.e);
    if (e !== 0) return e;
    const attr = a.a.localeCompare(b.a);
    if (attr !== 0) return attr;
    return a.eventId.localeCompare(b.eventId);
  });
}
