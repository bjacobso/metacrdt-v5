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
  ProjectionFilter,
  ProjectionReplaceResult,
  ProjectionRow,
  ProjectionStore,
  ProjectionRuntimeServices,
  RuntimeCapability,
  RuntimeClock,
  RuntimeProfile,
  RuntimeSequencer,
  RuntimeServices,
} from "@metacrdt/runtime";
import { RuntimeServiceError, runtimeServicesLayer } from "@metacrdt/runtime";
import { Effect, Layer } from "effect";

/**
 * The subset of Cloudflare Durable Object storage used by the target. Keeping it
 * structural avoids a direct Workers type dependency and makes the package
 * testable with a small fake store.
 */
export interface DurableObjectStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}

function eventKey(namespace: string, id: EventId): string {
  return `${namespace}:event:${id}`;
}

function indexKey(namespace: string): string {
  return `${namespace}:events:index`;
}

function projectionKey(namespace: string, id: string): string {
  return `${namespace}:projection:${id}`;
}

function projectionIndexKey(namespace: string): string {
  return `${namespace}:projection:index`;
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

async function loadProjectionIds(
  storage: DurableObjectStorageLike,
  namespace: string,
): Promise<string[]> {
  return (await storage.get<string[]>(projectionIndexKey(namespace))) ?? [];
}

async function saveProjectionIds(
  storage: DurableObjectStorageLike,
  namespace: string,
  ids: readonly string[],
): Promise<void> {
  await storage.put(projectionIndexKey(namespace), [...ids].sort());
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

export class DurableObjectProjectionStore implements ProjectionStore {
  constructor(
    private readonly storage: DurableObjectStorageLike,
    private readonly namespace = "metacrdt",
  ) {}

  async replace(
    rows: Iterable<ProjectionRow>,
  ): Promise<ProjectionReplaceResult> {
    const previousIds = await loadProjectionIds(this.storage, this.namespace);
    for (const id of previousIds) {
      await this.storage.delete(projectionKey(this.namespace, id));
    }

    const ids: string[] = [];
    for (const row of rows) {
      ids.push(row.id);
      await this.storage.put(projectionKey(this.namespace, row.id), row);
    }
    await saveProjectionIds(this.storage, this.namespace, ids);
    return { rows: ids.length };
  }

  async clear(): Promise<void> {
    const ids = await loadProjectionIds(this.storage, this.namespace);
    for (const id of ids) {
      await this.storage.delete(projectionKey(this.namespace, id));
    }
    await saveProjectionIds(this.storage, this.namespace, []);
  }

  async scan(filter: ProjectionFilter = {}): Promise<ProjectionRow[]> {
    const ids = filter.ids ? [...new Set(filter.ids)] : await loadProjectionIds(
      this.storage,
      this.namespace,
    );
    const eventIds = filter.eventIds ? new Set(filter.eventIds) : null;
    const out: ProjectionRow[] = [];
    for (const id of ids) {
      const row = await this.storage.get<ProjectionRow>(
        projectionKey(this.namespace, id),
      );
      if (!row) continue;
      if (eventIds && !eventIds.has(row.eventId)) continue;
      if (filter.e !== undefined && row.e !== filter.e) continue;
      if (filter.a !== undefined && row.a !== filter.a) continue;
      out.push(row);
    }
    return out.sort((a, b) => a.id.localeCompare(b.id));
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
    projection: DurableObjectProjectionStore;
    clock: DurableObjectClock;
    sequencer: DurableObjectSequencer;
  }
> {
  const namespace = options.namespace ?? "metacrdt";
  const capabilities = new Set<RuntimeCapability>(
    options.capabilities ?? [
      "convergent-log",
      "coordinated-writes",
      "projection-store",
    ],
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
    projection: new DurableObjectProjectionStore(options.storage, namespace),
    clock,
    sequencer,
  };
}

function durableObjectRuntimeInitError(cause: unknown): RuntimeServiceError {
  return new RuntimeServiceError({
    service: "DurableObjectRuntime",
    operation: "createDurableObjectRuntime",
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

export function createDurableObjectRuntimeLayer(
  options: DurableObjectRuntimeOptions,
): Layer.Layer<ProjectionRuntimeServices, RuntimeServiceError> {
  return Layer.unwrapEffect(
    Effect.map(
      Effect.tryPromise({
        try: () => createDurableObjectRuntime(options),
        catch: durableObjectRuntimeInitError,
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
