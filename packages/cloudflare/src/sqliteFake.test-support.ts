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
  reminded_at: number | null;
  escalated_at: number | null;
  expired_at: number | null;
  data_json: string | null;
  run_id: string | null;
  step_id: string | null;
  scope: string | null;
};

type StoredCollectionTick = {
  id: string;
  collection_token: string;
  phase: "reminder" | "escalation" | "expire";
  fire_at: number;
  status: "pending" | "fired" | "skipped";
  scheduled_at: number;
  fired_at: number | null;
  reason: string | null;
};

type StoredFlowWaitTick = {
  id: string;
  run_id: string;
  step_id: string;
  event_id: string;
  fire_at: number;
  status: "pending" | "fired" | "skipped";
  scheduled_at: number;
  fired_at: number | null;
  reason: string | null;
};

type StoredDagRun = {
  run_id: string;
  flow_def_name: string;
  subject: string;
  status: "running" | "waiting" | "completed" | "unsupported";
  current_step_id: string | null;
  started_at: number;
  updated_at: number;
  completed_at: number | null;
  context_json: string | null;
};

type StoredDagEvent = {
  event_id: string;
  run_id: string;
  ts: number;
  step_id: string;
  type: string;
  kind: string;
  message: string | null;
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

function collectionTickPhaseBinding(
  value: unknown,
  name: string,
): StoredCollectionTick["phase"] {
  if (value === "reminder" || value === "escalation" || value === "expire") {
    return value;
  }
  throw new Error(`expected collection tick phase binding for ${name}`);
}

function collectionTickStatusBinding(
  value: unknown,
  name: string,
): StoredCollectionTick["status"] {
  if (value === "pending" || value === "fired" || value === "skipped") {
    return value;
  }
  throw new Error(`expected collection tick status binding for ${name}`);
}

function flowWaitTickStatusBinding(
  value: unknown,
  name: string,
): StoredFlowWaitTick["status"] {
  if (value === "pending" || value === "fired" || value === "skipped") {
    return value;
  }
  throw new Error(`expected flow wait tick status binding for ${name}`);
}

function dagRunStatusBinding(value: unknown, name: string): StoredDagRun["status"] {
  if (
    value === "running" ||
    value === "waiting" ||
    value === "completed" ||
    value === "unsupported"
  ) {
    return value;
  }
  throw new Error(`expected DAG run status binding for ${name}`);
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
  readonly collectionTicks = new Map<string, StoredCollectionTick>();
  readonly flowWaitTicks = new Map<string, StoredFlowWaitTick>();
  readonly dagRuns = new Map<string, StoredDagRun>();
  readonly dagEvents = new Map<string, StoredDagEvent>();
  readonly meta = new Map<string, string>();
  projectionDeleteAllCount = 0;
  projectionDeleteMatchingCount = 0;
  eventFullScanCount = 0;
  eventTargetScanCount = 0;

  exec(query: string, ...bindings: readonly unknown[]): DurableObjectSqlCursorLike {
    const sql = normalize(query);
    if (
      sql.startsWith("create table") ||
      sql.startsWith("create index") ||
      sql.startsWith("alter table")
    ) {
      return cursor();
    }

    if (sql.includes("_flow_wait_timers")) {
      return this.execFlowWaitTicks(sql, bindings);
    }
    if (sql.includes("_timers")) return this.execCollectionTicks(sql, bindings);
    if (sql.includes("_flow_dag_events")) {
      return this.execDagEvents(sql, bindings);
    }
    if (sql.includes("_flow_dag_runs")) {
      return this.execDagRuns(sql, bindings);
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
        remindedAtRaw,
        escalatedAtRaw,
        expiredAtRaw,
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
        reminded_at: nullableNumberBinding(remindedAtRaw, "collection reminded_at"),
        escalated_at: nullableNumberBinding(
          escalatedAtRaw,
          "collection escalated_at",
        ),
        expired_at: nullableNumberBinding(expiredAtRaw, "collection expired_at"),
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

      if (sql.includes("set reminded_at = ? where token = ?")) {
        const [remindedAtRaw, tokenRaw] = bindings;
        const token = stringBinding(tokenRaw, "collection token");
        const existing = this.collections.get(token);
        if (existing) {
          this.collections.set(token, {
            ...existing,
            reminded_at: numberBinding(remindedAtRaw, "collection reminded_at"),
          });
        }
        return cursor();
      }

      if (sql.includes("set escalated_at = ? where token = ?")) {
        const [escalatedAtRaw, tokenRaw] = bindings;
        const token = stringBinding(tokenRaw, "collection token");
        const existing = this.collections.get(token);
        if (existing) {
          this.collections.set(token, {
            ...existing,
            escalated_at: numberBinding(escalatedAtRaw, "collection escalated_at"),
          });
        }
        return cursor();
      }

      if (sql.includes("set status = ?, expired_at = ? where token = ?")) {
        const [statusRaw, expiredAtRaw, tokenRaw] = bindings;
        const token = stringBinding(tokenRaw, "collection token");
        const existing = this.collections.get(token);
        if (existing) {
          this.collections.set(token, {
            ...existing,
            status: collectionStatusBinding(statusRaw, "collection status"),
            expired_at: numberBinding(expiredAtRaw, "collection expired_at"),
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

  private execCollectionTicks(
    sql: string,
    bindings: readonly unknown[],
  ): DurableObjectSqlCursorLike {
    if (sql.startsWith("insert into")) {
      const [
        idRaw,
        tokenRaw,
        phaseRaw,
        fireAtRaw,
        statusRaw,
        scheduledAtRaw,
        firedAtRaw,
        reasonRaw,
      ] = bindings;
      const id = stringBinding(idRaw, "collection tick id");
      if (this.collectionTicks.has(id)) {
        throw new Error(`collection tick already exists: ${id}`);
      }
      this.collectionTicks.set(id, {
        id,
        collection_token: stringBinding(tokenRaw, "collection tick token"),
        phase: collectionTickPhaseBinding(phaseRaw, "collection tick phase"),
        fire_at: numberBinding(fireAtRaw, "collection tick fire_at"),
        status: collectionTickStatusBinding(statusRaw, "collection tick status"),
        scheduled_at: numberBinding(scheduledAtRaw, "collection tick scheduled_at"),
        fired_at: nullableNumberBinding(firedAtRaw, "collection tick fired_at"),
        reason: nullableStringBinding(reasonRaw, "collection tick reason"),
      });
      return cursor();
    }

    if (sql.startsWith("update")) {
      const [statusRaw, firedAtRaw, reasonRaw, idRaw] = bindings;
      const id = stringBinding(idRaw, "collection tick id");
      const existing = this.collectionTicks.get(id);
      if (existing) {
        this.collectionTicks.set(id, {
          ...existing,
          status: collectionTickStatusBinding(statusRaw, "collection tick status"),
          fired_at: numberBinding(firedAtRaw, "collection tick fired_at"),
          reason: nullableStringBinding(reasonRaw, "collection tick reason"),
        });
      }
      return cursor();
    }

    let rows = [...this.collectionTicks.values()];
    if (sql.includes("where id = ?")) {
      rows = rows.filter(
        (row) => row.id === stringBinding(bindings[0], "collection tick id"),
      );
    } else {
      let bindingIndex = 0;
      if (sql.includes("collection_token = ?")) {
        const token = stringBinding(
          bindings[bindingIndex++],
          "collection tick token",
        );
        rows = rows.filter((row) => row.collection_token === token);
      }
      if (sql.includes("phase = ?")) {
        const phase = collectionTickPhaseBinding(
          bindings[bindingIndex++],
          "collection tick phase",
        );
        rows = rows.filter((row) => row.phase === phase);
      }
      if (sql.includes("status = ?")) {
        const status = collectionTickStatusBinding(
          bindings[bindingIndex++],
          "collection tick status",
        );
        rows = rows.filter((row) => row.status === status);
      }
      if (sql.includes("fire_at <= ?")) {
        const dueAt = numberBinding(
          bindings[bindingIndex++],
          "collection tick due_at",
        );
        rows = rows.filter((row) => row.fire_at <= dueAt);
      }
    }

    return cursor(
      rows.sort((a, b) => {
        const fire = a.fire_at - b.fire_at;
        return fire !== 0 ? fire : a.id.localeCompare(b.id);
      }),
    );
  }

  private execFlowWaitTicks(
    sql: string,
    bindings: readonly unknown[],
  ): DurableObjectSqlCursorLike {
    if (sql.startsWith("insert into")) {
      const [
        idRaw,
        runIdRaw,
        stepIdRaw,
        eventIdRaw,
        fireAtRaw,
        statusRaw,
        scheduledAtRaw,
        firedAtRaw,
        reasonRaw,
      ] = bindings;
      const id = stringBinding(idRaw, "flow wait tick id");
      if (this.flowWaitTicks.has(id)) {
        throw new Error(`flow wait tick already exists: ${id}`);
      }
      this.flowWaitTicks.set(id, {
        id,
        run_id: stringBinding(runIdRaw, "flow wait tick run_id"),
        step_id: stringBinding(stepIdRaw, "flow wait tick step_id"),
        event_id: stringBinding(eventIdRaw, "flow wait tick event_id"),
        fire_at: numberBinding(fireAtRaw, "flow wait tick fire_at"),
        status: flowWaitTickStatusBinding(statusRaw, "flow wait tick status"),
        scheduled_at: numberBinding(scheduledAtRaw, "flow wait tick scheduled_at"),
        fired_at: nullableNumberBinding(firedAtRaw, "flow wait tick fired_at"),
        reason: nullableStringBinding(reasonRaw, "flow wait tick reason"),
      });
      return cursor();
    }

    if (sql.startsWith("update")) {
      const [statusRaw, firedAtRaw, reasonRaw, idRaw] = bindings;
      const id = stringBinding(idRaw, "flow wait tick id");
      const existing = this.flowWaitTicks.get(id);
      if (existing) {
        this.flowWaitTicks.set(id, {
          ...existing,
          status: flowWaitTickStatusBinding(statusRaw, "flow wait tick status"),
          fired_at: numberBinding(firedAtRaw, "flow wait tick fired_at"),
          reason: nullableStringBinding(reasonRaw, "flow wait tick reason"),
        });
      }
      return cursor();
    }

    let rows = [...this.flowWaitTicks.values()];
    if (sql.includes("where id = ?")) {
      rows = rows.filter(
        (row) => row.id === stringBinding(bindings[0], "flow wait tick id"),
      );
    } else {
      let bindingIndex = 0;
      if (sql.includes("run_id = ?")) {
        const runId = stringBinding(bindings[bindingIndex++], "flow wait run_id");
        rows = rows.filter((row) => row.run_id === runId);
      }
      if (sql.includes("step_id = ?")) {
        const stepId = stringBinding(
          bindings[bindingIndex++],
          "flow wait step_id",
        );
        rows = rows.filter((row) => row.step_id === stepId);
      }
      if (sql.includes("status = ?")) {
        const status = flowWaitTickStatusBinding(
          bindings[bindingIndex++],
          "flow wait tick status",
        );
        rows = rows.filter((row) => row.status === status);
      }
      if (sql.includes("fire_at <= ?")) {
        const dueAt = numberBinding(bindings[bindingIndex++], "flow wait due_at");
        rows = rows.filter((row) => row.fire_at <= dueAt);
      }
    }

    return cursor(
      rows.sort((a, b) => {
        const fire = a.fire_at - b.fire_at;
        return fire !== 0 ? fire : a.id.localeCompare(b.id);
      }),
    );
  }

  private execDagRuns(
    sql: string,
    bindings: readonly unknown[],
  ): DurableObjectSqlCursorLike {
    if (sql.startsWith("insert into")) {
      const [
        runIdRaw,
        flowDefNameRaw,
        subjectRaw,
        statusRaw,
        currentStepIdRaw,
        startedAtRaw,
        updatedAtRaw,
        completedAtRaw,
        contextJsonRaw,
      ] = bindings;
      const runId = stringBinding(runIdRaw, "DAG run id");
      if (this.dagRuns.has(runId)) {
        throw new Error(`DAG run already exists: ${runId}`);
      }
      this.dagRuns.set(runId, {
        run_id: runId,
        flow_def_name: stringBinding(flowDefNameRaw, "DAG flow_def_name"),
        subject: stringBinding(subjectRaw, "DAG subject"),
        status: dagRunStatusBinding(statusRaw, "DAG status"),
        current_step_id: nullableStringBinding(
          currentStepIdRaw,
          "DAG current_step_id",
        ),
        started_at: numberBinding(startedAtRaw, "DAG started_at"),
        updated_at: numberBinding(updatedAtRaw, "DAG updated_at"),
        completed_at: nullableNumberBinding(completedAtRaw, "DAG completed_at"),
        context_json: nullableStringBinding(contextJsonRaw, "DAG context_json"),
      });
      return cursor();
    }

    if (sql.startsWith("update")) {
      const [
        statusRaw,
        currentStepIdRaw,
        updatedAtRaw,
        completedAtRaw,
        contextJsonRaw,
        runIdRaw,
      ] = bindings;
      const runId = stringBinding(runIdRaw, "DAG run id");
      const existing = this.dagRuns.get(runId);
      if (existing) {
        this.dagRuns.set(runId, {
          ...existing,
          status: dagRunStatusBinding(statusRaw, "DAG status"),
          current_step_id: nullableStringBinding(
            currentStepIdRaw,
            "DAG current_step_id",
          ),
          updated_at: numberBinding(updatedAtRaw, "DAG updated_at"),
          completed_at: nullableNumberBinding(completedAtRaw, "DAG completed_at"),
          context_json: nullableStringBinding(contextJsonRaw, "DAG context_json"),
        });
      }
      return cursor();
    }

    let rows = [...this.dagRuns.values()];
    if (sql.includes("where run_id = ?")) {
      rows = rows.filter(
        (row) => row.run_id === stringBinding(bindings[0], "DAG run id"),
      );
    } else if (
      sql.includes(
        "where subject = ? and flow_def_name = ? and status in ('waiting', 'running')",
      )
    ) {
      const subject = stringBinding(bindings[0], "DAG subject");
      const flowDefName = stringBinding(bindings[1], "DAG flow_def_name");
      rows = rows.filter(
        (row) =>
          row.subject === subject &&
          row.flow_def_name === flowDefName &&
          (row.status === "waiting" || row.status === "running"),
      );
    } else {
      let bindingIndex = 0;
      if (sql.includes("subject = ?")) {
        const subject = stringBinding(bindings[bindingIndex++], "DAG subject");
        rows = rows.filter((row) => row.subject === subject);
      }
      if (sql.includes("status = ?")) {
        const status = dagRunStatusBinding(
          bindings[bindingIndex++],
          "DAG status",
        );
        rows = rows.filter((row) => row.status === status);
      }
    }

    return cursor(
      rows.sort((a, b) => {
        const updated = b.updated_at - a.updated_at;
        return updated !== 0 ? updated : b.run_id.localeCompare(a.run_id);
      }),
    );
  }

  private execDagEvents(
    sql: string,
    bindings: readonly unknown[],
  ): DurableObjectSqlCursorLike {
    if (sql.startsWith("insert into")) {
      const [
        eventIdRaw,
        runIdRaw,
        tsRaw,
        stepIdRaw,
        typeRaw,
        kindRaw,
        messageRaw,
      ] = bindings;
      const eventId = stringBinding(eventIdRaw, "DAG event id");
      if (this.dagEvents.has(eventId)) {
        throw new Error(`DAG event already exists: ${eventId}`);
      }
      this.dagEvents.set(eventId, {
        event_id: eventId,
        run_id: stringBinding(runIdRaw, "DAG event run_id"),
        ts: numberBinding(tsRaw, "DAG event ts"),
        step_id: stringBinding(stepIdRaw, "DAG event step_id"),
        type: stringBinding(typeRaw, "DAG event type"),
        kind: stringBinding(kindRaw, "DAG event kind"),
        message: nullableStringBinding(messageRaw, "DAG event message"),
      });
      return cursor();
    }

    let rows = [...this.dagEvents.values()];
    if (sql.includes("where run_id = ?")) {
      rows = rows.filter(
        (row) => row.run_id === stringBinding(bindings[0], "DAG event run_id"),
      );
    }
    return cursor(
      rows.sort((a, b) => {
        const ts = a.ts - b.ts;
        return ts !== 0 ? ts : a.event_id.localeCompare(b.event_id);
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
