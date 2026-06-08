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
  ProjectionFilter,
  ProjectionReplaceResult,
  ProjectionRow,
  ProjectionStore,
  RuntimeCapability,
  RuntimeClock,
  RuntimeProfile,
  RuntimeSequencer,
  RuntimeServices,
} from "./types.js";
import { runtimeServicesLayer } from "./services.js";

/**
 * The sync subset of `window.localStorage`, factored as an interface so tests and
 * non-browser hosts can provide the same semantics without a DOM dependency.
 */
export interface LocalRuntimeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export type EncodedLocalValue =
  | { z: 0 }
  | { b: boolean }
  | { f: number }
  | { s: string }
  | { x: number[] }
  | { a: EncodedLocalValue[] }
  | { o: Record<string, EncodedLocalValue> };

export type EncodedLocalEvent = Omit<Event, "v"> & { v?: EncodedLocalValue };

export type EncodedLocalProjectionRow = Omit<ProjectionRow, "v"> & {
  v: EncodedLocalValue;
};

export function localEventsKey(namespace: string): string {
  return `${namespace}:events`;
}

export function localClockKey(namespace: string, replicaId: string): string {
  return `${namespace}:clock:${replicaId}`;
}

export function localSeqKey(namespace: string, replicaId: string): string {
  return `${namespace}:seq:${replicaId}`;
}

export function localProjectionKey(namespace: string): string {
  return `${namespace}:projection`;
}

export function encodeLocalValue(v: Value): EncodedLocalValue {
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
  if (Array.isArray(v)) return { a: v.map(encodeLocalValue) };
  const out: Record<string, EncodedLocalValue> = {};
  for (const [k, value] of Object.entries(v)) out[k] = encodeLocalValue(value);
  return { o: out };
}

export function decodeLocalValue(v: EncodedLocalValue): Value {
  if ("z" in v) return null;
  if ("b" in v) return v.b;
  if ("f" in v) return v.f;
  if ("s" in v) return v.s;
  if ("x" in v) return new Uint8Array(v.x);
  if ("a" in v) return v.a.map(decodeLocalValue);
  const out: Record<string, Value> = {};
  for (const [k, value] of Object.entries(v.o)) out[k] = decodeLocalValue(value);
  return out;
}

export function encodeLocalEvent(event: Event): EncodedLocalEvent {
  const { v, ...rest } = event;
  const out: EncodedLocalEvent = { ...rest };
  if (v !== undefined) out.v = encodeLocalValue(v);
  return out;
}

export function decodeLocalEvent(event: EncodedLocalEvent): Event {
  const out = { ...event } as Event;
  if (event.v !== undefined) {
    (out as { v: Value }).v = decodeLocalValue(event.v);
  }
  return out;
}

export function encodeLocalProjectionRow(
  row: ProjectionRow,
): EncodedLocalProjectionRow {
  return { ...row, v: encodeLocalValue(row.v) };
}

export function decodeLocalProjectionRow(
  row: EncodedLocalProjectionRow,
): ProjectionRow {
  return { ...row, v: decodeLocalValue(row.v) };
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
    const encoded = parseJson<EncodedLocalEvent[]>(
      this.storage.getItem(localEventsKey(this.namespace)),
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

  #persist(): void {
    const events = [...this.#load().values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(encodeLocalEvent);
    this.storage.setItem(localEventsKey(this.namespace), JSON.stringify(events));
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

export class LocalProjectionStore implements ProjectionStore {
  #rows: Map<string, ProjectionRow> | undefined;

  constructor(
    private readonly storage: LocalRuntimeStorage,
    private readonly namespace = "metacrdt",
  ) {}

  #load(): Map<string, ProjectionRow> {
    if (this.#rows) return this.#rows;
    const encoded = parseJson<EncodedLocalProjectionRow[]>(
      this.storage.getItem(localProjectionKey(this.namespace)),
      [],
    );
    this.#rows = new Map();
    for (const item of encoded) {
      const row = decodeLocalProjectionRow(item);
      this.#rows.set(row.id, row);
    }
    return this.#rows;
  }

  #persist(): void {
    const rows = [...this.#load().values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(encodeLocalProjectionRow);
    this.storage.setItem(localProjectionKey(this.namespace), JSON.stringify(rows));
  }

  async replace(rows: Iterable<ProjectionRow>): Promise<ProjectionReplaceResult> {
    this.#rows = new Map();
    for (const row of rows) this.#rows.set(row.id, row);
    this.#persist();
    return { rows: this.#rows.size };
  }

  async clear(): Promise<void> {
    this.#rows = new Map();
    this.#persist();
  }

  async scan(filter: ProjectionFilter = {}): Promise<ProjectionRow[]> {
    const ids = filter.ids ? new Set(filter.ids) : null;
    const eventIds = filter.eventIds ? new Set(filter.eventIds) : null;
    return [...this.#load().values()]
      .filter((row) => {
        if (ids && !ids.has(row.id)) return false;
        if (eventIds && !eventIds.has(row.eventId)) return false;
        if (filter.e !== undefined && row.e !== filter.e) return false;
        if (filter.a !== undefined && row.a !== filter.a) return false;
        return true;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
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
    this.#clock = loadHlc(storage, localClockKey(namespace, replicaId), replicaId);
  }

  #persist(): void {
    this.storage.setItem(
      localClockKey(this.namespace, this.replicaId),
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
    this.#seq = loadSeq(storage, localSeqKey(namespace, replicaId));
  }

  #persist(): void {
    this.storage.setItem(localSeqKey(this.namespace, this.replicaId), String(this.#seq));
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
  projection: LocalProjectionStore;
  clock: LocalClock;
  sequencer: LocalSequencer;
} {
  const namespace = options.namespace ?? "metacrdt";
  const capabilities = new Set<RuntimeCapability>(
    options.capabilities ?? ["convergent-log", "projection-store"],
  );
  const profile: RuntimeProfile = {
    name: options.name ?? "local",
    replicaId: options.replicaId,
    capabilities,
  };
  return {
    profile,
    store: new LocalEventStore(options.storage, namespace),
    projection: new LocalProjectionStore(options.storage, namespace),
    clock: new LocalClock(
      options.storage,
      namespace,
      options.replicaId,
      options.wall,
    ),
    sequencer: new LocalSequencer(options.storage, namespace, options.replicaId),
  };
}

export function createLocalRuntimeLayer(options: LocalRuntimeOptions) {
  return runtimeServicesLayer(createLocalRuntime(options));
}
