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
  deltaSince,
  type EventFilter,
  type EventStore,
  mergeFrom,
  type MergeResult,
  type MemoryRuntimeOptions,
  type RuntimeCapability,
  type RuntimeClock,
  type RuntimeProfile,
  type RuntimeSequencer,
  type RuntimeServices,
  type VersionVector,
  versionVector,
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

export type NodeSyncHttpRequestLike = {
  method?: string;
  url: string;
  body?: unknown | (() => unknown | Promise<unknown>);
};

export type NodeSyncHttpResponse = {
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
};

export type NodeSyncHttpOptions = {
  basePath?: string;
  protocol?: string;
};

export type NodeHttpIncomingMessageLike = AsyncIterable<string | Uint8Array> & {
  method?: string;
  url?: string;
};

export type NodeHttpServerResponseLike = {
  statusCode?: number;
  setHeader(name: string, value: string): unknown;
  end(body?: string): unknown;
};

export type NodeHttpRequestListener = (
  req: NodeHttpIncomingMessageLike,
  res: NodeHttpServerResponseLike,
) => Promise<NodeSyncHttpResponse>;

const DEFAULT_SYNC_PROTOCOL = "metacrdt.node.http.v1";

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

function jsonResponse(value: unknown, status = 200): NodeSyncHttpResponse {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

function textResponse(
  body: string,
  status: number,
  headers: Record<string, string>,
): NodeSyncHttpResponse {
  return { status, headers, body };
}

function parsePathAndQuery(raw: string): { path: string; query: string } {
  const scheme = raw.indexOf("://");
  const slash = scheme >= 0 ? raw.indexOf("/", scheme + 3) : -1;
  const pathQuery =
    scheme >= 0
      ? raw.slice(slash >= 0 ? slash : raw.length)
      : raw;
  const withoutHash = pathQuery.split("#", 1)[0] ?? "/";
  const q = withoutHash.indexOf("?");
  return q < 0
    ? { path: withoutHash || "/", query: "" }
    : { path: withoutHash.slice(0, q) || "/", query: withoutHash.slice(q + 1) };
}

function queryParams(query: string): Map<string, string> {
  const params = new Map<string, string>();
  if (query === "") return params;
  for (const pair of query.split("&")) {
    if (pair === "") continue;
    const eq = pair.indexOf("=");
    const key = eq < 0 ? pair : pair.slice(0, eq);
    const value = eq < 0 ? "" : pair.slice(eq + 1);
    params.set(decodeURIComponent(key), decodeURIComponent(value.replace(/\+/g, " ")));
  }
  return params;
}

function normalizeBasePath(basePath = "/metacrdt"): string {
  const path = basePath.startsWith("/") ? basePath : `/${basePath}`;
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

function route(path: string, basePath: string): string | undefined {
  if (path === basePath) return "/";
  if (!path.startsWith(`${basePath}/`)) return undefined;
  return path.slice(basePath.length) || "/";
}

function parseVersionVector(raw: string | undefined): VersionVector {
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("version vector must be an object");
  }
  const vv: Record<string, number> = {};
  for (const [replica, seq] of Object.entries(parsed)) {
    if (typeof seq !== "number" || !Number.isFinite(seq) || seq < 0) {
      throw new Error(`invalid version vector sequence for ${replica}`);
    }
    vv[replica] = Math.floor(seq);
  }
  return vv;
}

async function requestBody(request: NodeSyncHttpRequestLike): Promise<unknown> {
  const raw = typeof request.body === "function" ? await request.body() : request.body;
  return typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
}

function eventsFromBody(body: unknown): Event[] {
  const events = Array.isArray(body)
    ? body
    : typeof body === "object" && body !== null
      ? (body as { events?: unknown }).events
      : undefined;
  if (!Array.isArray(events)) throw new Error("expected body { events: Event[] }");
  for (const event of events) {
    if (!verifyId(event as Event)) {
      throw new Error("body contains invalid event id");
    }
  }
  return events as Event[];
}

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function utf8Decode(bytes: readonly number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b0 = bytes[i] ?? 0;
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
    } else if (b0 < 0xe0) {
      const b1 = bytes[++i] ?? 0;
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
    } else if (b0 < 0xf0) {
      const b1 = bytes[++i] ?? 0;
      const b2 = bytes[++i] ?? 0;
      out += String.fromCharCode(
        ((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f),
      );
    } else {
      const b1 = bytes[++i] ?? 0;
      const b2 = bytes[++i] ?? 0;
      const b3 = bytes[++i] ?? 0;
      const codepoint =
        ((b0 & 0x07) << 18) |
        ((b1 & 0x3f) << 12) |
        ((b2 & 0x3f) << 6) |
        (b3 & 0x3f);
      const offset = codepoint - 0x10000;
      out += String.fromCharCode(
        0xd800 + (offset >> 10),
        0xdc00 + (offset & 0x3ff),
      );
    }
  }
  return out;
}

async function incomingMessageBody(
  req: NodeHttpIncomingMessageLike,
): Promise<string> {
  let text = "";
  const bytes: number[] = [];
  let hasBytes = false;
  for await (const chunk of req) {
    if (typeof chunk === "string") {
      text += chunk;
    } else {
      hasBytes = true;
      bytes.push(...chunk);
    }
  }
  return hasBytes ? text + utf8Decode(bytes) : text;
}

function writeNodeResponse(
  res: NodeHttpServerResponseLike,
  response: NodeSyncHttpResponse,
  method?: string,
): void {
  res.statusCode = response.status;
  for (const [name, value] of Object.entries(response.headers)) {
    res.setHeader(name, value);
  }
  res.end(method?.toUpperCase() === "HEAD" ? "" : response.body);
}

/**
 * A dependency-free HTTP/SSE sync surface for server-process runtimes.
 *
 * It intentionally returns a small structural response instead of importing
 * Node's `http` types or depending on a framework. Adapters for Express, Hono,
 * Fastify, native `node:http`, Bun, or tests can translate this shape.
 */
export function createNodeSyncHttpHandler(
  runtime: RuntimeServices,
  options: NodeSyncHttpOptions = {},
): (request: NodeSyncHttpRequestLike) => Promise<NodeSyncHttpResponse> {
  const basePath = normalizeBasePath(options.basePath);
  const protocol = options.protocol ?? DEFAULT_SYNC_PROTOCOL;

  return async (request) => {
    const method = (request.method ?? "GET").toUpperCase();
    const routeMethod = method === "HEAD" ? "GET" : method;
    const parsed = parsePathAndQuery(request.url);
    const matched = route(parsed.path, basePath);
    if (matched === undefined) return jsonResponse({ error: "not found" }, 404);
    if (method === "OPTIONS") {
      return {
        status: 204,
        headers: {
          allow: "GET, POST, OPTIONS",
          "access-control-allow-methods": "GET, POST, OPTIONS",
          "access-control-allow-headers": "content-type",
        },
        body: "",
      };
    }

    try {
      if (routeMethod === "GET" && (matched === "/" || matched === "/health")) {
        return jsonResponse({
          ok: true,
          protocol,
          profile: {
            name: runtime.profile.name,
            replicaId: runtime.profile.replicaId,
            capabilities: [...runtime.profile.capabilities].sort(),
          },
          vv: versionVector(await runtime.store.scan()),
        });
      }

      if (routeMethod === "GET" && matched === "/events") {
        const params = queryParams(parsed.query);
        const remote = parseVersionVector(params.get("vv") ?? params.get("since"));
        const events = await runtime.store.scan();
        const delta = deltaSince(events, remote);
        return jsonResponse({
          protocol,
          from: runtime.profile.replicaId,
          vv: versionVector(events),
          since: remote,
          events: delta.events,
        });
      }

      if (routeMethod === "GET" && matched === "/events/sse") {
        const params = queryParams(parsed.query);
        const remote = parseVersionVector(params.get("vv") ?? params.get("since"));
        const events = await runtime.store.scan();
        const delta = {
          protocol,
          from: runtime.profile.replicaId,
          vv: versionVector(events),
          since: remote,
          events: deltaSince(events, remote).events,
        };
        return textResponse(sseFrame("delta", delta), 200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
      }

      if (method === "POST" && matched === "/events") {
        const events = eventsFromBody(await requestBody(request));
        const inserted = await mergeFrom(runtime, events);
        return jsonResponse({
          protocol,
          inserted,
          seen: events.length,
          vv: versionVector(await runtime.store.scan()),
        });
      }
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 400);
    }

    return jsonResponse({ error: "not found" }, 404);
  };
}

/**
 * Native `node:http`-style adapter for `createNodeSyncHttpHandler`.
 *
 * The type is structural so this package still does not import Node's `http`
 * module or pull in `@types/node`: native Node, Bun's server request shims,
 * small tests, and framework adapters can all provide the same shape.
 */
export function createNodeHttpRequestListener(
  runtime: RuntimeServices,
  options: NodeSyncHttpOptions = {},
): NodeHttpRequestListener {
  const handle = createNodeSyncHttpHandler(runtime, options);
  return async (req, res) => {
    const response = await handle({
      method: req.method,
      url: req.url ?? "/",
      body: () => incomingMessageBody(req),
    });
    writeNodeResponse(res, response, req.method);
    return response;
  };
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
