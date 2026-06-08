import {
  Event,
  EventId,
  Hlc,
  Value,
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
} from "./types.js";

/**
 * The sync subset of `window.localStorage`, factored as an interface so tests and
 * non-browser hosts can provide the same semantics without a DOM dependency.
 */
export interface LocalRuntimeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

type EncodedValue =
  | { z: 0 }
  | { b: boolean }
  | { f: number }
  | { s: string }
  | { x: number[] }
  | { a: EncodedValue[] }
  | { o: Record<string, EncodedValue> };

type EncodedEvent = Omit<Event, "v"> & { v?: EncodedValue };

function eventsKey(namespace: string): string {
  return `${namespace}:events`;
}

function clockKey(namespace: string, replicaId: string): string {
  return `${namespace}:clock:${replicaId}`;
}

function seqKey(namespace: string, replicaId: string): string {
  return `${namespace}:seq:${replicaId}`;
}

function encodeValue(v: Value): EncodedValue {
  if (v === null) return { z: 0 };
  switch (typeof v) {
    case "boolean":
      return { b: v };
    case "number":
      return { f: v };
    case "string":
      return { s: v };
  }
  if (v instanceof Uint8Array) return { x: [...v] };
  if (Array.isArray(v)) return { a: v.map(encodeValue) };
  const out: Record<string, EncodedValue> = {};
  for (const [k, value] of Object.entries(v)) out[k] = encodeValue(value);
  return { o: out };
}

function decodeValue(v: EncodedValue): Value {
  if ("z" in v) return null;
  if ("b" in v) return v.b;
  if ("f" in v) return v.f;
  if ("s" in v) return v.s;
  if ("x" in v) return new Uint8Array(v.x);
  if ("a" in v) return v.a.map(decodeValue);
  const out: Record<string, Value> = {};
  for (const [k, value] of Object.entries(v.o)) out[k] = decodeValue(value);
  return out;
}

function encodeEvent(event: Event): EncodedEvent {
  const { v, ...rest } = event;
  const out: EncodedEvent = { ...rest };
  if (v !== undefined) out.v = encodeValue(v);
  return out;
}

function decodeEvent(event: EncodedEvent): Event {
  const out = { ...event } as Event;
  if (event.v !== undefined) {
    (out as { v: Value }).v = decodeValue(event.v);
  }
  return out;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  return JSON.parse(raw) as T;
}

function loadHlc(storage: LocalRuntimeStorage, key: string, replicaId: string): Hlc {
  const parsed = parseJson<Hlc | null>(storage.getItem(key), null);
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

function loadSeq(storage: LocalRuntimeStorage, key: string): number {
  const raw = storage.getItem(key);
  if (raw === null) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

/**
 * Durable local event store backed by localStorage-compatible storage. It still
 * implements a G-Set: storage is only appended/merged, and duplicate receipt is
 * idempotent. If a duplicate event arrives with sync metadata (`seq`) and the
 * stored legacy copy lacks it, the stored copy is upgraded without changing the
 * event identity.
 */
export class LocalEventStore implements EventStore {
  #events: Map<EventId, Event> | undefined;

  constructor(
    private readonly storage: LocalRuntimeStorage,
    private readonly namespace = "metacrdt",
  ) {}

  #load(): Map<EventId, Event> {
    if (this.#events) return this.#events;
    const encoded = parseJson<EncodedEvent[]>(
      this.storage.getItem(eventsKey(this.namespace)),
      [],
    );
    this.#events = new Map();
    for (const item of encoded) {
      const event = decodeEvent(item);
      if (!verifyId(event)) throw new Error(`invalid stored event id: ${event.id}`);
      this.#events.set(event.id, event);
    }
    return this.#events;
  }

  #persist(): void {
    const events = [...this.#load().values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(encodeEvent);
    this.storage.setItem(eventsKey(this.namespace), JSON.stringify(events));
  }

  async append(event: Event): Promise<AppendResult> {
    if (!verifyId(event)) throw new Error(`invalid event id: ${event.id}`);
    const events = this.#load();
    const existing = events.get(event.id);
    const inserted = existing === undefined;
    if (inserted || (existing.seq === undefined && event.seq !== undefined)) {
      events.set(event.id, event);
      this.#persist();
    }
    return { event, inserted };
  }

  async get(id: EventId): Promise<Event | undefined> {
    return this.#load().get(id);
  }

  async scan(filter: EventFilter = {}): Promise<Event[]> {
    const ids = filter.ids ? new Set(filter.ids) : null;
    return [...this.#load().values()].filter((event) => {
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

export class LocalClock implements RuntimeClock {
  #clock: Hlc;
  readonly replicaId: string;

  constructor(
    private readonly storage: LocalRuntimeStorage,
    private readonly namespace: string,
    replicaId: string,
    private readonly wall: () => number = () => Date.now(),
  ) {
    this.replicaId = replicaId;
    this.#clock = loadHlc(storage, clockKey(namespace, replicaId), replicaId);
  }

  #persist(): void {
    this.storage.setItem(
      clockKey(this.namespace, this.replicaId),
      JSON.stringify(this.#clock),
    );
  }

  current(): Hlc {
    return this.#clock;
  }

  async tick(): Promise<Hlc> {
    this.#clock = tick(this.#clock, this.wall(), this.replicaId);
    this.#persist();
    return this.#clock;
  }

  async receive(remote: Hlc): Promise<Hlc> {
    this.#clock = receive(this.#clock, remote, this.wall(), this.replicaId);
    this.#persist();
    return this.#clock;
  }
}

export class LocalSequencer implements RuntimeSequencer {
  #seq: number;
  readonly replicaId: string;

  constructor(
    private readonly storage: LocalRuntimeStorage,
    private readonly namespace: string,
    replicaId: string,
  ) {
    this.replicaId = replicaId;
    this.#seq = loadSeq(storage, seqKey(namespace, replicaId));
  }

  #persist(): void {
    this.storage.setItem(seqKey(this.namespace, this.replicaId), String(this.#seq));
  }

  async next(): Promise<number> {
    this.#seq += 1;
    this.#persist();
    return this.#seq;
  }

  current(): number {
    return this.#seq;
  }
}

export type LocalRuntimeOptions = {
  name?: string;
  replicaId: string;
  storage: LocalRuntimeStorage;
  namespace?: string;
  wall?: () => number;
  capabilities?: Iterable<RuntimeCapability>;
};

export function createLocalRuntime(
  options: LocalRuntimeOptions,
): RuntimeServices & {
  store: LocalEventStore;
  clock: LocalClock;
  sequencer: LocalSequencer;
} {
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
    store: new LocalEventStore(options.storage, namespace),
    clock: new LocalClock(
      options.storage,
      namespace,
      options.replicaId,
      options.wall,
    ),
    sequencer: new LocalSequencer(options.storage, namespace, options.replicaId),
  };
}
