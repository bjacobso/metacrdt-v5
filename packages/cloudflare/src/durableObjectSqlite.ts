import {
  type Event,
  type EventId,
  type Hlc,
  initialClock,
  receive,
  tick,
  verifyId,
} from "@metacrdt/core";
import {
  RuntimeServiceError,
  runtimeServicesLayer,
  type AppendResult,
  type EventFilter,
  type EventStore,
  type MergeResult,
  type ProjectionFilter,
  type ProjectionReplaceResult,
  type ProjectionRow,
  type ProjectionRuntimeServices,
  type ProjectionStore,
  type RuntimeCapability,
  type RuntimeClock,
  type RuntimeProfile,
  type RuntimeSequencer,
  type RuntimeServices,
} from "@metacrdt/runtime";
import { Effect, Layer } from "effect";

/**
 * Structural subset of Cloudflare Durable Object SQLite used by this adapter.
 *
 * Cloudflare's current API is `ctx.storage.sql.exec(query, ...bindings)`, which
 * returns a synchronous cursor. We consume cursors immediately via `toArray()` or
 * `Array.from(cursor)` before any await, matching Cloudflare's documented cursor
 * snapshot guidance while avoiding a Workers type dependency.
 */
export interface DurableObjectSqlCursorLike extends Iterable<unknown> {
  toArray?(): unknown[];
}

export interface DurableObjectSqlStorageLike {
  exec(query: string, ...bindings: readonly unknown[]): DurableObjectSqlCursorLike;
}

export type DurableObjectSqliteRuntimeOptions = {
  name?: string;
  replicaId: string;
  sql: DurableObjectSqlStorageLike;
  tablePrefix?: string;
  initialize?: boolean;
  wall?: () => number;
  capabilities?: Iterable<RuntimeCapability>;
};

export type DurableObjectSqliteRuntime = RuntimeServices & {
  store: DurableObjectSqliteEventStore;
  projection: DurableObjectSqliteProjectionStore;
  clock: DurableObjectSqliteClock;
  sequencer: DurableObjectSqliteSequencer;
};

type SqlPlan = {
  prefix: string;
  tables: {
    events: string;
    meta: string;
    projection: string;
  };
  indexes: {
    eventsByEntity: string;
    eventsByAttribute: string;
    eventsByTarget: string;
    projectionByEntity: string;
    projectionByAttribute: string;
    projectionByEventId: string;
  };
};

function identifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`invalid SQL identifier: ${name}`);
  }
  return `"${name}"`;
}

function plan(prefix = "metacrdt"): SqlPlan {
  return {
    prefix,
    tables: {
      events: identifier(`${prefix}_events`),
      meta: identifier(`${prefix}_meta`),
      projection: identifier(`${prefix}_projection`),
    },
    indexes: {
      eventsByEntity: identifier(`${prefix}_events_by_e`),
      eventsByAttribute: identifier(`${prefix}_events_by_a`),
      eventsByTarget: identifier(`${prefix}_events_by_target`),
      projectionByEntity: identifier(`${prefix}_projection_by_e`),
      projectionByAttribute: identifier(`${prefix}_projection_by_a`),
      projectionByEventId: identifier(`${prefix}_projection_by_event_id`),
    },
  };
}

function rows(cursor: DurableObjectSqlCursorLike): unknown[] {
  return cursor.toArray ? cursor.toArray() : Array.from(cursor);
}

function valueColumn(row: unknown, key: string): string | undefined {
  if (row === undefined || row === null) return undefined;
  if (typeof row === "string") return row;
  if (Array.isArray(row)) return typeof row[0] === "string" ? row[0] : undefined;
  if (typeof row === "object") {
    const value = (row as Record<string, unknown>)[key] ??
      (row as Record<string, unknown>).value;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function decodeEvent(row: unknown): Event | undefined {
  const raw = valueColumn(row, "event_json");
  if (raw === undefined) return undefined;
  const event = JSON.parse(raw) as Event;
  if (!verifyId(event)) throw new Error(`invalid stored event id: ${event.id}`);
  return event;
}

function decodeProjectionRow(row: unknown): ProjectionRow | undefined {
  const raw = valueColumn(row, "row_json");
  return raw === undefined ? undefined : (JSON.parse(raw) as ProjectionRow);
}

function eventJson(event: Event): string {
  return JSON.stringify(event);
}

function projectionRowJson(row: ProjectionRow): string {
  return JSON.stringify(row);
}

function clockKey(replicaId: string): string {
  return `clock:${replicaId}`;
}

function seqKey(replicaId: string): string {
  return `seq:${replicaId}`;
}

function isHlc(value: unknown, replicaId: string): value is Hlc {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Hlc).pt === "number" &&
    typeof (value as Hlc).l === "number" &&
    (value as Hlc).r === replicaId
  );
}

function isSeq(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export class DurableObjectSqliteEventStore implements EventStore {
  private readonly plan: SqlPlan;

  constructor(
    private readonly sql: DurableObjectSqlStorageLike,
    tablePrefix = "metacrdt",
  ) {
    this.plan = plan(tablePrefix);
  }

  async initialize(): Promise<void> {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${this.plan.tables.events} (` +
        "id TEXT PRIMARY KEY NOT NULL, " +
        "e TEXT, " +
        "a TEXT, " +
        "target TEXT, " +
        "event_json TEXT NOT NULL" +
        ")",
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.eventsByEntity} ` +
        `ON ${this.plan.tables.events} (e)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.eventsByAttribute} ` +
        `ON ${this.plan.tables.events} (a)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.eventsByTarget} ` +
        `ON ${this.plan.tables.events} (target)`,
    );
  }

  async append(event: Event): Promise<AppendResult> {
    if (!verifyId(event)) throw new Error(`invalid event id: ${event.id}`);
    const existing = await this.get(event.id);
    const inserted = existing === undefined;
    if (inserted) {
      this.sql.exec(
        `INSERT INTO ${this.plan.tables.events} (id, e, a, target, event_json) VALUES (?, ?, ?, ?, ?)`,
        event.id,
        event.e ?? null,
        event.a ?? null,
        event.target ?? null,
        eventJson(event),
      );
    } else if (existing.seq === undefined && event.seq !== undefined) {
      this.sql.exec(
        `UPDATE ${this.plan.tables.events} SET event_json = ? WHERE id = ?`,
        eventJson(event),
        event.id,
      );
    }
    return { event, inserted };
  }

  async get(id: EventId): Promise<Event | undefined> {
    return decodeEvent(
      rows(
        this.sql.exec(
          `SELECT event_json FROM ${this.plan.tables.events} WHERE id = ?`,
          id,
        ),
      )[0],
    );
  }

  async scan(filter: EventFilter = {}): Promise<Event[]> {
    if (filter.ids) {
      const out: Event[] = [];
      for (const id of new Set(filter.ids)) {
        const event = await this.get(id);
        if (!event) continue;
        if (filter.e !== undefined && event.e !== filter.e) continue;
        if (filter.a !== undefined && event.a !== filter.a) continue;
        if (filter.target !== undefined && event.target !== filter.target) continue;
        out.push(event);
      }
      return out.sort((a, b) => a.id.localeCompare(b.id));
    }

    const clauses: string[] = [];
    const bindings: unknown[] = [];
    if (filter.e !== undefined) {
      clauses.push("e = ?");
      bindings.push(filter.e);
    }
    if (filter.a !== undefined) {
      clauses.push("a = ?");
      bindings.push(filter.a);
    }
    if (filter.target !== undefined) {
      clauses.push("target = ?");
      bindings.push(filter.target);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    return rows(
      this.sql.exec(
        `SELECT event_json FROM ${this.plan.tables.events}${where} ORDER BY id`,
        ...bindings,
      ),
    )
      .map(decodeEvent)
      .filter((event): event is Event => event !== undefined);
  }

  async merge(events: Iterable<Event>): Promise<MergeResult> {
    let inserted = 0;
    let seen = 0;
    for (const event of events) {
      seen++;
      if ((await this.append(event)).inserted) inserted++;
    }
    return { inserted, seen };
  }
}

export class DurableObjectSqliteProjectionStore implements ProjectionStore {
  private readonly plan: SqlPlan;

  constructor(
    private readonly sql: DurableObjectSqlStorageLike,
    tablePrefix = "metacrdt",
  ) {
    this.plan = plan(tablePrefix);
  }

  async initialize(): Promise<void> {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${this.plan.tables.projection} (` +
        "id TEXT PRIMARY KEY NOT NULL, " +
        "e TEXT NOT NULL, " +
        "a TEXT NOT NULL, " +
        "event_id TEXT NOT NULL, " +
        "row_json TEXT NOT NULL" +
        ")",
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.projectionByEntity} ` +
        `ON ${this.plan.tables.projection} (e)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.projectionByAttribute} ` +
        `ON ${this.plan.tables.projection} (a)`,
    );
    this.sql.exec(
      `CREATE INDEX IF NOT EXISTS ${this.plan.indexes.projectionByEventId} ` +
        `ON ${this.plan.tables.projection} (event_id)`,
    );
  }

  async replace(rowsIn: Iterable<ProjectionRow>): Promise<ProjectionReplaceResult> {
    await this.clear();
    let count = 0;
    for (const row of rowsIn) {
      this.sql.exec(
        `INSERT INTO ${this.plan.tables.projection} (id, e, a, event_id, row_json) VALUES (?, ?, ?, ?, ?)`,
        row.id,
        row.e,
        row.a,
        row.eventId,
        projectionRowJson(row),
      );
      count += 1;
    }
    return { rows: count };
  }

  async replaceMatching(
    filter: ProjectionFilter,
    rowsIn: Iterable<ProjectionRow>,
  ): Promise<ProjectionReplaceResult> {
    if (
      filter.e === undefined &&
      filter.a === undefined &&
      filter.ids === undefined &&
      filter.eventIds === undefined
    ) {
      await this.clear();
    } else if (
      filter.e !== undefined &&
      filter.a !== undefined &&
      filter.ids === undefined &&
      filter.eventIds === undefined
    ) {
      this.sql.exec(
        `DELETE FROM ${this.plan.tables.projection} WHERE e = ? AND a = ?`,
        filter.e,
        filter.a,
      );
    } else {
      const matching = await this.scan(filter);
      for (const row of matching) {
        this.sql.exec(
          `DELETE FROM ${this.plan.tables.projection} WHERE id = ?`,
          row.id,
        );
      }
    }

    let count = 0;
    for (const row of rowsIn) {
      this.sql.exec(
        `INSERT INTO ${this.plan.tables.projection} (id, e, a, event_id, row_json) VALUES (?, ?, ?, ?, ?)`,
        row.id,
        row.e,
        row.a,
        row.eventId,
        projectionRowJson(row),
      );
      count += 1;
    }
    return { rows: count };
  }

  async clear(): Promise<void> {
    this.sql.exec(`DELETE FROM ${this.plan.tables.projection}`);
  }

  async scan(filter: ProjectionFilter = {}): Promise<ProjectionRow[]> {
    if (filter.ids) {
      const out: ProjectionRow[] = [];
      for (const id of new Set(filter.ids)) {
        const row = decodeProjectionRow(
          rows(
            this.sql.exec(
              `SELECT row_json FROM ${this.plan.tables.projection} WHERE id = ?`,
              id,
            ),
          )[0],
        );
        if (!row) continue;
        if (filter.e !== undefined && row.e !== filter.e) continue;
        if (filter.a !== undefined && row.a !== filter.a) continue;
        if (filter.eventIds !== undefined && !filter.eventIds.includes(row.eventId)) {
          continue;
        }
        out.push(row);
      }
      return out.sort((a, b) => a.id.localeCompare(b.id));
    }

    const clauses: string[] = [];
    const bindings: unknown[] = [];
    if (filter.e !== undefined) {
      clauses.push("e = ?");
      bindings.push(filter.e);
    }
    if (filter.a !== undefined) {
      clauses.push("a = ?");
      bindings.push(filter.a);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const eventIds = filter.eventIds ? new Set(filter.eventIds) : null;
    return rows(
      this.sql.exec(
        `SELECT row_json FROM ${this.plan.tables.projection}${where} ORDER BY id`,
        ...bindings,
      ),
    )
      .map(decodeProjectionRow)
      .filter(
        (row): row is ProjectionRow =>
          row !== undefined && (eventIds === null || eventIds.has(row.eventId)),
      );
  }
}

class DurableObjectSqliteMetaStore {
  private readonly plan: SqlPlan;

  constructor(
    private readonly sql: DurableObjectSqlStorageLike,
    tablePrefix = "metacrdt",
  ) {
    this.plan = plan(tablePrefix);
  }

  async initialize(): Promise<void> {
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ${this.plan.tables.meta} (` +
        "key TEXT PRIMARY KEY NOT NULL, " +
        "value TEXT NOT NULL" +
        ")",
    );
  }

  async get(key: string): Promise<string | undefined> {
    return valueColumn(
      rows(
        this.sql.exec(
          `SELECT value FROM ${this.plan.tables.meta} WHERE key = ?`,
          key,
        ),
      )[0],
      "value",
    );
  }

  async set(key: string, value: string): Promise<void> {
    this.sql.exec(
      `INSERT INTO ${this.plan.tables.meta} (key, value) VALUES (?, ?) ` +
        "ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      key,
      value,
    );
  }
}

export class DurableObjectSqliteClock implements RuntimeClock {
  private constructor(
    private readonly meta: DurableObjectSqliteMetaStore,
    readonly replicaId: string,
    private readonly wall: () => number,
    private clock: Hlc,
  ) {}

  static async create(
    meta: DurableObjectSqliteMetaStore,
    replicaId: string,
    wall: () => number = () => Date.now(),
  ): Promise<DurableObjectSqliteClock> {
    const raw = await meta.get(clockKey(replicaId));
    const parsed = raw === undefined ? undefined : (JSON.parse(raw) as unknown);
    return new DurableObjectSqliteClock(
      meta,
      replicaId,
      wall,
      isHlc(parsed, replicaId) ? parsed : initialClock(replicaId),
    );
  }

  current(): Hlc {
    return this.clock;
  }

  async tick(): Promise<Hlc> {
    this.clock = tick(this.clock, this.wall(), this.replicaId);
    await this.meta.set(clockKey(this.replicaId), JSON.stringify(this.clock));
    return this.clock;
  }

  async receive(remote: Hlc): Promise<Hlc> {
    this.clock = receive(this.clock, remote, this.wall(), this.replicaId);
    await this.meta.set(clockKey(this.replicaId), JSON.stringify(this.clock));
    return this.clock;
  }
}

export class DurableObjectSqliteSequencer implements RuntimeSequencer {
  private constructor(
    private readonly meta: DurableObjectSqliteMetaStore,
    readonly replicaId: string,
    private seq: number,
  ) {}

  static async create(
    meta: DurableObjectSqliteMetaStore,
    replicaId: string,
  ): Promise<DurableObjectSqliteSequencer> {
    const raw = await meta.get(seqKey(replicaId));
    const parsed = raw === undefined ? 0 : Number(raw);
    return new DurableObjectSqliteSequencer(
      meta,
      replicaId,
      isSeq(parsed) ? Math.floor(parsed) : 0,
    );
  }

  async next(): Promise<number> {
    this.seq += 1;
    await this.meta.set(seqKey(this.replicaId), String(this.seq));
    return this.seq;
  }

  current(): number {
    return this.seq;
  }
}

export async function createDurableObjectSqliteRuntime(
  options: DurableObjectSqliteRuntimeOptions,
): Promise<DurableObjectSqliteRuntime> {
  const tablePrefix = options.tablePrefix ?? "metacrdt";
  const store = new DurableObjectSqliteEventStore(options.sql, tablePrefix);
  const projection = new DurableObjectSqliteProjectionStore(options.sql, tablePrefix);
  const meta = new DurableObjectSqliteMetaStore(options.sql, tablePrefix);
  if (options.initialize ?? true) {
    await store.initialize();
    await projection.initialize();
    await meta.initialize();
  }
  const capabilities = new Set<RuntimeCapability>(
    options.capabilities ?? [
      "convergent-log",
      "coordinated-writes",
      "projection-store",
    ],
  );
  const profile: RuntimeProfile = {
    name: options.name ?? "cloudflare-durable-object-sqlite",
    replicaId: options.replicaId,
    capabilities,
  };
  return {
    profile,
    store,
    projection,
    clock: await DurableObjectSqliteClock.create(
      meta,
      options.replicaId,
      options.wall,
    ),
    sequencer: await DurableObjectSqliteSequencer.create(meta, options.replicaId),
  };
}

function durableObjectSqliteRuntimeInitError(cause: unknown): RuntimeServiceError {
  return new RuntimeServiceError({
    service: "DurableObjectSqliteRuntime",
    operation: "createDurableObjectSqliteRuntime",
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

export function createDurableObjectSqliteRuntimeLayer(
  options: DurableObjectSqliteRuntimeOptions,
): Layer.Layer<ProjectionRuntimeServices, RuntimeServiceError> {
  return Layer.unwrapEffect(
    Effect.map(
      Effect.tryPromise({
        try: () => createDurableObjectSqliteRuntime(options),
        catch: durableObjectSqliteRuntimeInitError,
      }),
      (runtime) =>
        runtimeServicesLayer({
          profile: runtime.profile,
          store: runtime.store,
          projection: runtime.projection,
          clock: runtime.clock,
          sequencer: runtime.sequencer,
          scheduler: runtime.scheduler,
          transport: runtime.transport,
        }),
    ),
  );
}
