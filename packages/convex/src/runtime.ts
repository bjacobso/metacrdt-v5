import type { Event, EventId } from "@metacrdt/core";
import {
  MemoryClock,
  MemorySequencer,
  RuntimeServiceError,
  runtimeServicesLayer,
  type AppendResult,
  type EventFilter,
  type EventStore,
  type MergeResult,
  type ProjectionFilter,
  type ProjectionReplaceResult,
  type ProjectionRow,
  type ProjectionStore,
  type ProjectionRuntimeServices,
  type RuntimeServices,
} from "@metacrdt/runtime";
import type { Layer } from "effect";

export type ConvexComponentRuntimeRefs = {
  readonly appendRaw: unknown;
  readonly getRawEvent: unknown;
  readonly listRawEvents: unknown;
  readonly replaceProjectionRows: unknown;
  readonly clearMaterializedProjection: unknown;
  readonly scanProjectionRows: unknown;
};

export type ConvexComponentRunner = {
  mutation(ref: unknown, args: unknown): Promise<unknown>;
  query(ref: unknown, args: unknown): Promise<unknown>;
};

export type ConvexComponentRuntimeOptions = {
  readonly runner: ConvexComponentRunner;
  readonly refs: ConvexComponentRuntimeRefs;
  readonly replicaId: string;
  readonly wall?: () => number;
};

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

function assertAppendResult(value: unknown): AppendResult {
  const result = value as Partial<AppendResult> | null;
  if (
    result === null ||
    typeof result !== "object" ||
    typeof result.inserted !== "boolean" ||
    result.event === undefined
  ) {
    throw new Error("component appendRaw returned an invalid AppendResult");
  }
  return result as AppendResult;
}

function assertMergeResult(value: unknown): Event[] {
  if (!Array.isArray(value)) {
    throw new Error("component event query returned a non-array result");
  }
  return value as Event[];
}

function assertProjectionRows(value: unknown): ProjectionRow[] {
  if (!Array.isArray(value)) {
    throw new Error("component projection query returned a non-array result");
  }
  return value as ProjectionRow[];
}

function assertProjectionReplaceResult(
  value: unknown,
): ProjectionReplaceResult {
  const result = value as Partial<ProjectionReplaceResult> | null;
  if (
    result === null ||
    typeof result !== "object" ||
    typeof result.rows !== "number"
  ) {
    throw new Error("component replaceProjectionRows returned an invalid result");
  }
  return result as ProjectionReplaceResult;
}

export class ConvexComponentEventStore implements EventStore {
  constructor(
    private readonly runner: ConvexComponentRunner,
    private readonly refs: ConvexComponentRuntimeRefs,
  ) {}

  async append(event: Event): Promise<AppendResult> {
    try {
      return assertAppendResult(
        await this.runner.mutation(this.refs.appendRaw, { event }),
      );
    } catch (cause) {
      throw serviceError("ConvexComponentEventStore", "append", cause);
    }
  }

  async get(id: EventId): Promise<Event | undefined> {
    try {
      return (
        ((await this.runner.query(this.refs.getRawEvent, {
          eventId: id,
        })) as Event | null) ?? undefined
      );
    } catch (cause) {
      throw serviceError("ConvexComponentEventStore", "get", cause);
    }
  }

  async scan(filter: EventFilter = {}): Promise<Event[]> {
    try {
      return assertMergeResult(
        await this.runner.query(this.refs.listRawEvents, {
          e: filter.e,
          a: filter.a,
          ids: filter.ids,
          target: filter.target,
          limit: 1000,
        }),
      );
    } catch (cause) {
      throw serviceError("ConvexComponentEventStore", "scan", cause);
    }
  }

  async merge(events: Iterable<Event>): Promise<MergeResult> {
    let seen = 0;
    let inserted = 0;
    for (const event of events) {
      seen += 1;
      if ((await this.append(event)).inserted) inserted += 1;
    }
    return { seen, inserted };
  }
}

export class ConvexComponentProjectionStore implements ProjectionStore {
  constructor(
    private readonly runner: ConvexComponentRunner,
    private readonly refs: ConvexComponentRuntimeRefs,
  ) {}

  async replace(
    rows: Iterable<ProjectionRow>,
  ): Promise<ProjectionReplaceResult> {
    try {
      return assertProjectionReplaceResult(
        await this.runner.mutation(this.refs.replaceProjectionRows, {
          rows: [...rows],
        }),
      );
    } catch (cause) {
      throw serviceError("ConvexComponentProjectionStore", "replace", cause);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.runner.mutation(this.refs.clearMaterializedProjection, {});
    } catch (cause) {
      throw serviceError("ConvexComponentProjectionStore", "clear", cause);
    }
  }

  async scan(filter: ProjectionFilter = {}): Promise<ProjectionRow[]> {
    try {
      return assertProjectionRows(
        await this.runner.query(this.refs.scanProjectionRows, {
          e: filter.e,
          a: filter.a,
          ids: filter.ids,
          eventIds: filter.eventIds,
          limit: 1000,
        }),
      );
    } catch (cause) {
      throw serviceError("ConvexComponentProjectionStore", "scan", cause);
    }
  }
}

export function createConvexComponentRuntime(
  options: ConvexComponentRuntimeOptions,
): RuntimeServices & {
  store: ConvexComponentEventStore;
  projection: ConvexComponentProjectionStore;
  clock: MemoryClock;
  sequencer: MemorySequencer;
} {
  return {
    profile: {
      name: "convex-component",
      replicaId: options.replicaId,
      capabilities: new Set(["convergent-log", "projection-store"]),
    },
    store: new ConvexComponentEventStore(options.runner, options.refs),
    projection: new ConvexComponentProjectionStore(options.runner, options.refs),
    clock: new MemoryClock(options.replicaId, options.wall),
    sequencer: new MemorySequencer(options.replicaId),
  };
}

export function createConvexComponentRuntimeLayer(
  options: ConvexComponentRuntimeOptions,
): Layer.Layer<ProjectionRuntimeServices, RuntimeServiceError> {
  return runtimeServicesLayer(createConvexComponentRuntime(options));
}
