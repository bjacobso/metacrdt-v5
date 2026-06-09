import type { Event, EventId, Hlc } from "@metacrdt/core";
import { Context, Data, Effect, Layer } from "effect";
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
  ScheduledOperation,
  Scheduler,
  Transport,
} from "./types.js";

export class RuntimeServiceError extends Data.TaggedError("RuntimeServiceError")<{
  readonly service: string;
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class RuntimeCapabilityError extends Data.TaggedError("RuntimeCapabilityError")<{
  readonly runtime: string;
  readonly replicaId: string;
  readonly capability: RuntimeCapability;
}> {}

export class RuntimeOperationError extends Data.TaggedError("RuntimeOperationError")<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type RuntimeError =
  | RuntimeServiceError
  | RuntimeCapabilityError
  | RuntimeOperationError;

export type EventStoreEffect = {
  append(event: Event): Effect.Effect<AppendResult, RuntimeServiceError>;
  get(id: EventId): Effect.Effect<Event | undefined, RuntimeServiceError>;
  scan(filter?: EventFilter): Effect.Effect<Event[], RuntimeServiceError>;
  merge(events: Iterable<Event>): Effect.Effect<MergeResult, RuntimeServiceError>;
};

export type ProjectionStoreEffect = {
  replace(
    rows: Iterable<ProjectionRow>,
  ): Effect.Effect<ProjectionReplaceResult, RuntimeServiceError>;
  replaceMatching(
    filter: ProjectionFilter,
    rows: Iterable<ProjectionRow>,
  ): Effect.Effect<ProjectionReplaceResult, RuntimeServiceError>;
  clear(): Effect.Effect<void, RuntimeServiceError>;
  scan(filter?: ProjectionFilter): Effect.Effect<ProjectionRow[], RuntimeServiceError>;
};

export type RuntimeClockEffect = {
  readonly replicaId: string;
  current(): Effect.Effect<Hlc, RuntimeServiceError>;
  tick(): Effect.Effect<Hlc, RuntimeServiceError>;
  receive(remote: Hlc): Effect.Effect<Hlc, RuntimeServiceError>;
};

export type RuntimeSequencerEffect = {
  readonly replicaId: string;
  next(): Effect.Effect<number, RuntimeServiceError>;
  current(): Effect.Effect<number, RuntimeServiceError>;
};

export type SchedulerEffect = {
  after(
    ms: number,
    op: ScheduledOperation,
  ): Effect.Effect<void, RuntimeServiceError>;
};

export type TransportEffect = {
  publish(events: readonly Event[]): Effect.Effect<void, RuntimeServiceError>;
};

export class RuntimeProfileService extends Context.Tag(
  "@metacrdt/runtime/RuntimeProfileService",
)<RuntimeProfileService, RuntimeProfile>() {}

export class EventStoreService extends Context.Tag(
  "@metacrdt/runtime/EventStoreService",
)<EventStoreService, EventStoreEffect>() {}

export class ProjectionStoreService extends Context.Tag(
  "@metacrdt/runtime/ProjectionStoreService",
)<ProjectionStoreService, ProjectionStoreEffect>() {}

export class RuntimeClockService extends Context.Tag(
  "@metacrdt/runtime/RuntimeClockService",
)<RuntimeClockService, RuntimeClockEffect>() {}

export class RuntimeSequencerService extends Context.Tag(
  "@metacrdt/runtime/RuntimeSequencerService",
)<RuntimeSequencerService, RuntimeSequencerEffect>() {}

export class SchedulerService extends Context.Tag(
  "@metacrdt/runtime/SchedulerService",
)<SchedulerService, SchedulerEffect>() {}

export class TransportService extends Context.Tag(
  "@metacrdt/runtime/TransportService",
)<TransportService, TransportEffect>() {}

function serviceError(
  service: string,
  operation: string,
  cause: unknown,
): RuntimeServiceError {
  return new RuntimeServiceError({
    service,
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

function serviceEffect<A>(
  service: string,
  operation: string,
  f: () => A | Promise<A>,
): Effect.Effect<A, RuntimeServiceError> {
  return Effect.tryPromise({
    try: async () => await f(),
    catch: (cause) => serviceError(service, operation, cause),
  });
}

export function eventStoreService(store: EventStore): EventStoreEffect {
  return {
    append: (event) =>
      serviceEffect("EventStore", "append", () => store.append(event)),
    get: (id) => serviceEffect("EventStore", "get", () => store.get(id)),
    scan: (filter) =>
      serviceEffect("EventStore", "scan", () => store.scan(filter)),
    merge: (events) =>
      serviceEffect("EventStore", "merge", () => store.merge(events)),
  };
}

export function projectionStoreService(
  store: ProjectionStore,
): ProjectionStoreEffect {
  function matches(row: ProjectionRow, filter: ProjectionFilter): boolean {
    if (filter.e !== undefined && row.e !== filter.e) return false;
    if (filter.a !== undefined && row.a !== filter.a) return false;
    if (filter.ids !== undefined && !filter.ids.includes(row.id)) return false;
    if (
      filter.eventIds !== undefined &&
      !filter.eventIds.includes(row.eventId)
    ) {
      return false;
    }
    return true;
  }

  return {
    replace: (rows) =>
      serviceEffect("ProjectionStore", "replace", () => store.replace(rows)),
    replaceMatching: (filter, rows) =>
      serviceEffect("ProjectionStore", "replaceMatching", async () => {
        if (store.replaceMatching) {
          return await store.replaceMatching(filter, rows);
        }
        const incoming = [...rows];
        const current = await store.scan();
        const merged = [
          ...current.filter((row) => !matches(row, filter)),
          ...incoming,
        ];
        await store.replace(merged);
        return { rows: incoming.length };
      }),
    clear: () => serviceEffect("ProjectionStore", "clear", () => store.clear()),
    scan: (filter) =>
      serviceEffect("ProjectionStore", "scan", () => store.scan(filter)),
  };
}

export function runtimeClockService(clock: RuntimeClock): RuntimeClockEffect {
  return {
    replicaId: clock.replicaId,
    current: () =>
      serviceEffect("RuntimeClock", "current", () => clock.current()),
    tick: () => serviceEffect("RuntimeClock", "tick", () => clock.tick()),
    receive: (remote) =>
      serviceEffect("RuntimeClock", "receive", () => clock.receive(remote)),
  };
}

export function runtimeSequencerService(
  sequencer: RuntimeSequencer,
): RuntimeSequencerEffect {
  return {
    replicaId: sequencer.replicaId,
    next: () => serviceEffect("RuntimeSequencer", "next", () => sequencer.next()),
    current: () =>
      serviceEffect("RuntimeSequencer", "current", () => sequencer.current()),
  };
}

export function schedulerService(scheduler: Scheduler): SchedulerEffect {
  return {
    after: (ms, op) =>
      serviceEffect("Scheduler", "after", () => scheduler.after(ms, op)),
  };
}

export function transportService(transport: Transport): TransportEffect {
  return {
    publish: (events) =>
      serviceEffect("Transport", "publish", () => transport.publish(events)),
  };
}

export function noopSchedulerService(): SchedulerEffect {
  return {
    after: () => Effect.void,
  };
}

export function noopTransportService(): TransportEffect {
  return {
    publish: () => Effect.void,
  };
}

export function runtimeProfileLayer(profile: RuntimeProfile) {
  return Layer.succeed(RuntimeProfileService, profile);
}

export function eventStoreLayer(store: EventStore) {
  return Layer.succeed(EventStoreService, eventStoreService(store));
}

export function projectionStoreLayer(store: ProjectionStore) {
  return Layer.succeed(ProjectionStoreService, projectionStoreService(store));
}

export function runtimeClockLayer(clock: RuntimeClock) {
  return Layer.succeed(RuntimeClockService, runtimeClockService(clock));
}

export function runtimeSequencerLayer(sequencer: RuntimeSequencer) {
  return Layer.succeed(RuntimeSequencerService, runtimeSequencerService(sequencer));
}

export function schedulerLayer(scheduler: Scheduler) {
  return Layer.succeed(SchedulerService, schedulerService(scheduler));
}

export function transportLayer(transport: Transport) {
  return Layer.succeed(TransportService, transportService(transport));
}

type BaseRuntimeServicesLayerOptions = {
  profile: RuntimeProfile;
  store: EventStore;
  clock: RuntimeClock;
  sequencer: RuntimeSequencer;
  scheduler?: Scheduler;
  transport?: Transport;
};

type ProjectionRuntimeServicesLayerOptions = BaseRuntimeServicesLayerOptions & {
  projection: ProjectionStore;
};

export type BaseRuntimeServices =
  | RuntimeProfileService
  | EventStoreService
  | RuntimeClockService
  | RuntimeSequencerService
  | SchedulerService
  | TransportService;

export type ProjectionRuntimeServices =
  | BaseRuntimeServices
  | ProjectionStoreService;

export function runtimeServicesLayer(
  options: ProjectionRuntimeServicesLayerOptions,
): Layer.Layer<ProjectionRuntimeServices>;
export function runtimeServicesLayer(
  options: BaseRuntimeServicesLayerOptions,
): Layer.Layer<BaseRuntimeServices>;
export function runtimeServicesLayer(
  options: BaseRuntimeServicesLayerOptions & { projection?: ProjectionStore },
) {
  const base = Layer.mergeAll(
    runtimeProfileLayer(options.profile),
    eventStoreLayer(options.store),
    runtimeClockLayer(options.clock),
    runtimeSequencerLayer(options.sequencer),
    Layer.succeed(
      SchedulerService,
      options.scheduler ? schedulerService(options.scheduler) : noopSchedulerService(),
    ),
    Layer.succeed(
      TransportService,
      options.transport ? transportService(options.transport) : noopTransportService(),
    ),
  );
  return options.projection === undefined
    ? base
    : Layer.merge(base, projectionStoreLayer(options.projection));
}
