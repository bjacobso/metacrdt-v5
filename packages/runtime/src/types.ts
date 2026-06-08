import type {
  ActorType,
  Event,
  EventId,
  Hlc,
  Value,
} from "@metacrdt/core";

export type RuntimeCapability =
  | "convergent-log"
  | "coordinated-writes"
  | "projection-store"
  | "durable-scheduler"
  | "transport";

export type RuntimeProfile = {
  name: string;
  replicaId: string;
  capabilities: ReadonlySet<RuntimeCapability>;
};

export type AppendResult = {
  event: Event;
  inserted: boolean;
};

export type MergeResult = {
  inserted: number;
  seen: number;
};

export type VersionVector = Readonly<Record<string, number>>;

export type EventFilter = {
  e?: string;
  a?: string;
  ids?: readonly EventId[];
};

export interface EventStore {
  append(event: Event): Promise<AppendResult>;
  get(id: EventId): Promise<Event | undefined>;
  scan(filter?: EventFilter): Promise<Event[]>;
  merge(events: Iterable<Event>): Promise<MergeResult>;
}

export type ProjectionRow = {
  readonly id: string;
  readonly e: string;
  readonly a: string;
  readonly v: Value;
  readonly eventId: EventId;
  readonly validFrom?: number;
  readonly validTo?: number | null;
  readonly sourceEventIds: readonly EventId[];
};

export type ProjectionFilter = {
  e?: string;
  a?: string;
  ids?: readonly string[];
  eventIds?: readonly EventId[];
};

export type ProjectionReplaceResult = {
  rows: number;
};

export interface ProjectionStore {
  replace(rows: Iterable<ProjectionRow>): Promise<ProjectionReplaceResult>;
  replaceMatching?(
    filter: ProjectionFilter,
    rows: Iterable<ProjectionRow>,
  ): Promise<ProjectionReplaceResult>;
  clear(): Promise<void>;
  scan(filter?: ProjectionFilter): Promise<ProjectionRow[]>;
}

export interface RuntimeClock {
  readonly replicaId: string;
  current(): Hlc;
  tick(): Promise<Hlc>;
  receive(remote: Hlc): Promise<Hlc>;
}

export interface RuntimeSequencer {
  readonly replicaId: string;
  next(): Promise<number>;
  current(): number;
}

export interface Scheduler {
  after(ms: number, op: ScheduledOperation): Promise<void>;
}

export interface Transport {
  publish(events: readonly Event[]): Promise<void>;
}

export type ScheduledOperation = {
  op: string;
  payload?: unknown;
};

export type RuntimeServices = {
  profile: RuntimeProfile;
  store: EventStore;
  projection?: ProjectionStore;
  clock: RuntimeClock;
  sequencer?: RuntimeSequencer;
  scheduler?: Scheduler;
  transport?: Transport;
};

export type Actor = {
  actor: string;
  actorType?: ActorType;
};

export type AssertOperation = Actor & {
  op: "assert";
  e: string;
  a: string;
  v: Value;
  validFrom?: number;
  validTo?: number | null;
  causalRefs?: readonly EventId[];
  reason?: string;
};

export type TargetOperation = Actor & {
  op: "retract" | "tombstone" | "untombstone";
  target: EventId;
  causalRefs?: readonly EventId[];
  reason?: string;
};

export type Operation = AssertOperation | TargetOperation;
