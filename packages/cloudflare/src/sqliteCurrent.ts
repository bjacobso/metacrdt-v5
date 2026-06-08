import {
  fromEvents,
  type ActorType,
  type CardinalityOf,
  type Coord,
  type Event,
  type Value,
} from "@metacrdt/core";
import type { DerivedRow, ResultPage } from "@metacrdt/query";
import {
  EventStoreService,
  ProjectionStoreService,
  RuntimeClockService,
  DatalogQueryService,
  RuntimeProfileService,
  RuntimeSequencerService,
  TransportService,
  applyOperationEffect,
  datalogQueryLayer,
  projectionDatalogQueryLayer,
  projectionRowsFromLog,
  runtimeServicesLayer,
  type DatalogAggregateArgsType,
  type DatalogDerivedRowsArgsType,
  type DatalogQueryArgsType,
  type DatalogQueryPageArgsType,
  type DatalogQueryResult,
  type EventStoreEffect,
  type Operation,
  type ProjectionRow,
  type RuntimeError,
} from "@metacrdt/runtime";
import { Data, Effect, Layer } from "effect";
import * as Schema from "effect/Schema";
import type {
  DurableObjectSqliteCollection,
  DurableObjectSqliteCollectionStatus,
  DurableObjectSqliteCollectionStore,
  DurableObjectSqliteRuntime,
} from "./durableObjectSqlite.js";

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

export const DurableObjectSqliteEventArgsSchema = Schema.Struct({
  id: Schema.String,
});

export const DurableObjectSqliteEventFilterSchema = Schema.Struct({
  e: Schema.optionalWith(Schema.String, { exact: true }),
  a: Schema.optionalWith(Schema.String, { exact: true }),
  ids: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
  target: Schema.optionalWith(Schema.String, { exact: true }),
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

export const DurableObjectSqliteCollectionStatusSchema = Schema.Literal(
  "issued",
  "submitted",
  "expired",
);

export const DurableObjectSqliteIssueCollectionArgsSchema = Schema.Struct({
  token: Schema.String,
  subject: Schema.String,
  form: Schema.String,
  issuedAt: Schema.optionalWith(Schema.Number, { exact: true }),
  expiresAt: Schema.optionalWith(Schema.Union(Schema.Number, Schema.Null), {
    exact: true,
  }),
  runId: Schema.optionalWith(Schema.String, { exact: true }),
  stepId: Schema.optionalWith(Schema.String, { exact: true }),
  scope: Schema.optionalWith(Schema.String, { exact: true }),
});

export const DurableObjectSqliteCollectionByTokenArgsSchema = Schema.Struct({
  token: Schema.String,
});

export const DurableObjectSqliteListCollectionsArgsSchema = Schema.Struct({
  subject: Schema.optionalWith(Schema.String, { exact: true }),
  status: Schema.optionalWith(DurableObjectSqliteCollectionStatusSchema, {
    exact: true,
  }),
  limit: Schema.optionalWith(Schema.Number, { exact: true }),
});

export const DurableObjectSqliteSubmitCollectionArgsSchema = Schema.Struct({
  token: Schema.String,
  submittedAt: Schema.optionalWith(Schema.Number, { exact: true }),
  data: Schema.optionalWith(Schema.Any, { exact: true }),
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
export type DurableObjectSqliteEventArgs =
  typeof DurableObjectSqliteEventArgsSchema.Type;
export type DurableObjectSqliteEventFilter =
  typeof DurableObjectSqliteEventFilterSchema.Type;
export type DurableObjectSqliteCurrentEntityArgs =
  typeof DurableObjectSqliteCurrentEntityArgsSchema.Type;
export type DurableObjectSqliteCurrentEntitiesArgs =
  typeof DurableObjectSqliteCurrentEntitiesArgsSchema.Type;
export type DurableObjectSqliteRebuildCurrentArgs =
  typeof DurableObjectSqliteRebuildCurrentArgsSchema.Type;
export type DurableObjectSqliteIssueCollectionArgs =
  typeof DurableObjectSqliteIssueCollectionArgsSchema.Type;
export type DurableObjectSqliteCollectionByTokenArgs =
  typeof DurableObjectSqliteCollectionByTokenArgsSchema.Type;
export type DurableObjectSqliteListCollectionsArgs =
  typeof DurableObjectSqliteListCollectionsArgsSchema.Type;
export type DurableObjectSqliteSubmitCollectionArgs =
  typeof DurableObjectSqliteSubmitCollectionArgsSchema.Type;
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

export type DurableObjectSqliteProjectionChange = {
  readonly e: string;
  readonly a: string;
  readonly beforeEventIds: readonly string[];
  readonly afterEventIds: readonly string[];
};

export type DurableObjectSqliteRebuildCurrentResult = {
  readonly events: number;
  readonly rows: number;
  readonly changed: readonly DurableObjectSqliteProjectionChange[];
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
  getEvent(args: DurableObjectSqliteEventArgs): Promise<Event | undefined>;
  listEvents(args?: DurableObjectSqliteEventFilter): Promise<Event[]>;
  query(args: DatalogQueryArgsType): Promise<DatalogQueryResult>;
  page(
    args: DatalogQueryPageArgsType,
  ): Promise<ResultPage<Record<string, unknown>>>;
  aggregate(args: DatalogAggregateArgsType): Promise<Record<string, unknown>[]>;
  derivedRows(args: DatalogDerivedRowsArgsType): Promise<DerivedRow[]>;
  queryCurrent(args: DatalogQueryArgsType): Promise<DatalogQueryResult>;
  pageCurrent(
    args: DatalogQueryPageArgsType,
  ): Promise<ResultPage<Record<string, unknown>>>;
  aggregateCurrent(
    args: DatalogAggregateArgsType,
  ): Promise<Record<string, unknown>[]>;
  derivedRowsCurrent(args: DatalogDerivedRowsArgsType): Promise<DerivedRow[]>;
  rebuildCurrent(
    args?: DurableObjectSqliteRebuildCurrentArgs,
  ): Promise<DurableObjectSqliteRebuildCurrentResult>;
  issueCollection(
    args: DurableObjectSqliteIssueCollectionArgs,
  ): Promise<DurableObjectSqliteCollection>;
  collectionByToken(
    args: DurableObjectSqliteCollectionByTokenArgs,
  ): Promise<DurableObjectSqliteCollection | undefined>;
  listCollections(
    args?: DurableObjectSqliteListCollectionsArgs,
  ): Promise<DurableObjectSqliteCollection[]>;
  submitCollection(
    args: DurableObjectSqliteSubmitCollectionArgs,
  ): Promise<DurableObjectSqliteCollection>;
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

function projectionCoordKey(row: Pick<ProjectionRow, "e" | "a">): string {
  return `${row.e}\u0000${row.a}`;
}

function sortedEventIds(rows: readonly ProjectionRow[]): string[] {
  return [...new Set(rows.map((row) => row.eventId))].sort((a, b) =>
    a.localeCompare(b),
  );
}

function projectionChangeSummary(
  before: readonly ProjectionRow[],
  after: readonly ProjectionRow[],
): DurableObjectSqliteProjectionChange[] {
  const beforeByCoord = new Map<string, ProjectionRow[]>();
  const afterByCoord = new Map<string, ProjectionRow[]>();
  for (const row of before) {
    const group = beforeByCoord.get(projectionCoordKey(row)) ?? [];
    group.push(row);
    beforeByCoord.set(projectionCoordKey(row), group);
  }
  for (const row of after) {
    const group = afterByCoord.get(projectionCoordKey(row)) ?? [];
    group.push(row);
    afterByCoord.set(projectionCoordKey(row), group);
  }

  const keys = [...new Set([...beforeByCoord.keys(), ...afterByCoord.keys()])].sort(
    (a, b) => a.localeCompare(b),
  );
  const changes: DurableObjectSqliteProjectionChange[] = [];
  for (const key of keys) {
    const beforeRows = beforeByCoord.get(key) ?? [];
    const afterRows = afterByCoord.get(key) ?? [];
    const beforeEventIds = sortedEventIds(beforeRows);
    const afterEventIds = sortedEventIds(afterRows);
    if (beforeEventIds.join("\u0000") === afterEventIds.join("\u0000")) {
      continue;
    }
    const sample = afterRows[0] ?? beforeRows[0];
    if (sample === undefined) continue;
    changes.push({
      e: sample.e,
      a: sample.a,
      beforeEventIds,
      afterEventIds,
    });
  }
  return changes;
}

function sortEvents(events: readonly Event[]): Event[] {
  return [...events].sort((a, b) => a.id.localeCompare(b.id));
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

type ProjectionCoord = {
  readonly e: string;
  readonly a: string;
};

function assertCoord(event: Event): ProjectionCoord | undefined {
  return event.kind === "assert" &&
    event.e !== undefined &&
    event.a !== undefined
    ? { e: event.e, a: event.a }
    : undefined;
}

function rowsForCoord(
  rows: readonly ProjectionRow[],
  coord: ProjectionCoord,
): ProjectionRow[] {
  return rows.filter((row) => row.e === coord.e && row.a === coord.a);
}

function uniqueEvents(events: Iterable<Event>): Event[] {
  return [...new Map([...events].map((event) => [event.id, event])).values()];
}

function eventsForCoord(
  store: EventStoreEffect,
  coord: ProjectionCoord,
): Effect.Effect<Event[], RuntimeError> {
  return Effect.gen(function* () {
    const asserts = yield* store.scan(coord);
    const lifecycleGroups = yield* Effect.all(
      asserts.map((event) => store.scan({ target: event.id })),
      { concurrency: "unbounded" },
    );
    return uniqueEvents([...asserts, ...lifecycleGroups.flat()]);
  });
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
    const beforeRows = yield* projection.scan();
    const events = yield* store.scan();
    const rows = yield* Effect.try({
      try: () => projectionRowsFromLog(fromEvents(events), decoded.coord, cardinalityOf),
      catch: (cause) => surfaceError("rebuildCurrent", cause),
    });
    const replaced = yield* projection.replace(rows);
    return {
      events: events.length,
      rows: replaced.rows,
      changed: projectionChangeSummary(beforeRows, rows),
    };
  });
}

export function reconcileDurableObjectSqliteCurrentEventEffect(
  event: Event,
  cardinalityOf: CardinalityOf,
  coord: Coord,
): Effect.Effect<
  DurableObjectSqliteRebuildCurrentResult,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  EventStoreService | ProjectionStoreService
> {
  return Effect.gen(function* () {
    const store = yield* EventStoreService;
    const projection = yield* ProjectionStoreService;
    const targetEvents = event.target === undefined
      ? []
      : yield* store.scan({ ids: [event.target] });
    const target = targetEvents[0];
    const touched = assertCoord(event) ?? (target ? assertCoord(target) : undefined);
    if (touched === undefined) {
      const rows = yield* projection.scan();
      return { events: 0, rows: rows.length, changed: [] };
    }

    const beforeRows = yield* projection.scan(touched);
    const events = yield* eventsForCoord(store, touched);
    const afterRows = yield* Effect.try({
      try: () =>
        rowsForCoord(
          projectionRowsFromLog(fromEvents(events), coord, cardinalityOf),
          touched,
        ),
      catch: (cause) => surfaceError("reconcileCurrent", cause),
    });
    yield* projection.replaceMatching(touched, afterRows);
    const currentRows = yield* projection.scan();
    return {
      events: events.length,
      rows: currentRows.length,
      changed: projectionChangeSummary(beforeRows, afterRows),
    };
  });
}

export function getDurableObjectSqliteEventEffect(
  args: DurableObjectSqliteEventArgs,
): Effect.Effect<
  Event | undefined,
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  EventStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "getEvent",
      DurableObjectSqliteEventArgsSchema,
      args,
    );
    const store = yield* EventStoreService;
    return yield* store.get(decoded.id);
  });
}

export function listDurableObjectSqliteEventsEffect(
  args: DurableObjectSqliteEventFilter = {},
): Effect.Effect<
  Event[],
  RuntimeError | DurableObjectSqliteCurrentSurfaceError,
  EventStoreService
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "listEvents",
      DurableObjectSqliteEventFilterSchema,
      args,
    );
    const store = yield* EventStoreService;
    const events = yield* store.scan({
      ...(decoded.e === undefined ? {} : { e: decoded.e }),
      ...(decoded.a === undefined ? {} : { a: decoded.a }),
      ...(decoded.ids === undefined ? {} : { ids: decoded.ids }),
      ...(decoded.target === undefined ? {} : { target: decoded.target }),
    });
    return sortEvents(events).slice(0, limit(decoded.limit, 100, 1000));
  });
}

export function issueDurableObjectSqliteCollectionEffect(
  collections: DurableObjectSqliteCollectionStore,
  args: DurableObjectSqliteIssueCollectionArgs,
  defaultIssuedAt: number,
): Effect.Effect<
  DurableObjectSqliteCollection,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "issueCollection",
      DurableObjectSqliteIssueCollectionArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () =>
        collections.issue({
          token: decoded.token,
          subject: decoded.subject,
          form: decoded.form,
          issuedAt: decoded.issuedAt ?? defaultIssuedAt,
          expiresAt: decoded.expiresAt,
          runId: decoded.runId,
          stepId: decoded.stepId,
          scope: decoded.scope,
        }),
      catch: (cause) => surfaceError("issueCollection", cause),
    });
  });
}

export function getDurableObjectSqliteCollectionByTokenEffect(
  collections: DurableObjectSqliteCollectionStore,
  args: DurableObjectSqliteCollectionByTokenArgs,
): Effect.Effect<
  DurableObjectSqliteCollection | undefined,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "collectionByToken",
      DurableObjectSqliteCollectionByTokenArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () => collections.get(decoded.token),
      catch: (cause) => surfaceError("collectionByToken", cause),
    });
  });
}

export function listDurableObjectSqliteCollectionsEffect(
  collections: DurableObjectSqliteCollectionStore,
  args: DurableObjectSqliteListCollectionsArgs = {},
): Effect.Effect<
  DurableObjectSqliteCollection[],
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "listCollections",
      DurableObjectSqliteListCollectionsArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () =>
        collections.list({
          subject: decoded.subject,
          status: decoded.status as DurableObjectSqliteCollectionStatus | undefined,
          limit: limit(decoded.limit, 100, 1000),
        }),
      catch: (cause) => surfaceError("listCollections", cause),
    });
  });
}

export function submitDurableObjectSqliteCollectionEffect(
  collections: DurableObjectSqliteCollectionStore,
  args: DurableObjectSqliteSubmitCollectionArgs,
  defaultSubmittedAt: number,
): Effect.Effect<
  DurableObjectSqliteCollection,
  DurableObjectSqliteCurrentSurfaceError
> {
  return Effect.gen(function* () {
    const decoded = yield* decode(
      "submitCollection",
      DurableObjectSqliteSubmitCollectionArgsSchema,
      args,
    );
    return yield* Effect.tryPromise({
      try: () =>
        collections.submit({
          token: decoded.token,
          submittedAt: decoded.submittedAt ?? defaultSubmittedAt,
          data: decoded.data,
        }),
      catch: (cause) => surfaceError("submitCollection", cause),
    });
  });
}

export function queryDurableObjectSqliteEffect(
  args: DatalogQueryArgsType,
): Effect.Effect<DatalogQueryResult, RuntimeError, DatalogQueryService> {
  return Effect.gen(function* () {
    const datalog = yield* DatalogQueryService;
    return yield* datalog.query(args);
  });
}

export function pageDurableObjectSqliteEffect(
  args: DatalogQueryPageArgsType,
): Effect.Effect<
  ResultPage<Record<string, unknown>>,
  RuntimeError,
  DatalogQueryService
> {
  return Effect.gen(function* () {
    const datalog = yield* DatalogQueryService;
    return yield* datalog.page(args);
  });
}

export function aggregateDurableObjectSqliteEffect(
  args: DatalogAggregateArgsType,
): Effect.Effect<Record<string, unknown>[], RuntimeError, DatalogQueryService> {
  return Effect.gen(function* () {
    const datalog = yield* DatalogQueryService;
    return yield* datalog.aggregate(args);
  });
}

export function derivedRowsDurableObjectSqliteEffect(
  args: DatalogDerivedRowsArgsType,
): Effect.Effect<DerivedRow[], RuntimeError, DatalogQueryService> {
  return Effect.gen(function* () {
    const datalog = yield* DatalogQueryService;
    return yield* datalog.derivedRows(args);
  });
}

export function queryDurableObjectSqliteCurrentEffect(
  args: DatalogQueryArgsType,
): Effect.Effect<DatalogQueryResult, RuntimeError, DatalogQueryService> {
  return queryDurableObjectSqliteEffect(args);
}

export function pageDurableObjectSqliteCurrentEffect(
  args: DatalogQueryPageArgsType,
): Effect.Effect<
  ResultPage<Record<string, unknown>>,
  RuntimeError,
  DatalogQueryService
> {
  return pageDurableObjectSqliteEffect(args);
}

export function aggregateDurableObjectSqliteCurrentEffect(
  args: DatalogAggregateArgsType,
): Effect.Effect<Record<string, unknown>[], RuntimeError, DatalogQueryService> {
  return aggregateDurableObjectSqliteEffect(args);
}

export function derivedRowsDurableObjectSqliteCurrentEffect(
  args: DatalogDerivedRowsArgsType,
): Effect.Effect<DerivedRow[], RuntimeError, DatalogQueryService> {
  return derivedRowsDurableObjectSqliteEffect(args);
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
    const projection = yield* reconcileDurableObjectSqliteCurrentEventEffect(
      event,
      cardinalityOf,
      coord,
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
    const projection = yield* reconcileDurableObjectSqliteCurrentEventEffect(
      event,
      cardinalityOf,
      coord,
    );
    return { event, projection };
  });
}

function runtimeLayer(runtime: DurableObjectSqliteRuntime) {
  const services = runtimeServicesLayer({
    profile: runtime.profile,
    store: runtime.store,
    projection: runtime.projection,
    clock: runtime.clock,
    sequencer: runtime.sequencer,
    scheduler: runtime.scheduler,
    transport: runtime.transport,
  });
  return Layer.provideMerge(services)(datalogQueryLayer());
}

function currentQueryRuntimeLayer(runtime: DurableObjectSqliteRuntime) {
  const services = runtimeServicesLayer({
    profile: runtime.profile,
    store: runtime.store,
    projection: runtime.projection,
    clock: runtime.clock,
    sequencer: runtime.sequencer,
    scheduler: runtime.scheduler,
    transport: runtime.transport,
  });
  return Layer.provideMerge(services)(projectionDatalogQueryLayer());
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
  const runCurrentQuery = <A, E>(effect: Effect.Effect<A, E, any>) =>
    Effect.runPromise(
      Effect.provide(effect, currentQueryRuntimeLayer(runtime)) as Effect.Effect<
        A,
        E,
        never
      >,
    );
  const runCollection = <A, E>(effect: Effect.Effect<A, E, never>) =>
    Effect.runPromise(effect);
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
    getEvent: (args) => run(getDurableObjectSqliteEventEffect(args)),
    listEvents: (args = {}) => run(listDurableObjectSqliteEventsEffect(args)),
    query: (args) => run(queryDurableObjectSqliteEffect(args)),
    page: (args) => run(pageDurableObjectSqliteEffect(args)),
    aggregate: (args) => run(aggregateDurableObjectSqliteEffect(args)),
    derivedRows: (args) => run(derivedRowsDurableObjectSqliteEffect(args)),
    queryCurrent: (args) =>
      runCurrentQuery(queryDurableObjectSqliteCurrentEffect(args)),
    pageCurrent: (args) =>
      runCurrentQuery(pageDurableObjectSqliteCurrentEffect(args)),
    aggregateCurrent: (args) =>
      runCurrentQuery(aggregateDurableObjectSqliteCurrentEffect(args)),
    derivedRowsCurrent: (args) =>
      runCurrentQuery(derivedRowsDurableObjectSqliteCurrentEffect(args)),
    rebuildCurrent: (args) =>
      run(
        rebuildDurableObjectSqliteCurrentEffect(
          args ?? { coord: coord() },
          options.cardinalityOf,
        ),
      ),
    issueCollection: (args) =>
      runCollection(
        issueDurableObjectSqliteCollectionEffect(
          runtime.collections,
          args,
          coord().txTime,
        ),
      ),
    collectionByToken: (args) =>
      runCollection(
        getDurableObjectSqliteCollectionByTokenEffect(runtime.collections, args),
      ),
    listCollections: (args = {}) =>
      runCollection(
        listDurableObjectSqliteCollectionsEffect(runtime.collections, args),
      ),
    submitCollection: (args) =>
      runCollection(
        submitDurableObjectSqliteCollectionEffect(
          runtime.collections,
          args,
          coord().txTime,
        ),
      ),
    listCurrent: (args = {}) => run(listDurableObjectSqliteCurrentEffect(args)),
    getCurrentEntity: (args) =>
      run(getDurableObjectSqliteCurrentEntityEffect(args)),
    listCurrentEntities: (args = {}) =>
      run(listDurableObjectSqliteCurrentEntitiesEffect(args)),
  };
}
