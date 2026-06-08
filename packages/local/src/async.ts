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
  BroadcastChannelTransport,
  attachBroadcastTransport,
  decodeLocalEvent,
  encodeLocalEvent,
  localClockKey,
  localEventsKey,
  localSeqKey,
  type BroadcastTransportOptions,
  type BroadcastChannelLike,
  type EncodedLocalEvent,
  type AppendResult,
  type EventFilter,
  type EventStore,
  type MergeResult,
  type RuntimeCapability,
  type RuntimeClock,
  type RuntimeProfile,
  type RuntimeSequencer,
  type RuntimeServices,
} from "@metacrdt/runtime";
import { indexedDbStorage, type IndexedDbStorageOptions } from "./indexedDb.js";
import { sqliteStorage, type SqliteStorageOptions } from "./sqlite.js";

export interface AsyncLocalRuntimeStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem?(key: string): Promise<void>;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  return JSON.parse(raw) as T;
}

async function loadHlc(
  storage: AsyncLocalRuntimeStorage,
  key: string,
  replicaId: string,
): Promise<Hlc> {
  const parsed = parseJson<Hlc | null>(await storage.getItem(key), null);
  if (
    parsed &&
    typeof parsed.pt === "number" &&
    typeof parsed.l === "number" &&
    parsed.r === replicaId
  ) {
    return parsed;
  }
  return initialClock(replicaId);
}

async function loadSeq(
  storage: AsyncLocalRuntimeStorage,
  key: string,
): Promise<number> {
  const raw = await storage.getItem(key);
  if (raw === null) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

/**
 * Async durable event store for IndexedDB-like backends. Like every MetaCRDT log,
 * it is a G-Set keyed by content-addressed EventId: duplicate receipt is
 * idempotent and storage is only upgraded when a legacy duplicate lacks `seq`.
 */
export class AsyncLocalEventStore implements EventStore {
  #events: Map<EventId, Event> | undefined;

  constructor(
    private readonly storage: AsyncLocalRuntimeStorage,
    private readonly namespace = "metacrdt",
  ) {}

  async #load(): Promise<Map<EventId, Event>> {
    if (this.#events) return this.#events;
    const encoded = parseJson<EncodedLocalEvent[]>(
      await this.storage.getItem(localEventsKey(this.namespace)),
      [],
    );
    this.#events = new Map();
    for (const item of encoded) {
      const event = decodeLocalEvent(item);
      if (!verifyId(event)) throw new Error(`invalid stored event id: ${event.id}`);
      this.#events.set(event.id, event);
    }
    return this.#events;
  }

  async #persist(): Promise<void> {
    const events = [...(await this.#load()).values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(encodeLocalEvent);
    await this.storage.setItem(localEventsKey(this.namespace), JSON.stringify(events));
  }

  async append(event: Event): Promise<AppendResult> {
    if (!verifyId(event)) throw new Error(`invalid event id: ${event.id}`);
    const events = await this.#load();
    const existing = events.get(event.id);
    const inserted = existing === undefined;
    if (inserted || (existing.seq === undefined && event.seq !== undefined)) {
      events.set(event.id, event);
      await this.#persist();
    }
    return { event, inserted };
  }

  async get(id: EventId): Promise<Event | undefined> {
    return (await this.#load()).get(id);
  }

  async scan(filter: EventFilter = {}): Promise<Event[]> {
    const ids = filter.ids ? new Set(filter.ids) : null;
    return [...(await this.#load()).values()].filter((event) => {
      if (ids && !ids.has(event.id)) return false;
      if (filter.e !== undefined && event.e !== filter.e) return false;
      if (filter.a !== undefined && event.a !== filter.a) return false;
      return true;
    });
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

export class AsyncLocalClock implements RuntimeClock {
  readonly replicaId: string;

  private constructor(
    private readonly storage: AsyncLocalRuntimeStorage,
    private readonly namespace: string,
    replicaId: string,
    private readonly wall: () => number,
    private clock: Hlc,
  ) {
    this.replicaId = replicaId;
  }

  static async create(
    storage: AsyncLocalRuntimeStorage,
    namespace: string,
    replicaId: string,
    wall: () => number = () => Date.now(),
  ): Promise<AsyncLocalClock> {
    return new AsyncLocalClock(
      storage,
      namespace,
      replicaId,
      wall,
      await loadHlc(storage, localClockKey(namespace, replicaId), replicaId),
    );
  }

  async #persist(): Promise<void> {
    await this.storage.setItem(
      localClockKey(this.namespace, this.replicaId),
      JSON.stringify(this.clock),
    );
  }

  current(): Hlc {
    return this.clock;
  }

  async tick(): Promise<Hlc> {
    this.clock = tick(this.clock, this.wall(), this.replicaId);
    await this.#persist();
    return this.clock;
  }

  async receive(remote: Hlc): Promise<Hlc> {
    this.clock = receive(this.clock, remote, this.wall(), this.replicaId);
    await this.#persist();
    return this.clock;
  }
}

export class AsyncLocalSequencer implements RuntimeSequencer {
  readonly replicaId: string;

  private constructor(
    private readonly storage: AsyncLocalRuntimeStorage,
    private readonly namespace: string,
    replicaId: string,
    private seq: number,
  ) {
    this.replicaId = replicaId;
  }

  static async create(
    storage: AsyncLocalRuntimeStorage,
    namespace: string,
    replicaId: string,
  ): Promise<AsyncLocalSequencer> {
    return new AsyncLocalSequencer(
      storage,
      namespace,
      replicaId,
      await loadSeq(storage, localSeqKey(namespace, replicaId)),
    );
  }

  async #persist(): Promise<void> {
    await this.storage.setItem(localSeqKey(this.namespace, this.replicaId), String(this.seq));
  }

  async next(): Promise<number> {
    this.seq += 1;
    await this.#persist();
    return this.seq;
  }

  current(): number {
    return this.seq;
  }
}

export type AsyncLocalRuntimeOptions = {
  name?: string;
  replicaId: string;
  storage: AsyncLocalRuntimeStorage;
  namespace?: string;
  wall?: () => number;
  capabilities?: Iterable<RuntimeCapability>;
};

export type AsyncLocalRuntime = Omit<RuntimeServices, "transport"> & {
  store: AsyncLocalEventStore;
  clock: AsyncLocalClock;
  sequencer: AsyncLocalSequencer;
};

export async function createAsyncLocalRuntime(
  options: AsyncLocalRuntimeOptions,
): Promise<AsyncLocalRuntime> {
  const namespace = options.namespace ?? "metacrdt";
  const capabilities = new Set<RuntimeCapability>(
    options.capabilities ?? ["convergent-log"],
  );
  const profile: RuntimeProfile = {
    name: options.name ?? "local",
    replicaId: options.replicaId,
    capabilities,
  };
  return {
    profile,
    store: new AsyncLocalEventStore(options.storage, namespace),
    clock: await AsyncLocalClock.create(
      options.storage,
      namespace,
      options.replicaId,
      options.wall,
    ),
    sequencer: await AsyncLocalSequencer.create(
      options.storage,
      namespace,
      options.replicaId,
    ),
  };
}

export type IndexedDbLocalFirstRuntimeOptions = Omit<
  AsyncLocalRuntimeOptions,
  "storage"
> & {
  storage?: AsyncLocalRuntimeStorage;
  indexedDb?: IndexedDbStorageOptions;
  channel?: BroadcastChannelLike;
  channelName?: string;
  broadcast?: boolean;
  transport?: BroadcastTransportOptions;
  announceOnStart?: boolean;
};

export type IndexedDbLocalFirstRuntime = Omit<AsyncLocalRuntime, "transport"> & {
  transport?: BroadcastChannelTransport;
  start(): Promise<void>;
  stop(): void;
};

export type SqliteLocalFirstRuntimeOptions = Omit<
  AsyncLocalRuntimeOptions,
  "storage"
> & {
  storage?: AsyncLocalRuntimeStorage;
  sqlite?: SqliteStorageOptions;
  channel?: BroadcastChannelLike;
  channelName?: string;
  broadcast?: boolean;
  transport?: BroadcastTransportOptions;
  announceOnStart?: boolean;
};

export type SqliteLocalFirstRuntime = Omit<AsyncLocalRuntime, "transport"> & {
  transport?: BroadcastChannelTransport;
  start(): Promise<void>;
  stop(): void;
};

function browserBroadcastChannel(name: string): BroadcastChannelLike {
  if (typeof globalThis.BroadcastChannel === "undefined") {
    throw new Error(
      "@metacrdt/local requires BroadcastChannel; pass `channel` or set broadcast:false",
    );
  }
  return new globalThis.BroadcastChannel(name) as unknown as BroadcastChannelLike;
}

/**
 * IndexedDB/local-first browser target. Storage is async and durable; transport is
 * still optional BroadcastChannel anti-entropy for same-origin peers.
 */
export async function createIndexedDbLocalFirstRuntime(
  options: IndexedDbLocalFirstRuntimeOptions,
): Promise<IndexedDbLocalFirstRuntime> {
  const namespace = options.namespace ?? "metacrdt";
  const base = await createAsyncLocalRuntime({
    name: options.name ?? "local",
    replicaId: options.replicaId,
    storage: options.storage ?? (await indexedDbStorage(options.indexedDb)),
    namespace,
    wall: options.wall,
    capabilities: options.capabilities,
  });

  let transport: BroadcastChannelTransport | undefined;
  let runtime: Omit<AsyncLocalRuntime, "transport"> & {
    transport?: BroadcastChannelTransport;
  } = base;

  if (options.broadcast ?? true) {
    const transportOptions: BroadcastTransportOptions = {
      ...options.transport,
      announceOnStart:
        options.announceOnStart ?? options.transport?.announceOnStart ?? true,
    };
    runtime = attachBroadcastTransport(
      base,
      options.channel ?? browserBroadcastChannel(options.channelName ?? `${namespace}:sync`),
      transportOptions,
    ) as typeof runtime;
    transport = runtime.transport;
  }

  return Object.assign(runtime, {
    transport,
    async start() {
      await transport?.start();
    },
    stop() {
      transport?.stop();
    },
  });
}

export async function startIndexedDbLocalFirstRuntime(
  options: IndexedDbLocalFirstRuntimeOptions,
): Promise<IndexedDbLocalFirstRuntime> {
  const runtime = await createIndexedDbLocalFirstRuntime(options);
  await runtime.start();
  return runtime;
}

/**
 * SQLite/local-first target. The package stays native-dependency-free by
 * accepting a structural SQLite client and adapting it to async key/value
 * storage before composing the same BroadcastChannel transport.
 */
export async function createSqliteLocalFirstRuntime(
  options: SqliteLocalFirstRuntimeOptions,
): Promise<SqliteLocalFirstRuntime> {
  if (options.storage === undefined && options.sqlite === undefined) {
    throw new Error(
      "@metacrdt/local SQLite runtime requires `sqlite` or `storage`",
    );
  }
  const namespace = options.namespace ?? "metacrdt";
  const base = await createAsyncLocalRuntime({
    name: options.name ?? "local",
    replicaId: options.replicaId,
    storage: options.storage ?? (await sqliteStorage(options.sqlite!)),
    namespace,
    wall: options.wall,
    capabilities: options.capabilities,
  });

  let transport: BroadcastChannelTransport | undefined;
  let runtime: Omit<AsyncLocalRuntime, "transport"> & {
    transport?: BroadcastChannelTransport;
  } = base;

  if (options.broadcast ?? true) {
    const transportOptions: BroadcastTransportOptions = {
      ...options.transport,
      announceOnStart:
        options.announceOnStart ?? options.transport?.announceOnStart ?? true,
    };
    runtime = attachBroadcastTransport(
      base,
      options.channel ?? browserBroadcastChannel(options.channelName ?? `${namespace}:sync`),
      transportOptions,
    ) as typeof runtime;
    transport = runtime.transport;
  }

  return Object.assign(runtime, {
    transport,
    async start() {
      await transport?.start();
    },
    stop() {
      transport?.stop();
    },
  });
}

export async function startSqliteLocalFirstRuntime(
  options: SqliteLocalFirstRuntimeOptions,
): Promise<SqliteLocalFirstRuntime> {
  const runtime = await createSqliteLocalFirstRuntime(options);
  await runtime.start();
  return runtime;
}
