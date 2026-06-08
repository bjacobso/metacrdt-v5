import { describe, expect, test } from "vitest";
import { fromEvents, valueOf } from "@metacrdt/core";
import {
  EventStoreService,
  applyOperation,
  applyOperationEffect,
  runtimeServicesLayer,
  versionVector,
} from "@metacrdt/runtime";
import { Effect } from "effect";
import {
  runRuntimePersistenceConformance,
  runRuntimeProjectionStoreConformance,
  runRuntimeSchedulerConformance,
  runRuntimeTransportConformance,
  runRuntimeConformance,
  type RuntimePersistenceConformanceTarget,
  type RuntimeProjectionStoreConformanceTarget,
  type RuntimeSchedulerConformanceTarget,
  type RuntimeTransportConformanceTarget,
  type RuntimeLayerConformanceTarget,
  type RuntimeFactoryOptions,
} from "@metacrdt/testkit";
import {
  createNodeHttpRequestListener,
  createNodeMemoryRuntimeLayer,
  createNodePostgresRuntimeLayer,
  createNodeMemoryRuntime,
  createNodePostgresRuntime,
  createNodeSqlLifecyclePlan,
  createNodeSqliteRuntimeLayer,
  createNodeSyncHttpHandler,
  createNodeSqliteRuntime,
  type NodeHttpIncomingMessageLike,
  type NodeHttpServerResponseLike,
  type NodePostgresClientLike,
  type NodePostgresQueryResultLike,
  type NodeSqliteDatabaseLike,
  type NodeSqliteStatementLike,
} from "./index.js";

type EventRow = {
  id: string;
  e: string | null;
  a: string | null;
  event_json: string;
};

type ProjectionRowRecord = {
  id: string;
  e: string;
  a: string;
  event_id: string;
  row_json: string;
};

class FakeSqliteDatabase implements NodeSqliteDatabaseLike {
  readonly events = new Map<string, EventRow>();
  readonly meta = new Map<string, string>();
  readonly projection = new Map<string, ProjectionRowRecord>();

  exec(_sql: string): void {}

  prepare(sql: string): NodeSqliteStatementLike {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    return {
      run: (...params: readonly unknown[]) => {
        if (normalized.startsWith("delete from") && normalized.includes("projection")) {
          this.projection.clear();
          return;
        }
        if (normalized.startsWith("insert into") && normalized.includes("row_json")) {
          const [id, e, a, eventId, rowJson] = params;
          if (
            typeof id !== "string" ||
            typeof e !== "string" ||
            typeof a !== "string" ||
            typeof eventId !== "string" ||
            typeof rowJson !== "string"
          ) {
            throw new Error("bad projection insert params");
          }
          this.projection.set(id, {
            id,
            e,
            a,
            event_id: eventId,
            row_json: rowJson,
          });
          return;
        }
        if (normalized.startsWith("insert into") && normalized.includes("event_json")) {
          const [id, e, a, eventJson] = params;
          if (typeof id !== "string" || typeof eventJson !== "string") {
            throw new Error("bad event insert params");
          }
          if (!this.events.has(id)) {
            this.events.set(id, {
              id,
              e: typeof e === "string" ? e : null,
              a: typeof a === "string" ? a : null,
              event_json: eventJson,
            });
          }
          return;
        }
        if (normalized.startsWith("update") && normalized.includes("event_json")) {
          const [eventJson, id] = params;
          if (typeof id !== "string" || typeof eventJson !== "string") {
            throw new Error("bad event update params");
          }
          const existing = this.events.get(id);
          if (existing) this.events.set(id, { ...existing, event_json: eventJson });
          return;
        }
        if (normalized.startsWith("insert or replace") && normalized.includes("value")) {
          const [key, value] = params;
          if (typeof key !== "string" || typeof value !== "string") {
            throw new Error("bad meta upsert params");
          }
          this.meta.set(key, value);
        }
      },
      get: (...params: readonly unknown[]) => {
        if (normalized.startsWith("select row_json")) {
          const [id] = params;
          return typeof id === "string" ? this.projection.get(id) : undefined;
        }
        if (normalized.startsWith("select event_json")) {
          const [id] = params;
          return typeof id === "string" ? this.events.get(id) : undefined;
        }
        if (normalized.startsWith("select value")) {
          const [key] = params;
          const value = typeof key === "string" ? this.meta.get(key) : undefined;
          return value === undefined ? undefined : { value };
        }
        return undefined;
      },
      all: (...params: readonly unknown[]) => {
        if (normalized.startsWith("select row_json")) {
          let rows = [...this.projection.values()];
          if (normalized.includes("where e = ? and a = ?")) {
            const [e, a] = params;
            rows = rows.filter((row) => row.e === e && row.a === a);
          } else if (normalized.includes("where e = ?")) {
            const [e] = params;
            rows = rows.filter((row) => row.e === e);
          } else if (normalized.includes("where a = ?")) {
            const [a] = params;
            rows = rows.filter((row) => row.a === a);
          }
          return rows.sort((a, b) => a.id.localeCompare(b.id));
        }
        let rows = [...this.events.values()];
        if (normalized.includes("where e = ? and a = ?")) {
          const [e, a] = params;
          rows = rows.filter((row) => row.e === e && row.a === a);
        } else if (normalized.includes("where e = ?")) {
          const [e] = params;
          rows = rows.filter((row) => row.e === e);
        } else if (normalized.includes("where a = ?")) {
          const [a] = params;
          rows = rows.filter((row) => row.a === a);
        }
        return rows.sort((a, b) => a.id.localeCompare(b.id));
      },
    };
  }
}

class FakePostgresClient implements NodePostgresClientLike {
  readonly events = new Map<string, EventRow>();
  readonly meta = new Map<string, string>();
  readonly projection = new Map<string, ProjectionRowRecord>();

  query(sql: string, params: readonly unknown[] = []): NodePostgresQueryResultLike {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.startsWith("create table") || normalized.startsWith("create index")) {
      return { rows: [], rowCount: null };
    }

    if (normalized.startsWith("delete from") && normalized.includes("projection")) {
      const rowCount = this.projection.size;
      this.projection.clear();
      return { rows: [], rowCount };
    }

    if (normalized.startsWith("insert into") && normalized.includes("row_json")) {
      const [id, e, a, eventId, rowJson] = params;
      if (
        typeof id !== "string" ||
        typeof e !== "string" ||
        typeof a !== "string" ||
        typeof eventId !== "string" ||
        typeof rowJson !== "string"
      ) {
        throw new Error("bad projection insert params");
      }
      this.projection.set(id, {
        id,
        e,
        a,
        event_id: eventId,
        row_json: rowJson,
      });
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith("insert into") && normalized.includes("event_json")) {
      const [id, e, a, eventJson] = params;
      if (typeof id !== "string" || typeof eventJson !== "string") {
        throw new Error("bad event insert params");
      }
      const inserted = !this.events.has(id);
      if (inserted) {
        this.events.set(id, {
          id,
          e: typeof e === "string" ? e : null,
          a: typeof a === "string" ? a : null,
          event_json: eventJson,
        });
      }
      return { rows: [], rowCount: inserted ? 1 : 0 };
    }

    if (normalized.startsWith("update") && normalized.includes("event_json")) {
      const [eventJson, id] = params;
      if (typeof id !== "string" || typeof eventJson !== "string") {
        throw new Error("bad event update params");
      }
      const existing = this.events.get(id);
      if (existing) {
        this.events.set(id, { ...existing, event_json: eventJson });
      }
      return { rows: [], rowCount: existing ? 1 : 0 };
    }

    if (normalized.startsWith("select event_json")) {
      let rows = [...this.events.values()];
      if (normalized.includes("where id = $1")) {
        const [id] = params;
        rows = typeof id === "string" ? rows.filter((row) => row.id === id) : [];
      } else if (normalized.includes("where e = $1 and a = $2")) {
        const [e, a] = params;
        rows = rows.filter((row) => row.e === e && row.a === a);
      } else if (normalized.includes("where e = $1")) {
        const [e] = params;
        rows = rows.filter((row) => row.e === e);
      } else if (normalized.includes("where a = $1")) {
        const [a] = params;
        rows = rows.filter((row) => row.a === a);
      }
      return {
        rows: rows.sort((a, b) => a.id.localeCompare(b.id)),
        rowCount: rows.length,
      };
    }

    if (normalized.startsWith("select row_json")) {
      let rows = [...this.projection.values()];
      if (normalized.includes("where id = $1")) {
        const [id] = params;
        rows = typeof id === "string" ? rows.filter((row) => row.id === id) : [];
      } else if (normalized.includes("where e = $1 and a = $2")) {
        const [e, a] = params;
        rows = rows.filter((row) => row.e === e && row.a === a);
      } else if (normalized.includes("where e = $1")) {
        const [e] = params;
        rows = rows.filter((row) => row.e === e);
      } else if (normalized.includes("where a = $1")) {
        const [a] = params;
        rows = rows.filter((row) => row.a === a);
      }
      return {
        rows: rows.sort((a, b) => a.id.localeCompare(b.id)),
        rowCount: rows.length,
      };
    }

    if (normalized.startsWith("insert into") && normalized.includes("value")) {
      const [key, value] = params;
      if (typeof key !== "string" || typeof value !== "string") {
        throw new Error("bad meta upsert params");
      }
      this.meta.set(key, value);
      return { rows: [], rowCount: 1 };
    }

    if (normalized.startsWith("select value")) {
      const [key] = params;
      const value = typeof key === "string" ? this.meta.get(key) : undefined;
      return {
        rows: value === undefined ? [] : [{ value }],
        rowCount: value === undefined ? 0 : 1,
      };
    }

    throw new Error(`unhandled fake postgres query: ${sql}`);
  }
}

class FakeIncomingMessage implements NodeHttpIncomingMessageLike {
  constructor(
    readonly method: string,
    readonly url: string,
    private readonly chunks: readonly (string | Uint8Array)[] = [],
  ) {}

  async *[Symbol.asyncIterator](): AsyncIterator<string | Uint8Array> {
    yield* this.chunks;
  }
}

class FakeServerResponse implements NodeHttpServerResponseLike {
  statusCode = 0;
  headers: Record<string, string> = {};
  body = "";

  setHeader(name: string, value: string): void {
    this.headers[name.toLowerCase()] = value;
  }

  end(body = ""): void {
    this.body = body;
  }
}

function ascii(s: string): Uint8Array {
  return new Uint8Array([...s].map((ch) => ch.charCodeAt(0)));
}

const memoryTarget: RuntimeLayerConformanceTarget = {
  name: "node-memory",
  createLayer(options: RuntimeFactoryOptions) {
    return createNodeMemoryRuntimeLayer({
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const memoryProjectionStoreTarget: RuntimeProjectionStoreConformanceTarget = {
  name: "node-memory-projection-store",
  createLayer(options: RuntimeFactoryOptions) {
    return createNodeMemoryRuntimeLayer({
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const memorySchedulerTarget = (): RuntimeSchedulerConformanceTarget => {
  let runtime: ReturnType<typeof createNodeMemoryRuntime> | undefined;
  return {
    name: "node-memory-scheduler",
    resetScheduler() {
      runtime = undefined;
    },
    createLayer(options: RuntimeFactoryOptions) {
      runtime = createNodeMemoryRuntime({
        replicaId: options.replicaId,
        wall: options.wall,
      });
      return runtimeServicesLayer(runtime);
    },
    readScheduled() {
      return runtime?.scheduler.scheduled ?? [];
    },
  };
};

const memoryTransportTarget = (): RuntimeTransportConformanceTarget => {
  let runtime: ReturnType<typeof createNodeMemoryRuntime> | undefined;
  return {
    name: "node-memory-transport",
    resetTransport() {
      runtime = undefined;
    },
    createLayer(options: RuntimeFactoryOptions) {
      runtime = createNodeMemoryRuntime({
        replicaId: options.replicaId,
        wall: options.wall,
      });
      return runtimeServicesLayer(runtime);
    },
    readPublished() {
      return runtime?.transport.published ?? [];
    },
  };
};

const sqliteTarget: RuntimeLayerConformanceTarget = {
  name: "node-sqlite",
  createLayer(options: RuntimeFactoryOptions) {
    return createNodeSqliteRuntimeLayer({
      db: new FakeSqliteDatabase(),
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const sqliteProjectionStoreTarget: RuntimeProjectionStoreConformanceTarget = {
  name: "node-sqlite-projection-store",
  createLayer(options: RuntimeFactoryOptions) {
    return createNodeSqliteRuntimeLayer({
      db: new FakeSqliteDatabase(),
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const postgresTarget: RuntimeLayerConformanceTarget = {
  name: "node-postgres",
  createLayer(options: RuntimeFactoryOptions) {
    return createNodePostgresRuntimeLayer({
      client: new FakePostgresClient(),
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const postgresProjectionStoreTarget: RuntimeProjectionStoreConformanceTarget = {
  name: "node-postgres-projection-store",
  createLayer(options: RuntimeFactoryOptions) {
    return createNodePostgresRuntimeLayer({
      client: new FakePostgresClient(),
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const sqlitePersistenceTarget = (): RuntimePersistenceConformanceTarget => {
  const db = new FakeSqliteDatabase();
  return {
    name: "node-sqlite-persistence",
    resetPersistence() {
      db.events.clear();
      db.meta.clear();
    },
    createLayer(options: RuntimeFactoryOptions) {
      return createNodeSqliteRuntimeLayer({
        db,
        replicaId: options.replicaId,
        wall: options.wall,
      });
    },
  };
};

const postgresPersistenceTarget = (): RuntimePersistenceConformanceTarget => {
  const client = new FakePostgresClient();
  return {
    name: "node-postgres-persistence",
    resetPersistence() {
      client.events.clear();
      client.meta.clear();
    },
    createLayer(options: RuntimeFactoryOptions) {
      return createNodePostgresRuntimeLayer({
        client,
        replicaId: options.replicaId,
        wall: options.wall,
      });
    },
  };
};

const coord = { txTime: 10_000, validTime: 10_000 };
const one = () => "one" as const;

function layerWriteProgram(e: string) {
  return Effect.gen(function* () {
    const event = yield* applyOperationEffect({
      op: "assert",
      e,
      a: "status",
      v: "ready",
      actor: "test",
      actorType: "system",
    });
    const store = yield* EventStoreService;
    return { event, stored: yield* store.get(event.id), events: yield* store.scan() };
  });
}

describe("@metacrdt/node target", () => {
  test("SQL lifecycle plan validates names and emits shared table/index DDL", () => {
    const sqlite = createNodeSqlLifecyclePlan({
      dialect: "sqlite",
      tablePrefix: "tenant_a",
    });
    const postgres = createNodeSqlLifecyclePlan({
      dialect: "postgres",
      tablePrefix: "tenant_a",
    });

    expect(sqlite.tables).toEqual({
      events: '"tenant_a_events"',
      meta: '"tenant_a_meta"',
      projection: '"tenant_a_projection"',
    });
    expect(sqlite.indexes).toEqual({
      eventsByEntity: '"tenant_a_events_by_e"',
      eventsByAttribute: '"tenant_a_events_by_a"',
      projectionByEntity: '"tenant_a_projection_by_e"',
      projectionByAttribute: '"tenant_a_projection_by_a"',
      projectionByEventId: '"tenant_a_projection_by_event_id"',
    });
    expect(sqlite.initializeStatements).toEqual(postgres.initializeStatements);
    expect(sqlite.initializeStatements).toEqual([
      'CREATE TABLE IF NOT EXISTS "tenant_a_events" (id TEXT PRIMARY KEY NOT NULL, e TEXT, a TEXT, event_json TEXT NOT NULL)',
      'CREATE INDEX IF NOT EXISTS "tenant_a_events_by_e" ON "tenant_a_events" (e)',
      'CREATE INDEX IF NOT EXISTS "tenant_a_events_by_a" ON "tenant_a_events" (a)',
      'CREATE TABLE IF NOT EXISTS "tenant_a_projection" (id TEXT PRIMARY KEY NOT NULL, e TEXT NOT NULL, a TEXT NOT NULL, event_id TEXT NOT NULL, row_json TEXT NOT NULL)',
      'CREATE INDEX IF NOT EXISTS "tenant_a_projection_by_e" ON "tenant_a_projection" (e)',
      'CREATE INDEX IF NOT EXISTS "tenant_a_projection_by_a" ON "tenant_a_projection" (a)',
      'CREATE INDEX IF NOT EXISTS "tenant_a_projection_by_event_id" ON "tenant_a_projection" (event_id)',
      'CREATE TABLE IF NOT EXISTS "tenant_a_meta" (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)',
    ]);

    expect(() =>
      createNodeSqlLifecyclePlan({ tablePrefix: "tenant-a" }),
    ).toThrow("invalid SQL identifier: tenant-a_events");
  });

  test("node memory runtime passes shared conformance", async () => {
    await expect(runRuntimeConformance(memoryTarget)).resolves.toMatchObject({
      target: "node-memory",
      checks: expect.arrayContaining([
        "append-idempotent",
        "deterministic-fold-convergence",
        "idempotent-second-sync",
      ]),
    });
  });

  test("node memory runtime provides an Effect Layer", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        layerWriteProgram("node:memory-layer"),
        createNodeMemoryRuntimeLayer({
          replicaId: "node:memory-layer",
          wall: () => 1_000,
        }),
      ),
    );
    expect(result.stored).toEqual(result.event);
    expect(result.event.seq).toBe(1);
    expect(versionVector(result.events)).toEqual({ "node:memory-layer": 1 });
  });

  test("node memory runtime passes projection-store conformance", async () => {
    await expect(
      runRuntimeProjectionStoreConformance(memoryProjectionStoreTarget),
    ).resolves.toEqual({
      target: "node-memory-projection-store",
      checks: [
        "projection-store-replace-from-fold",
        "projection-store-scan-filters",
        "projection-store-replace-is-atomic",
        "projection-store-clear",
      ],
    });
  });

  test("node memory scheduler passes shared scheduler conformance", async () => {
    await expect(
      runRuntimeSchedulerConformance(memorySchedulerTarget()),
    ).resolves.toEqual({
      target: "node-memory-scheduler",
      checks: [
        "scheduler-accepts-operations",
        "scheduler-preserves-delay-order",
        "scheduler-preserves-payloads",
      ],
    });
  });

  test("node memory transport passes shared transport conformance", async () => {
    await expect(
      runRuntimeTransportConformance(memoryTransportTarget()),
    ).resolves.toEqual({
      target: "node-memory-transport",
      checks: [
        "transport-accepts-batches",
        "transport-preserves-batches",
        "transport-preserves-event-order",
      ],
    });
  });

  test("node SQLite runtime passes shared conformance", async () => {
    await expect(runRuntimeConformance(sqliteTarget)).resolves.toMatchObject({
      target: "node-sqlite",
      checks: expect.arrayContaining([
        "append-idempotent",
        "deterministic-fold-convergence",
        "idempotent-second-sync",
      ]),
    });
  });

  test("node SQLite runtime passes projection-store conformance", async () => {
    await expect(
      runRuntimeProjectionStoreConformance(sqliteProjectionStoreTarget),
    ).resolves.toEqual({
      target: "node-sqlite-projection-store",
      checks: [
        "projection-store-replace-from-fold",
        "projection-store-scan-filters",
        "projection-store-replace-is-atomic",
        "projection-store-clear",
      ],
    });
  });

  test("node Postgres runtime passes shared conformance", async () => {
    await expect(runRuntimeConformance(postgresTarget)).resolves.toMatchObject({
      target: "node-postgres",
      checks: expect.arrayContaining([
        "append-idempotent",
        "deterministic-fold-convergence",
        "idempotent-second-sync",
      ]),
    });
  });

  test("node Postgres runtime passes projection-store conformance", async () => {
    await expect(
      runRuntimeProjectionStoreConformance(postgresProjectionStoreTarget),
    ).resolves.toEqual({
      target: "node-postgres-projection-store",
      checks: [
        "projection-store-replace-from-fold",
        "projection-store-scan-filters",
        "projection-store-replace-is-atomic",
        "projection-store-clear",
      ],
    });
  });

  test("node SQLite runtime passes shared persistence conformance", async () => {
    await expect(
      runRuntimePersistenceConformance(sqlitePersistenceTarget()),
    ).resolves.toMatchObject({
      target: "node-sqlite-persistence",
      checks: expect.arrayContaining([
        "event-log-survives-recreate",
        "sequencer-survives-recreate",
        "hlc-survives-recreate",
      ]),
    });
  });

  test("node Postgres runtime passes shared persistence conformance", async () => {
    await expect(
      runRuntimePersistenceConformance(postgresPersistenceTarget()),
    ).resolves.toMatchObject({
      target: "node-postgres-persistence",
      checks: expect.arrayContaining([
        "event-log-survives-recreate",
        "sequencer-survives-recreate",
        "hlc-survives-recreate",
      ]),
    });
  });

  test("SQLite runtime persists event log, HLC, and seq across recreation", async () => {
    const db = new FakeSqliteDatabase();
    const first = await createNodeSqliteRuntime({
      db,
      replicaId: "node:sqlite",
      wall: () => 500,
    });
    const active = await applyOperation(first, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });
    expect(active.seq).toBe(1);

    const second = await createNodeSqliteRuntime({
      db,
      replicaId: "node:sqlite",
      wall: () => 500,
    });
    expect(second.clock.current()).toEqual({ pt: 500, l: 0, r: "node:sqlite" });
    expect(second.sequencer.current()).toBe(1);
    expect(await second.store.get(active.id)).toEqual(active);

    const terminated = await applyOperation(second, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "terminated",
      actor: "user:1",
    });
    expect(terminated.seq).toBe(2);
    expect(terminated.hlc).toEqual({ pt: 500, l: 1, r: "node:sqlite" });

    const third = await createNodeSqliteRuntime({
      db,
      replicaId: "node:sqlite",
      wall: () => 500,
    });
    const log = fromEvents(await third.store.scan());
    expect(valueOf("worker:maria", "worker.status", coord, log, one)).toBe(
      "terminated",
    );
    expect(versionVector(await third.store.scan())).toEqual({ "node:sqlite": 2 });
  });

  test("SQLite runtime initializes through the shared SQL lifecycle plan", async () => {
    const statements: string[] = [];
    const db = new FakeSqliteDatabase();
    db.exec = (sql: string) => {
      statements.push(sql);
    };

    await createNodeSqliteRuntime({
      db,
      replicaId: "node:sqlite-custom",
      tablePrefix: "tenant_a",
    });

    expect(statements).toEqual(
      createNodeSqlLifecyclePlan({
        dialect: "sqlite",
        tablePrefix: "tenant_a",
      }).initializeStatements,
    );
  });

  test("node SQLite runtime provides an Effect Layer", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        layerWriteProgram("node:sqlite-layer"),
        createNodeSqliteRuntimeLayer({
          db: new FakeSqliteDatabase(),
          replicaId: "node:sqlite-layer",
          wall: () => 1_100,
        }),
      ),
    );
    expect(result.stored).toEqual(result.event);
    expect(result.event.seq).toBe(1);
    expect(versionVector(result.events)).toEqual({ "node:sqlite-layer": 1 });
  });

  test("Postgres runtime persists event log, HLC, and seq across recreation", async () => {
    const client = new FakePostgresClient();
    const first = await createNodePostgresRuntime({
      client,
      replicaId: "node:postgres",
      wall: () => 700,
    });
    const active = await applyOperation(first, {
      op: "assert",
      e: "worker:post",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });
    expect(active.seq).toBe(1);

    const second = await createNodePostgresRuntime({
      client,
      replicaId: "node:postgres",
      wall: () => 700,
    });
    expect(second.clock.current()).toEqual({ pt: 700, l: 0, r: "node:postgres" });
    expect(second.sequencer.current()).toBe(1);
    expect(await second.store.get(active.id)).toEqual(active);

    const terminated = await applyOperation(second, {
      op: "assert",
      e: "worker:post",
      a: "worker.status",
      v: "terminated",
      actor: "user:1",
    });
    expect(terminated.seq).toBe(2);
    expect(terminated.hlc).toEqual({ pt: 700, l: 1, r: "node:postgres" });

    const third = await createNodePostgresRuntime({
      client,
      replicaId: "node:postgres",
      wall: () => 700,
    });
    const log = fromEvents(await third.store.scan());
    expect(valueOf("worker:post", "worker.status", coord, log, one)).toBe(
      "terminated",
    );
    expect(versionVector(await third.store.scan())).toEqual({ "node:postgres": 2 });
  });

  test("Postgres runtime initializes through the shared SQL lifecycle plan", async () => {
    const statements: string[] = [];
    const client = new FakePostgresClient();
    const original = client.query.bind(client);
    client.query = (sql, params) => {
      if (sql.toLowerCase().startsWith("create ")) statements.push(sql);
      return original(sql, params);
    };

    await createNodePostgresRuntime({
      client,
      replicaId: "node:postgres-custom",
      tablePrefix: "tenant_b",
    });

    expect(statements).toEqual(
      createNodeSqlLifecyclePlan({
        dialect: "postgres",
        tablePrefix: "tenant_b",
      }).initializeStatements,
    );
  });

  test("node Postgres runtime provides an Effect Layer", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        layerWriteProgram("node:postgres-layer"),
        createNodePostgresRuntimeLayer({
          client: new FakePostgresClient(),
          replicaId: "node:postgres-layer",
          wall: () => 1_200,
        }),
      ),
    );
    expect(result.stored).toEqual(result.event);
    expect(result.event.seq).toBe(1);
    expect(versionVector(result.events)).toEqual({ "node:postgres-layer": 1 });
  });

  test("HTTP sync handler exposes health, delta pull, and event push", async () => {
    const a = createNodeMemoryRuntime({
      replicaId: "node:a",
      wall: () => 1_000,
    });
    const b = createNodeMemoryRuntime({
      replicaId: "node:b",
      wall: () => 2_000,
    });
    const event = await applyOperation(a, {
      op: "assert",
      e: "case:1",
      a: "case.status",
      v: "open",
      actor: "user:1",
    });
    const serveA = createNodeSyncHttpHandler(a, { basePath: "/sync" });
    const serveB = createNodeSyncHttpHandler(b, { basePath: "/sync" });

    const health = await serveA({ method: "GET", url: "https://node.test/sync/health" });
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toMatchObject({
      ok: true,
      protocol: "metacrdt.node.http.v1",
      profile: { replicaId: "node:a" },
      vv: { "node:a": 1 },
    });

    const delta = await serveA({
      method: "GET",
      url: `/sync/events?vv=${encodeURIComponent(JSON.stringify({}))}`,
    });
    expect(delta.status).toBe(200);
    const parsedDelta = JSON.parse(delta.body) as { events: unknown[] };
    expect(parsedDelta.events).toHaveLength(1);

    const pushed = await serveB({
      method: "POST",
      url: "/sync/events",
      body: { events: parsedDelta.events },
    });
    expect(pushed.status).toBe(200);
    expect(JSON.parse(pushed.body)).toMatchObject({
      inserted: 1,
      seen: 1,
      vv: { "node:a": 1 },
    });
    expect(await b.store.get(event.id)).toEqual(event);
  });

  test("HTTP sync handler returns a one-shot SSE delta", async () => {
    const runtime = createNodeMemoryRuntime({
      replicaId: "node:sse",
      wall: () => 3_000,
    });
    await applyOperation(runtime, {
      op: "assert",
      e: "task:1",
      a: "task.status",
      v: "open",
      actor: "user:1",
    });

    const response = await createNodeSyncHttpHandler(runtime)({
      method: "GET",
      url: "/metacrdt/events/sse",
    });
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toBe("text/event-stream");
    expect(response.body).toContain("event: delta\n");
    expect(response.body).toContain('"from":"node:sse"');
    expect(response.body).toContain('"events":[');
  });

  test("node:http-style listener writes status, headers, and body", async () => {
    const runtime = createNodeMemoryRuntime({
      replicaId: "node:listener",
      wall: () => 4_000,
    });
    const listener = createNodeHttpRequestListener(runtime, { basePath: "/sync" });

    const res = new FakeServerResponse();
    const returned = await listener(
      new FakeIncomingMessage("GET", "/sync/health"),
      res,
    );

    expect(returned.status).toBe(200);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(JSON.parse(res.body)).toMatchObject({
      ok: true,
      profile: { replicaId: "node:listener" },
    });

    const head = new FakeServerResponse();
    await listener(new FakeIncomingMessage("HEAD", "/sync/health"), head);
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe("");
  });

  test("node:http-style listener streams POST body into remote merge", async () => {
    const a = createNodeMemoryRuntime({
      replicaId: "node:source",
      wall: () => 5_000,
    });
    const b = createNodeMemoryRuntime({
      replicaId: "node:sink",
      wall: () => 6_000,
    });
    const event = await applyOperation(a, {
      op: "assert",
      e: "ticket:1",
      a: "ticket.status",
      v: "open",
      actor: "user:1",
    });
    const listener = createNodeHttpRequestListener(b, { basePath: "/sync" });
    const body = JSON.stringify({ events: [event] });
    const res = new FakeServerResponse();

    await listener(
      new FakeIncomingMessage("POST", "/sync/events", [
        ascii(body.slice(0, 24)),
        ascii(body.slice(24)),
      ]),
      res,
    );

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toMatchObject({
      inserted: 1,
      seen: 1,
      vv: { "node:source": 1 },
    });
    expect(await b.store.get(event.id)).toEqual(event);
  });
});
