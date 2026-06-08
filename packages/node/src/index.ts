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
  createMemoryRuntime,
  type AppendResult,
  type EventFilter,
  type EventStore,
  type MergeResult,
  type MemoryRuntimeOptions,
  type RuntimeCapability,
  type RuntimeClock,
  type RuntimeProfile,
  type RuntimeSequencer,
  type RuntimeServices,
} from "@metacrdt/runtime";

export type NodeSqliteStatementLike = {
  get?(...params: readonly unknown[]): unknown | Promise<unknown>;
  all?(...params: readonly unknown[]): unknown[] | Promise<unknown[]>;
  run?(...params: readonly unknown[]): unknown | Promise<unknown>;
};

export type NodeSqliteDatabaseLike = {
  exec?(sql: string): unknown | Promise<unknown>;
  prepare(sql: string): NodeSqliteStatementLike | Promise<NodeSqliteStatementLike>;
};

export type NodeSqliteRuntimeOptions = {
  name?: string;
  replicaId: string;
  db: NodeSqliteDatabaseLike;
  tablePrefix?: string;
  initialize?: boolean;
  wall?: () => number;
  capabilities?: Iterable<RuntimeCapability>;
};

export type NodeSqliteRuntime = RuntimeServices & {
  store: NodeSqliteEventStore;
  clock: NodeSqliteClock;
  sequencer: NodeSqliteSequencer;
};

function identifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`invalid SQLite identifier: ${name}`);
  }
  return `"${name}"`;
}

function tableNames(prefix: string): { events: string; meta: string } {
  return {
    events: identifier(`${prefix}_events`),
    meta: identifier(`${prefix}_meta`),
  };
}

async function prepare(
  db: NodeSqliteDatabaseLike,
  sql: string,
): Promise<NodeSqliteStatementLike> {
  return await db.prepare(sql);
}

function valueColumn(row: unknown): string | undefined {
  if (row === undefined || row === null) return undefined;
  if (typeof row === "string") return row;
  if (Array.isArray(row)) return typeof row[0] === "string" ? row[0] : undefined;
  if (typeof row === "object") {
    const value = (row as { event_json?: unknown; value?: unknown }).event_json ??
      (row as { value?: unknown }).value;
    return typeof value === "string" ? value : undefined;
  }
  return undefined;
}

function decodeEvent(row: unknown): Event | undefined {
  const raw = valueColumn(row);
  if (raw === undefined) return undefined;
  const event = JSON.parse(raw) as Event;
  if (!verifyId(event)) throw new Error(`invalid stored event id: ${event.id}`);
  return event;
}

function eventJson(event: Event): string {
  return JSON.stringify(event);
}

export class NodeSqliteEventStore implements EventStore {
  private readonly tables: { events: string; meta: string };

  constructor(
    private readonly db: NodeSqliteDatabaseLike,
    tablePrefix = "metacrdt",
  ) {
    this.tables = tableNames(tablePrefix);
  }

  async initialize(): Promise<void> {
    await this.exec(
      `CREATE TABLE IF NOT EXISTS ${this.tables.events} (` +
        "id TEXT PRIMARY KEY NOT NULL, " +
        "e TEXT, " +
        "a TEXT, " +
        "event_json TEXT NOT NULL" +
        ")",
    );
    await this.exec(
      `CREATE INDEX IF NOT EXISTS ${this.tables.events.slice(1, -1)}_by_e ` +
        `ON ${this.tables.events} (e)`,
    );
    await this.exec(
      `CREATE INDEX IF NOT EXISTS ${this.tables.events.slice(1, -1)}_by_a ` +
        `ON ${this.tables.events} (a)`,
    );
  }

  private async exec(sql: string): Promise<void> {
    if (this.db.exec) {
      await this.db.exec(sql);
      return;
    }
    const stmt = await prepare(this.db, sql);
    if (!stmt.run) throw new Error("SQLite statement does not support run()");
    await stmt.run();
  }

  async append(event: Event): Promise<AppendResult> {
    if (!verifyId(event)) throw new Error(`invalid event id: ${event.id}`);
    const existing = await this.get(event.id);
    const inserted = existing === undefined;
    if (inserted) {
      const stmt = await prepare(
        this.db,
        `INSERT INTO ${this.tables.events} (id, e, a, event_json) VALUES (?, ?, ?, ?)`,
      );
      if (!stmt.run) throw new Error("SQLite statement does not support run()");
      await stmt.run(event.id, event.e ?? null, event.a ?? null, eventJson(event));
    } else if (existing.seq === undefined && event.seq !== undefined) {
      const stmt = await prepare(
        this.db,
        `UPDATE ${this.tables.events} SET event_json = ? WHERE id = ?`,
      );
      if (!stmt.run) throw new Error("SQLite statement does not support run()");
      await stmt.run(eventJson(event), event.id);
    }
    return { event, inserted };
  }

  async get(id: EventId): Promise<Event | undefined> {
    const stmt = await prepare(
      this.db,
      `SELECT event_json FROM ${this.tables.events} WHERE id = ?`,
    );
    if (!stmt.get) throw new Error("SQLite statement does not support get()");
    return decodeEvent(await stmt.get(id));
  }

  async scan(filter: EventFilter = {}): Promise<Event[]> {
    if (filter.ids) {
      const out: Event[] = [];
      for (const id of new Set(filter.ids)) {
        const event = await this.get(id);
        if (!event) continue;
        if (filter.e !== undefined && event.e !== filter.e) continue;
        if (filter.a !== undefined && event.a !== filter.a) continue;
        out.push(event);
      }
      return out.sort((a, b) => a.id.localeCompare(b.id));
    }

    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.e !== undefined) {
      clauses.push("e = ?");
      params.push(filter.e);
    }
    if (filter.a !== undefined) {
      clauses.push("a = ?");
      params.push(filter.a);
    }
    const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
    const stmt = await prepare(
      this.db,
      `SELECT event_json FROM ${this.tables.events}${where} ORDER BY id`,
    );
    if (!stmt.all) throw new Error("SQLite statement does not support all()");
    return (await stmt.all(...params))
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

export class NodeSqliteMetaStore {
  private readonly table: string;

  constructor(
    private readonly db: NodeSqliteDatabaseLike,
    tablePrefix = "metacrdt",
  ) {
    this.table = tableNames(tablePrefix).meta;
  }

  async initialize(): Promise<void> {
    const sql = `CREATE TABLE IF NOT EXISTS ${this.table} (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)`;
    if (this.db.exec) {
      await this.db.exec(sql);
      return;
    }
    const stmt = await prepare(this.db, sql);
    if (!stmt.run) throw new Error("SQLite statement does not support run()");
    await stmt.run();
  }

  async get(key: string): Promise<string | undefined> {
    const stmt = await prepare(this.db, `SELECT value FROM ${this.table} WHERE key = ?`);
    if (!stmt.get) throw new Error("SQLite statement does not support get()");
    return valueColumn(await stmt.get(key));
  }

  async set(key: string, value: string): Promise<void> {
    const stmt = await prepare(
      this.db,
      `INSERT OR REPLACE INTO ${this.table} (key, value) VALUES (?, ?)`,
    );
    if (!stmt.run) throw new Error("SQLite statement does not support run()");
    await stmt.run(key, value);
  }
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

export class NodeSqliteClock implements RuntimeClock {
  private constructor(
    private readonly meta: NodeSqliteMetaStore,
    readonly replicaId: string,
    private readonly wall: () => number,
    private clock: Hlc,
  ) {}

  static async create(
    meta: NodeSqliteMetaStore,
    replicaId: string,
    wall: () => number = () => Date.now(),
  ): Promise<NodeSqliteClock> {
    const raw = await meta.get(clockKey(replicaId));
    const parsed = raw === undefined ? undefined : (JSON.parse(raw) as unknown);
    return new NodeSqliteClock(
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

export class NodeSqliteSequencer implements RuntimeSequencer {
  private constructor(
    private readonly meta: NodeSqliteMetaStore,
    readonly replicaId: string,
    private seq: number,
  ) {}

  static async create(
    meta: NodeSqliteMetaStore,
    replicaId: string,
  ): Promise<NodeSqliteSequencer> {
    const raw = await meta.get(seqKey(replicaId));
    const parsed = raw === undefined ? 0 : Number(raw);
    return new NodeSqliteSequencer(
      meta,
      replicaId,
      Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0,
    );
  }

  current(): number {
    return this.seq;
  }

  async next(): Promise<number> {
    this.seq += 1;
    await this.meta.set(seqKey(this.replicaId), String(this.seq));
    return this.seq;
  }
}

export function createNodeMemoryRuntime(options: MemoryRuntimeOptions): RuntimeServices {
  return createMemoryRuntime({
    ...options,
    name: options.name ?? "node-memory",
    capabilities: options.capabilities ?? ["convergent-log", "coordinated-writes"],
  });
}

export async function createNodeSqliteRuntime(
  options: NodeSqliteRuntimeOptions,
): Promise<NodeSqliteRuntime> {
  const prefix = options.tablePrefix ?? "metacrdt";
  const store = new NodeSqliteEventStore(options.db, prefix);
  const meta = new NodeSqliteMetaStore(options.db, prefix);
  if (options.initialize ?? true) {
    await store.initialize();
    await meta.initialize();
  }
  const capabilities = new Set<RuntimeCapability>(
    options.capabilities ?? ["convergent-log", "coordinated-writes"],
  );
  const profile: RuntimeProfile = {
    name: options.name ?? "node-sqlite",
    replicaId: options.replicaId,
    capabilities,
  };
  return {
    profile,
    store,
    clock: await NodeSqliteClock.create(meta, options.replicaId, options.wall),
    sequencer: await NodeSqliteSequencer.create(meta, options.replicaId),
  };
}
