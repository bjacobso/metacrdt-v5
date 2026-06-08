import {
  Event,
  EventId,
  Hlc,
  initialClock,
  receive,
  tick,
  verifyId,
} from "@metacrdt/core";
import type {
  AppendResult,
  EventFilter,
  EventStore,
  MergeResult,
  RuntimeCapability,
  RuntimeClock,
  RuntimeProfile,
  RuntimeSequencer,
  RuntimeServices,
} from "@metacrdt/runtime";

/**
 * The subset of Cloudflare Durable Object storage used by the target. Keeping it
 * structural avoids a direct Workers type dependency and makes the package
 * testable with a small fake store.
 */
export interface DurableObjectStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete?(key: string): Promise<boolean>;
}

function eventKey(namespace: string, id: EventId): string {
  return `${namespace}:event:${id}`;
}

function indexKey(namespace: string): string {
  return `${namespace}:events:index`;
}

function clockKey(namespace: string, replicaId: string): string {
  return `${namespace}:clock:${replicaId}`;
}

function seqKey(namespace: string, replicaId: string): string {
  return `${namespace}:seq:${replicaId}`;
}

async function loadIds(
  storage: DurableObjectStorageLike,
  namespace: string,
): Promise<EventId[]> {
  return (await storage.get<EventId[]>(indexKey(namespace))) ?? [];
}

async function saveIds(
  storage: DurableObjectStorageLike,
  namespace: string,
  ids: readonly EventId[],
): Promise<void> {
  await storage.put(indexKey(namespace), [...ids].sort());
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

export class DurableObjectEventStore implements EventStore {
  constructor(
    private readonly storage: DurableObjectStorageLike,
    private readonly namespace = "metacrdt",
  ) {}

  async append(event: Event): Promise<AppendResult> {
    if (!verifyId(event)) throw new Error(`invalid event id: ${event.id}`);
    const key = eventKey(this.namespace, event.id);
    const existing = await this.storage.get<Event>(key);
    const inserted = existing === undefined;

    if (inserted) {
      await this.storage.put(key, event);
      const ids = new Set(await loadIds(this.storage, this.namespace));
      ids.add(event.id);
      await saveIds(this.storage, this.namespace, [...ids]);
    } else if (existing.seq === undefined && event.seq !== undefined) {
      await this.storage.put(key, event);
    }

    return { event, inserted };
  }

  async get(id: EventId): Promise<Event | undefined> {
    const event = await this.storage.get<Event>(eventKey(this.namespace, id));
    if (event !== undefined && !verifyId(event)) {
      throw new Error(`invalid stored event id: ${event.id}`);
    }
    return event;
  }

  async scan(filter: EventFilter = {}): Promise<Event[]> {
    const ids = filter.ids ? [...new Set(filter.ids)] : await loadIds(this.storage, this.namespace);
    const out: Event[] = [];
    for (const id of ids) {
      const event = await this.get(id);
      if (!event) continue;
      if (filter.e !== undefined && event.e !== filter.e) continue;
      if (filter.a !== undefined && event.a !== filter.a) continue;
      out.push(event);
    }
    return out;
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

export class DurableObjectClock implements RuntimeClock {
  private constructor(
    private readonly storage: DurableObjectStorageLike,
    private readonly namespace: string,
    readonly replicaId: string,
    private readonly wall: () => number,
    private clock: Hlc,
  ) {}

  static async create(
    storage: DurableObjectStorageLike,
    namespace: string,
    replicaId: string,
    wall: () => number = () => Date.now(),
  ): Promise<DurableObjectClock> {
    const stored = await storage.get<Hlc>(clockKey(namespace, replicaId));
    return new DurableObjectClock(
      storage,
      namespace,
      replicaId,
      wall,
      isHlc(stored, replicaId) ? stored : initialClock(replicaId),
    );
  }

  current(): Hlc {
    return this.clock;
  }

  async tick(): Promise<Hlc> {
    this.clock = tick(this.clock, this.wall(), this.replicaId);
    await this.storage.put(clockKey(this.namespace, this.replicaId), this.clock);
    return this.clock;
  }

  async receive(remote: Hlc): Promise<Hlc> {
    this.clock = receive(this.clock, remote, this.wall(), this.replicaId);
    await this.storage.put(clockKey(this.namespace, this.replicaId), this.clock);
    return this.clock;
  }
}

export class DurableObjectSequencer implements RuntimeSequencer {
  private constructor(
    private readonly storage: DurableObjectStorageLike,
    private readonly namespace: string,
    readonly replicaId: string,
    private seq: number,
  ) {}

  static async create(
    storage: DurableObjectStorageLike,
    namespace: string,
    replicaId: string,
  ): Promise<DurableObjectSequencer> {
    const stored = await storage.get<number>(seqKey(namespace, replicaId));
    return new DurableObjectSequencer(
      storage,
      namespace,
      replicaId,
      isSeq(stored) ? Math.floor(stored) : 0,
    );
  }

  async next(): Promise<number> {
    this.seq += 1;
    await this.storage.put(seqKey(this.namespace, this.replicaId), this.seq);
    return this.seq;
  }

  current(): number {
    return this.seq;
  }
}

export type DurableObjectRuntimeOptions = {
  name?: string;
  replicaId: string;
  storage: DurableObjectStorageLike;
  namespace?: string;
  wall?: () => number;
  capabilities?: Iterable<RuntimeCapability>;
};

export async function createDurableObjectRuntime(
  options: DurableObjectRuntimeOptions,
): Promise<
  RuntimeServices & {
    store: DurableObjectEventStore;
    clock: DurableObjectClock;
    sequencer: DurableObjectSequencer;
  }
> {
  const namespace = options.namespace ?? "metacrdt";
  const capabilities = new Set<RuntimeCapability>(
    options.capabilities ?? ["convergent-log", "coordinated-writes"],
  );
  const profile: RuntimeProfile = {
    name: options.name ?? "cloudflare-durable-object",
    replicaId: options.replicaId,
    capabilities,
  };
  const clock = await DurableObjectClock.create(
    options.storage,
    namespace,
    options.replicaId,
    options.wall,
  );
  const sequencer = await DurableObjectSequencer.create(
    options.storage,
    namespace,
    options.replicaId,
  );
  return {
    profile,
    store: new DurableObjectEventStore(options.storage, namespace),
    clock,
    sequencer,
  };
}
