import type { Event, EventId } from "@metacrdt/core";
import type { ProjectionRow } from "@metacrdt/runtime";
import type {
  DurableObjectSqlCursorLike,
  DurableObjectSqlStorageLike,
} from "./durableObjectSqlite.js";

type StoredEvent = {
  id: string;
  e: string | null;
  a: string | null;
  event_json: string;
};

type StoredProjectionRow = {
  id: string;
  e: string;
  a: string;
  event_id: string;
  row_json: string;
};

function cursor(rows: unknown[] = []): DurableObjectSqlCursorLike {
  return {
    toArray: () => rows,
    *[Symbol.iterator]() {
      yield* rows;
    },
  };
}

function normalize(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

function stringBinding(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`expected string binding for ${name}`);
  }
  return value;
}

function nullableStringBinding(value: unknown, name: string): string | null {
  if (value === null) return null;
  return stringBinding(value, name);
}

/**
 * Narrow fake for the structural Cloudflare DO SQLite API. It supports only the
 * exact statement families emitted by `durableObjectSqlite.ts`, which keeps tests
 * honest without pulling in Worker types or a native SQLite dependency.
 */
export class FakeDurableObjectSqlStorage implements DurableObjectSqlStorageLike {
  readonly events = new Map<string, StoredEvent>();
  readonly projection = new Map<string, StoredProjectionRow>();
  readonly meta = new Map<string, string>();

  exec(query: string, ...bindings: readonly unknown[]): DurableObjectSqlCursorLike {
    const sql = normalize(query);
    if (sql.startsWith("create table") || sql.startsWith("create index")) {
      return cursor();
    }

    if (sql.includes("_events")) return this.execEvents(sql, bindings);
    if (sql.includes("_projection")) return this.execProjection(sql, bindings);
    if (sql.includes("_meta")) return this.execMeta(sql, bindings);

    throw new Error(`unsupported fake SQL: ${query}`);
  }

  putStoredEvent(event: Event | (Event & { id: string })): void {
    this.events.set(event.id, {
      id: event.id,
      e: event.e ?? null,
      a: event.a ?? null,
      event_json: JSON.stringify(event),
    });
  }

  putProjectionRow(row: ProjectionRow): void {
    this.projection.set(row.id, {
      id: row.id,
      e: row.e,
      a: row.a,
      event_id: row.eventId,
      row_json: JSON.stringify(row),
    });
  }

  private execEvents(
    sql: string,
    bindings: readonly unknown[],
  ): DurableObjectSqlCursorLike {
    if (sql.startsWith("insert into")) {
      const [idRaw, eRaw, aRaw, jsonRaw] = bindings;
      const id = stringBinding(idRaw, "event id");
      this.events.set(id, {
        id,
        e: nullableStringBinding(eRaw, "event e"),
        a: nullableStringBinding(aRaw, "event a"),
        event_json: stringBinding(jsonRaw, "event_json"),
      });
      return cursor();
    }

    if (sql.startsWith("update")) {
      const [jsonRaw, idRaw] = bindings;
      const id = stringBinding(idRaw, "event id");
      const existing = this.events.get(id);
      if (existing) {
        this.events.set(id, {
          ...existing,
          event_json: stringBinding(jsonRaw, "event_json"),
        });
      }
      return cursor();
    }

    if (sql.includes("where id = ?")) {
      const row = this.events.get(stringBinding(bindings[0], "event id"));
      return cursor(row === undefined ? [] : [{ event_json: row.event_json }]);
    }

    let rows = [...this.events.values()];
    if (sql.includes("where e = ? and a = ?")) {
      const e = stringBinding(bindings[0], "event e");
      const a = stringBinding(bindings[1], "event a");
      rows = rows.filter((row) => row.e === e && row.a === a);
    } else if (sql.includes("where e = ?")) {
      const e = stringBinding(bindings[0], "event e");
      rows = rows.filter((row) => row.e === e);
    } else if (sql.includes("where a = ?")) {
      const a = stringBinding(bindings[0], "event a");
      rows = rows.filter((row) => row.a === a);
    }
    return cursor(
      rows
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((row) => ({ event_json: row.event_json })),
    );
  }

  private execProjection(
    sql: string,
    bindings: readonly unknown[],
  ): DurableObjectSqlCursorLike {
    if (sql.startsWith("delete from")) {
      this.projection.clear();
      return cursor();
    }

    if (sql.startsWith("insert into")) {
      const [idRaw, eRaw, aRaw, eventIdRaw, jsonRaw] = bindings;
      const id = stringBinding(idRaw, "projection id");
      this.projection.set(id, {
        id,
        e: stringBinding(eRaw, "projection e"),
        a: stringBinding(aRaw, "projection a"),
        event_id: stringBinding(eventIdRaw, "projection event_id"),
        row_json: stringBinding(jsonRaw, "row_json"),
      });
      return cursor();
    }

    if (sql.includes("where id = ?")) {
      const row = this.projection.get(stringBinding(bindings[0], "projection id"));
      return cursor(row === undefined ? [] : [{ row_json: row.row_json }]);
    }

    let rows = [...this.projection.values()];
    if (sql.includes("where e = ? and a = ?")) {
      const e = stringBinding(bindings[0], "projection e");
      const a = stringBinding(bindings[1], "projection a");
      rows = rows.filter((row) => row.e === e && row.a === a);
    } else if (sql.includes("where e = ?")) {
      const e = stringBinding(bindings[0], "projection e");
      rows = rows.filter((row) => row.e === e);
    } else if (sql.includes("where a = ?")) {
      const a = stringBinding(bindings[0], "projection a");
      rows = rows.filter((row) => row.a === a);
    }
    return cursor(
      rows
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((row) => ({ row_json: row.row_json })),
    );
  }

  private execMeta(
    sql: string,
    bindings: readonly unknown[],
  ): DurableObjectSqlCursorLike {
    if (sql.startsWith("select")) {
      const value = this.meta.get(stringBinding(bindings[0], "meta key"));
      return cursor(value === undefined ? [] : [{ value }]);
    }

    if (sql.startsWith("insert into")) {
      this.meta.set(
        stringBinding(bindings[0], "meta key"),
        stringBinding(bindings[1], "meta value"),
      );
      return cursor();
    }

    throw new Error(`unsupported fake meta SQL: ${sql}`);
  }
}

