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
  target: string | null;
  event_json: string;
};

type StoredProjectionRow = {
  id: string;
  e: string;
  a: string;
  event_id: string;
  row_json: string;
};

type StoredCollection = {
  token: string;
  subject: string;
  form: string;
  status: "issued" | "submitted" | "expired";
  issued_at: number;
  expires_at: number | null;
  submitted_at: number | null;
  data_json: string | null;
  run_id: string | null;
  step_id: string | null;
  scope: string | null;
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

function numberBinding(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`expected number binding for ${name}`);
  }
  return value;
}

function nullableNumberBinding(value: unknown, name: string): number | null {
  if (value === null) return null;
  return numberBinding(value, name);
}

function collectionStatusBinding(
  value: unknown,
  name: string,
): StoredCollection["status"] {
  if (value === "issued" || value === "submitted" || value === "expired") {
    return value;
  }
  throw new Error(`expected collection status binding for ${name}`);
}

/**
 * Narrow fake for the structural Cloudflare DO SQLite API. It supports only the
 * exact statement families emitted by `durableObjectSqlite.ts`, which keeps tests
 * honest without pulling in Worker types or a native SQLite dependency.
 */
export class FakeDurableObjectSqlStorage implements DurableObjectSqlStorageLike {
  readonly events = new Map<string, StoredEvent>();
  readonly projection = new Map<string, StoredProjectionRow>();
  readonly collections = new Map<string, StoredCollection>();
  readonly meta = new Map<string, string>();
  projectionDeleteAllCount = 0;
  projectionDeleteMatchingCount = 0;
  eventFullScanCount = 0;
  eventTargetScanCount = 0;

  exec(query: string, ...bindings: readonly unknown[]): DurableObjectSqlCursorLike {
    const sql = normalize(query);
    if (sql.startsWith("create table") || sql.startsWith("create index")) {
      return cursor();
    }

    if (sql.includes("_collections")) return this.execCollections(sql, bindings);
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
      target: event.target ?? null,
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
      const [idRaw, eRaw, aRaw, targetRaw, jsonRaw] = bindings;
      const id = stringBinding(idRaw, "event id");
      this.events.set(id, {
        id,
        e: nullableStringBinding(eRaw, "event e"),
        a: nullableStringBinding(aRaw, "event a"),
        target: nullableStringBinding(targetRaw, "event target"),
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
    if (sql.includes("where e = ? and a = ? and target = ?")) {
      this.eventTargetScanCount += 1;
      const e = stringBinding(bindings[0], "event e");
      const a = stringBinding(bindings[1], "event a");
      const target = stringBinding(bindings[2], "event target");
      rows = rows.filter((row) => row.e === e && row.a === a && row.target === target);
    } else if (sql.includes("where e = ? and a = ?")) {
      const e = stringBinding(bindings[0], "event e");
      const a = stringBinding(bindings[1], "event a");
      rows = rows.filter((row) => row.e === e && row.a === a);
    } else if (sql.includes("where e = ? and target = ?")) {
      this.eventTargetScanCount += 1;
      const e = stringBinding(bindings[0], "event e");
      const target = stringBinding(bindings[1], "event target");
      rows = rows.filter((row) => row.e === e && row.target === target);
    } else if (sql.includes("where a = ? and target = ?")) {
      this.eventTargetScanCount += 1;
      const a = stringBinding(bindings[0], "event a");
      const target = stringBinding(bindings[1], "event target");
      rows = rows.filter((row) => row.a === a && row.target === target);
    } else if (sql.includes("where e = ?")) {
      const e = stringBinding(bindings[0], "event e");
      rows = rows.filter((row) => row.e === e);
    } else if (sql.includes("where a = ?")) {
      const a = stringBinding(bindings[0], "event a");
      rows = rows.filter((row) => row.a === a);
    } else if (sql.includes("where target = ?")) {
      this.eventTargetScanCount += 1;
      const target = stringBinding(bindings[0], "event target");
      rows = rows.filter((row) => row.target === target);
    } else {
      this.eventFullScanCount += 1;
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
      if (sql.includes("where e = ? and a = ?")) {
        const e = stringBinding(bindings[0], "projection e");
        const a = stringBinding(bindings[1], "projection a");
        for (const [id, row] of this.projection.entries()) {
          if (row.e === e && row.a === a) this.projection.delete(id);
        }
        this.projectionDeleteMatchingCount += 1;
      } else if (sql.includes("where id = ?")) {
        this.projection.delete(stringBinding(bindings[0], "projection id"));
        this.projectionDeleteMatchingCount += 1;
      } else {
        this.projection.clear();
        this.projectionDeleteAllCount += 1;
      }
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

  private execCollections(
    sql: string,
    bindings: readonly unknown[],
  ): DurableObjectSqlCursorLike {
    if (sql.startsWith("insert into")) {
      const [
        tokenRaw,
        subjectRaw,
        formRaw,
        statusRaw,
        issuedAtRaw,
        expiresAtRaw,
        submittedAtRaw,
        dataJsonRaw,
        runIdRaw,
        stepIdRaw,
        scopeRaw,
      ] = bindings;
      const token = stringBinding(tokenRaw, "collection token");
      if (this.collections.has(token)) {
        throw new Error(`collection token already exists: ${token}`);
      }
      this.collections.set(token, {
        token,
        subject: stringBinding(subjectRaw, "collection subject"),
        form: stringBinding(formRaw, "collection form"),
        status: collectionStatusBinding(statusRaw, "collection status"),
        issued_at: numberBinding(issuedAtRaw, "collection issued_at"),
        expires_at: nullableNumberBinding(expiresAtRaw, "collection expires_at"),
        submitted_at: nullableNumberBinding(
          submittedAtRaw,
          "collection submitted_at",
        ),
        data_json: nullableStringBinding(dataJsonRaw, "collection data_json"),
        run_id: nullableStringBinding(runIdRaw, "collection run_id"),
        step_id: nullableStringBinding(stepIdRaw, "collection step_id"),
        scope: nullableStringBinding(scopeRaw, "collection scope"),
      });
      return cursor();
    }

    if (sql.startsWith("update")) {
      if (sql.includes("set status = ?, submitted_at = ?, data_json = ?")) {
        const [statusRaw, submittedAtRaw, dataJsonRaw, tokenRaw] = bindings;
        const token = stringBinding(tokenRaw, "collection token");
        const existing = this.collections.get(token);
        if (existing) {
          this.collections.set(token, {
            ...existing,
            status: collectionStatusBinding(statusRaw, "collection status"),
            submitted_at: numberBinding(
              submittedAtRaw,
              "collection submitted_at",
            ),
            data_json: nullableStringBinding(
              dataJsonRaw,
              "collection data_json",
            ),
          });
        }
        return cursor();
      }

      if (sql.includes("set status = ? where token = ?")) {
        const [statusRaw, tokenRaw] = bindings;
        const token = stringBinding(tokenRaw, "collection token");
        const existing = this.collections.get(token);
        if (existing) {
          this.collections.set(token, {
            ...existing,
            status: collectionStatusBinding(statusRaw, "collection status"),
          });
        }
        return cursor();
      }
    }

    let rows = [...this.collections.values()];
    if (sql.includes("where token = ?")) {
      rows = rows.filter(
        (row) => row.token === stringBinding(bindings[0], "collection token"),
      );
    } else if (sql.includes("where subject = ? and status = ?")) {
      const subject = stringBinding(bindings[0], "collection subject");
      const status = collectionStatusBinding(bindings[1], "collection status");
      rows = rows.filter((row) => row.subject === subject && row.status === status);
    } else if (sql.includes("where subject = ?")) {
      const subject = stringBinding(bindings[0], "collection subject");
      rows = rows.filter((row) => row.subject === subject);
    } else if (sql.includes("where status = ?")) {
      const status = collectionStatusBinding(bindings[0], "collection status");
      rows = rows.filter((row) => row.status === status);
    }

    return cursor(
      rows.sort((a, b) => {
        const issued = a.issued_at - b.issued_at;
        return issued !== 0 ? issued : a.token.localeCompare(b.token);
      }),
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
