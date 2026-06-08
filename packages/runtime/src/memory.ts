import {
  Event,
  EventId,
  Hlc,
  initialClock,
  receive,
  tick,
  verifyId,
} from "@metacrdt/core";
import {
  AppendResult,
  EventFilter,
  EventStore,
  MergeResult,
  RuntimeCapability,
  RuntimeClock,
  RuntimeProfile,
  RuntimeSequencer,
  RuntimeServices,
  ScheduledOperation,
  Scheduler,
  Transport,
} from "./types.js";

export class MemoryEventStore implements EventStore {
  #events = new Map<EventId, Event>();

  async append(event: Event): Promise<AppendResult> {
    if (!verifyId(event)) throw new Error(`invalid event id: ${event.id}`);
    const existing = this.#events.get(event.id);
    const inserted = existing === undefined;
    if (inserted || (existing.seq === undefined && event.seq !== undefined)) {
      this.#events.set(event.id, event);
    }
    return { event, inserted };
  }

  async get(id: EventId): Promise<Event | undefined> {
    return this.#events.get(id);
  }

  async scan(filter: EventFilter = {}): Promise<Event[]> {
    const ids = filter.ids ? new Set(filter.ids) : null;
    return [...this.#events.values()].filter((event) => {
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

export class MemoryClock implements RuntimeClock {
  #clock: Hlc;

  constructor(
    readonly replicaId: string,
    private readonly wall: () => number = () => Date.now(),
  ) {
    this.#clock = initialClock(replicaId);
  }

  current(): Hlc {
    return this.#clock;
  }

  async tick(): Promise<Hlc> {
    this.#clock = tick(this.#clock, this.wall(), this.replicaId);
    return this.#clock;
  }

  async receive(remote: Hlc): Promise<Hlc> {
    this.#clock = receive(this.#clock, remote, this.wall(), this.replicaId);
    return this.#clock;
  }
}

export class MemorySequencer implements RuntimeSequencer {
  #seq = 0;

  constructor(readonly replicaId: string) {}

  async next(): Promise<number> {
    this.#seq += 1;
    return this.#seq;
  }

  current(): number {
    return this.#seq;
  }

  observe(seq: number): void {
    if (seq > this.#seq) this.#seq = seq;
  }
}

export class MemoryScheduler implements Scheduler {
  readonly scheduled: { ms: number; op: ScheduledOperation }[] = [];

  async after(ms: number, op: ScheduledOperation): Promise<void> {
    this.scheduled.push({ ms, op });
  }
}

export class MemoryTransport implements Transport {
  readonly published: Event[][] = [];

  async publish(events: readonly Event[]): Promise<void> {
    this.published.push([...events]);
  }
}

export type MemoryRuntimeOptions = {
  name?: string;
  replicaId: string;
  wall?: () => number;
  capabilities?: Iterable<RuntimeCapability>;
};

export function createMemoryRuntime(
  options: MemoryRuntimeOptions,
): RuntimeServices & {
  store: MemoryEventStore;
  clock: MemoryClock;
  sequencer: MemorySequencer;
  scheduler: MemoryScheduler;
  transport: MemoryTransport;
} {
  const capabilities = new Set<RuntimeCapability>(
    options.capabilities ?? ["convergent-log"],
  );
  const profile: RuntimeProfile = {
    name: options.name ?? "memory",
    replicaId: options.replicaId,
    capabilities,
  };
  return {
    profile,
    store: new MemoryEventStore(),
    clock: new MemoryClock(options.replicaId, options.wall),
    sequencer: new MemorySequencer(options.replicaId),
    scheduler: new MemoryScheduler(),
    transport: new MemoryTransport(),
  };
}
