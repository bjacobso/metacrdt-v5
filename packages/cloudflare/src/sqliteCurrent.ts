import {
  fromEvents,
  type ActorType,
  type CardinalityOf,
  type Coord,
  type Event,
  type Value,
} from "@metacrdt/core";
import {
  EventStoreService,
  ProjectionStoreService,
  RuntimeClockService,
  RuntimeProfileService,
  RuntimeSequencerService,
  TransportService,
  applyOperationEffect,
  projectionRowsFromLog,
  runtimeServicesLayer,
  type Operation,
  type ProjectionRow,
  type RuntimeError,
} from "@metacrdt/runtime";
import { Data, Effect } from "effect";
import * as Schema from "effect/Schema";
import type { DurableObjectSqliteRuntime } from "./durableObjectSqlite.js";

export class DurableObjectSqliteCurrentSurfaceError extends Data.TaggedError(
  "DurableObjectSqliteCurrentSurfaceError",
)<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export const DurableObjectSqliteCoordSchema = Schema.Struct({
  txTime: Schema.Number,
  validTime: Schema.Number,
});

export const DurableObjectSqliteCurrentFilterSchema = Schema.Struct({
  e: Schema.optionalWith(Schema.String, { exact: true }),
  a: Schema.optionalWith(Schema.String, { exact: true }),
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteCurrentEntityArgsSchema = Schema.Struct({
  e: Schema.String,
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteCurrentEntitiesArgsSchema = Schema.Struct({
  type: Schema.optionalWith(Schema.String, { exact: true }),
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteRebuildCurrentArgsSchema = Schema.Struct({
  coord: DurableObjectSqliteCoordSchema,
});

export const DurableObjectSqliteAppendAssertArgsSchema = Schema.Struct({
  e: Schema.String,
  a: Schema.String,
  v: Schema.Any,
  validFrom: Schema.optionalWith(Schema.Number, { exact: true }),
  validTo: Schema.optionalWith(Schema.Union(Schema.Number, Schema.Null), {
    exact: true,
  }),
  actor: Schema.String,
  actorType: Schema.optionalWith(
    Schema.Literal("human", "agent", "system", "migration"),
    { exact: true },
  ),
  causalRefs: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
  reason: Schema.optionalWith(Schema.String, { exact: true }),
});

export const DurableObjectSqliteAppendLifecycleArgsSchema = Schema.Struct({
  kind: Schema.Literal("retract", "tombstone", "untombstone"),
  target: Schema.String,
  actor: Schema.String,
  actorType: Schema.optionalWith(
    Schema.Literal("human", "agent", "system", "migration"),
    { exact: true },
  ),
  causalRefs: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
  reason: Schema.optionalWith(Schema.String, { exact: true }),
});

export type DurableObjectSqliteCurrentFilter =
  typeof DurableObjectSqliteCurrentFilterSchema.Type;
export type DurableObjectSqliteCurrentEntityArgs =
  typeof DurableObjectSqliteCurrentEntityArgsSchema.Type;
export type DurableObjectSqliteCurrentEntitiesArgs =
  typeof DurableObjectSqliteCurrentEntitiesArgsSchema.Type;
export type DurableObjectSqliteRebuildCurrentArgs =
  typeof DurableObjectSqliteRebuildCurrentArgsSchema.Type;
export type DurableObjectSqliteAppendAssertArgs =
  typeof DurableObjectSqliteAppendAssertArgsSchema.Type;
export type DurableObjectSqliteAppendLifecycleArgs =
  typeof DurableObjectSqliteAppendLifecycleArgsSchema.Type;

export type DurableObjectSqliteCurrentEntity = {
  readonly e: string;
  readonly attributes: Readonly<Record<string, readonly Value[]>>;
  readonly rows: readonly ProjectionRow[];
};

export type DurableObjectSqliteCurrentEntityListItem = {
  readonly e: string;
  readonly type?: string;
  readonly name?: string;
  readonly rows: number;
};

export type DurableObjectSqliteRebuildCurrentResult = {
  readonly events: number;
  readonly rows: number;
};

export type DurableObjectSqliteAppendAndRebuildResult = {
  readonly event: Event;
  readonly projection: DurableObjectSqliteRebuildCurrentResult;
};

export type DurableObjectSqliteCurrentSurfaceOptions = {
  readonly cardinalityOf: CardinalityOf;
  readonly currentCoord?: () => Coord;
};

export type DurableObjectSqliteCurrentSurface = {
  appendAssert(
    args: DurableObjectSqliteAppendAssertArgs,
  ): Promise<DurableObjectSqliteAppendAndRebuildResult>;
  appendLifecycle(
    args: DurableObjectSqliteAppendLifecycleArgs,
  ): Promise<DurableObjectSqliteAppendAndRebuildResult>;
  rebuildCurrent(
    args?: DurableObjectSqliteRebuildCurrentArgs,
  ): Promise<DurableObjectSqliteRebuildCurrentResult>;
  listCurrent(
    args?: DurableObjectSqliteCurrentFilter,
  ): Promise<ProjectionRow[]>;
  getCurrentEntity(
    args: DurableObjectSqliteCurrentEntityArgs,
  ): Promise<DurableObjectSqliteCurrentEntity | null>;
  listCurrentEntities(
    args?: DurableObjectSqliteCurrentEntitiesArgs,
  ): Promise<DurableObjectSqliteCurrentEntityListItem[]>;
};

function decode<A, I>(
  operation: string,
  schema: Schema.Schema<A, I>,
  input: unknown,
): Effect.Effect<A, DurableObjectSqliteCurrentSurfaceError> {
  return Effect.try({
    try: () => Schema.decodeUnknownSync(schema)(input),
    catch: (cause) =>
      new DurableObjectSqliteCurrentSurfaceError({
        operation,
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  });
}

function surfaceError(
  operation: string,
  cause: unknown,
): DurableObjectSqliteCurrentSurfaceError {
  return new DurableObjectSqliteCurrentSurfaceError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

function limit(n: number | undefined, fallback: number, max: number): number {
  const value = Number.isFinite(n) ? n! : fallback;
  return Math.max(1, Math.min(Math.floor(value), max));
}

function sortRows(rows: readonly ProjectionRow[]): ProjectionRow[] {
  return [...rows].sort((a, b) => {
    const e = a.e.localeCompare(b.e);
    if (e !== 0) return e;
    const attr = a.a.localeCompare(b.a);
    if (attr !== 0) return attr;
    return a.eventId.localeCompare(b.eventId);
  });
}

function entityFromRows(
  e: string,
  rows: readonly ProjectionRow[],
): DurableObjectSqliteCurrentEntity | null {
  if (rows.length === 0) return null;
  const attributes: Record<string, Value[]> = {};
  for (const row of sortRows(rows)) {
    const values = attributes[row.a] ?? [];
    values.push(row.v);
    attributes[row.a] = values;
  }
  return { e, attributes, rows: sortRows(rows) };
}

function listItemFromRows(
  e: string,
  rows: readonly ProjectionRow[],
): DurableObjectSqliteCurrentEntityListItem {
  const type = rows.find((row) => row.a === "type" && typeof row.v === "string")
    ?.v as string | undefined;
  const name = rows.find((row) => row.a === "name" && typeof row.v === "string")
    ?.v as string | undefined;
  return { e, type, name, rows: rows.length };
}

export function rebuildDurableObjectSqliteCurrentEffect(
  args: DurableObjectSqliteRebuildCurrentArgs,
  cardinalityOf: CardinalityOf,
): Effect.Effect<
  DurableObjectSqliteRebuildCurrentResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  EventStoreService | ProjectionStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "rebuildCurrent",
      DurableObjectSqliteRebuildCurrentArgsSchema,
      args,
    );
    const store = yield* EventStoreService;
    const projection = yield* ProjectionStoreService;
    const events = yield* store.scan();
    const rows = yield* Effect.try({
      try: () => projectionRowsFromLog(fromEvents(events), decoded.coord, cardinalityOf),
      catch: (cause) => surfaceError("rebuildCurrent", cause),
    });
    const replaced = yield* projection.replace(rows);
    return { events: events.length, rows: replaced.rows };
  });
}

export function listDurableObjectSqliteCurrentEffect(
  args: DurableObjectSqliteCurrentFilter = {},
): Effect.Effect<
  ProjectionRow[],
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  ProjectionStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "listCurrent",
      DurableObjectSqliteCurrentFilterSchema,
      args,
    );
    const projection = yield* ProjectionStoreService;
    const rows = yield* projection.scan({
      ...(decoded.e === undefined ? {} : { e: decoded.e }),
      ...(decoded.a === undefined ? {} : { a: decoded.a }),
    });
    return sortRows(rows).slice(0, limit(decoded.limit, 50, 500));
  });
}

export function getDurableObjectSqliteCurrentEntityEffect(
  args: DurableObjectSqliteCurrentEntityArgs,
): Effect.Effect<
  DurableObjectSqliteCurrentEntity | null,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  ProjectionStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "getCurrentEntity",
      DurableObjectSqliteCurrentEntityArgsSchema,
      args,
    );
    const rows = yield* listDurableObjectSqliteCurrentEffect({
      e: decoded.e,
      limit: limit(decoded.limit, 200, 500),
    });
    return entityFromRows(decoded.e, rows);
  });
}

export function listDurableObjectSqliteCurrentEntitiesEffect(
  args: DurableObjectSqliteCurrentEntitiesArgs = {},
): Effect.Effect<
  DurableObjectSqliteCurrentEntityListItem[],
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  ProjectionStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "listCurrentEntities",
      DurableObjectSqliteCurrentEntitiesArgsSchema,
      args,
    );
    const projection = yield* ProjectionStoreService;
    const typeRows = yield* projection.scan({ a: "type" });
    const entityIds = [
      ...new Set(
        typeRows
          .filter(
            (row) =>
              decoded.type === undefined ||
              (typeof row.v === "string" && row.v === decoded.type),
          )
          .sort((a, b) => a.e.localeCompare(b.e))
          .map((row) => row.e),
      ),
    ].slice(0, limit(decoded.limit, 50, 200));

    const out: DurableObjectSqliteCurrentEntityListItem[] = [];
    for (const e of entityIds) {
      const rows = yield* projection.scan({ e });
      out.push(listItemFromRows(e, rows));
    }
    return out.sort((a, b) => a.e.localeCompare(b.e));
  });
}

function assertOperationFromArgs(
  args: DurableObjectSqliteAppendAssertArgs,
): Operation {
  return {
    op: "assert",
    e: args.e,
    a: args.a,
    v: args.v,
    validFrom: args.validFrom,
    validTo: args.validTo,
    actor: args.actor,
    actorType: args.actorType as ActorType | undefined,
    causalRefs: args.causalRefs,
    reason: args.reason,
  };
}

function lifecycleOperationFromArgs(
  args: DurableObjectSqliteAppendLifecycleArgs,
): Operation {
  return {
    op: args.kind,
    target: args.target,
    actor: args.actor,
    actorType: args.actorType as ActorType | undefined,
    causalRefs: args.causalRefs,
    reason: args.reason,
  };
}

export function appendAssertAndRebuildDurableObjectSqliteCurrentEffect(
  args: DurableObjectSqliteAppendAssertArgs,
  cardinalityOf: CardinalityOf,
  coord: Coord,
): Effect.Effect<
  DurableObjectSqliteAppendAndRebuildResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  | EventStoreService
  | ProjectionStoreService
  | RuntimeClockService
  | RuntimeSequencerService
  | RuntimeProfileService
  | TransportService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "appendAssert",
      DurableObjectSqliteAppendAssertArgsSchema,
      args,
    );
    const event = yield* applyOperationEffect(assertOperationFromArgs(decoded));
    const projection = yield* rebuildDurableObjectSqliteCurrentEffect(
      { coord },
      cardinalityOf,
    );
    return { event, projection };
  });
}

export function appendLifecycleAndRebuildDurableObjectSqliteCurrentEffect(
  args: DurableObjectSqliteAppendLifecycleArgs,
  cardinalityOf: CardinalityOf,
  coord: Coord,
): Effect.Effect<
  DurableObjectSqliteAppendAndRebuildResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  | EventStoreService
  | ProjectionStoreService
  | RuntimeClockService
  | RuntimeSequencerService
  | RuntimeProfileService
  | TransportService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "appendLifecycle",
      DurableObjectSqliteAppendLifecycleArgsSchema,
      args,
    );
    const event = yield* applyOperationEffect(lifecycleOperationFromArgs(decoded));
    const projection = yield* rebuildDurableObjectSqliteCurrentEffect(
      { coord },
      cardinalityOf,
    );
    return { event, projection };
  });
}

function runtimeLayer(runtime: DurableObjectSqliteRuntime) {
  return runtimeServicesLayer({
    profile: runtime.profile,
    store: runtime.store,
    projection: runtime.projection,
    clock: runtime.clock,
    sequencer: runtime.sequencer,
    scheduler: runtime.scheduler,
    transport: runtime.transport,
  });
}

export function createDurableObjectSqliteCurrentSurface(
  runtime: DurableObjectSqliteRuntime,
  options: DurableObjectSqliteCurrentSurfaceOptions,
): DurableObjectSqliteCurrentSurface {
  const coord = () => options.currentCoord?.() ?? {
    txTime: runtime.clock.current().pt,
    validTime: runtime.clock.current().pt,
  };
  const run = <A, E>(effect: Effect.Effect<A, E, any>) =>
    Effect.runPromise(
      Effect.provide(effect, runtimeLayer(runtime)) as Effect.Effect<A, E, never>,
    );
  return {
    appendAssert: (args) =>
      run(
        appendAssertAndRebuildDurableObjectSqliteCurrentEffect(
          args,
          options.cardinalityOf,
          coord(),
        ),
      ),
    appendLifecycle: (args) =>
      run(
        appendLifecycleAndRebuildDurableObjectSqliteCurrentEffect(
          args,
          options.cardinalityOf,
          coord(),
        ),
      ),
    rebuildCurrent: (args) =>
      run(
        rebuildDurableObjectSqliteCurrentEffect(
          args ?? { coord: coord() },
          options.cardinalityOf,
        ),
      ),
    listCurrent: (args = {}) => run(listDurableObjectSqliteCurrentEffect(args)),
    getCurrentEntity: (args) =>
      run(getDurableObjectSqliteCurrentEntityEffect(args)),
    listCurrentEntities: (args = {}) =>
      run(listDurableObjectSqliteCurrentEntitiesEffect(args)),
  };
}
