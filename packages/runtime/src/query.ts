import {
  visible,
  fromEvents,
  type Event,
  type Log,
} from "@metacrdt/core";
import {
  advanceBoundVars,
  aggregateBindings,
  applyComputeStates,
  dedupeProvenancedBindings,
  derivedRowsFromBindings,
  extendPatternCandidatesWithinLimit,
  filterCompareStates,
  initialSolverFrame,
  paginateRows,
  parseClauses,
  passesNegationCandidates,
  patternInputForBinding,
  project,
  selectNextClause,
  valueKey,
  type AggSpec,
  type AnyClause,
  type Binding,
  type DerivedRow,
  type EmitSpec,
  type PatternClause,
  type ProvenancedBinding,
  type QueryTriple,
  type ResultPage,
} from "@metacrdt/query";
import { Context, Effect, Layer } from "effect";
import * as Schema from "effect/Schema";
import {
  EventStoreService,
  RuntimeOperationError,
  type EventStoreEffect,
  type RuntimeError,
} from "./services.js";

export const DatalogQueryCoord = Schema.Struct({
  txTime: Schema.Number,
  validTime: Schema.Number,
});

export const PaginationOpts = Schema.Struct({
  numItems: Schema.Number,
  cursor: Schema.optionalWith(Schema.Union(Schema.String, Schema.Null), {
    exact: true,
  }),
});

export const AggSpecSchema = Schema.Struct({
  op: Schema.Literal("count", "countDistinct", "sum", "avg", "min", "max"),
  var: Schema.optionalWith(Schema.String, { exact: true }),
  as: Schema.String,
});

export const EmitSpecSchema = Schema.Struct({
  e: Schema.String,
  a: Schema.String,
  v: Schema.Any,
});

export const DatalogQueryArgs = Schema.Struct({
  where: Schema.Array(Schema.Any),
  select: Schema.Array(Schema.String),
  coord: DatalogQueryCoord,
});

export const DatalogQueryPageArgs = Schema.Struct({
  where: Schema.Array(Schema.Any),
  select: Schema.Array(Schema.String),
  coord: DatalogQueryCoord,
  paginationOpts: PaginationOpts,
});

export const DatalogAggregateArgs = Schema.Struct({
  where: Schema.Array(Schema.Any),
  coord: DatalogQueryCoord,
  groupBy: Schema.Array(Schema.String),
  aggregates: Schema.Array(AggSpecSchema),
});

export const DatalogDerivedRowsArgs = Schema.Struct({
  where: Schema.Array(Schema.Any),
  coord: DatalogQueryCoord,
  emit: EmitSpecSchema,
});

export type DatalogQueryCoord = typeof DatalogQueryCoord.Type;
export type PaginationOpts = typeof PaginationOpts.Type;
export type DatalogQueryArgs = typeof DatalogQueryArgs.Type;
export type DatalogQueryPageArgs = typeof DatalogQueryPageArgs.Type;
export type DatalogAggregateArgs = typeof DatalogAggregateArgs.Type;
export type DatalogDerivedRowsArgs = typeof DatalogDerivedRowsArgs.Type;

export type QueryState = ProvenancedBinding<string, string>;

export type DatalogQueryResult = {
  readonly states: readonly QueryState[];
  readonly rows: readonly Record<string, unknown>[];
  readonly eventSourceIds: readonly string[];
};

export type DatalogQueryEffect = {
  query(
    args: DatalogQueryArgs,
  ): Effect.Effect<DatalogQueryResult, RuntimeError>;
  page(
    args: DatalogQueryPageArgs,
  ): Effect.Effect<ResultPage<Record<string, unknown>>, RuntimeError>;
  aggregate(
    args: DatalogAggregateArgs,
  ): Effect.Effect<Record<string, unknown>[], RuntimeError>;
  derivedRows(
    args: DatalogDerivedRowsArgs,
  ): Effect.Effect<DerivedRow[], RuntimeError>;
};

export class DatalogQueryService extends Context.Tag(
  "@metacrdt/runtime/DatalogQueryService",
)<DatalogQueryService, DatalogQueryEffect>() {}

function operationError(operation: string, cause: unknown): RuntimeOperationError {
  return new RuntimeOperationError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

function decode<A, I>(
  operation: string,
  schema: Schema.Schema<A, I>,
  input: unknown,
): Effect.Effect<A, RuntimeOperationError> {
  return Effect.try({
    try: () => Schema.decodeUnknownSync(schema)(input),
    catch: (cause) => operationError(operation, cause),
  });
}

function uniqueSorted(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

function rowKey(row: Record<string, unknown>): string {
  return JSON.stringify(
    Object.entries(row)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => [k, valueKey(v)]),
  );
}

function sortRows(
  rows: readonly Record<string, unknown>[],
): Record<string, unknown>[] {
  return [...rows].sort((a, b) => rowKey(a).localeCompare(rowKey(b)));
}

function scanFilterForPattern(
  clause: PatternClause,
  binding: Binding,
): { e?: string; a?: string } | null {
  const input = patternInputForBinding(clause, binding);
  if (input.eConst !== undefined && typeof input.eConst !== "string") return null;
  if (input.aConst !== undefined && typeof input.aConst !== "string") return null;
  return {
    ...(input.eConst === undefined ? {} : { e: input.eConst }),
    ...(input.aConst === undefined ? {} : { a: input.aConst }),
  };
}

function visibleAssertCandidates(
  clause: PatternClause,
  binding: Binding,
  scanned: readonly Event[],
  fullLog: Log,
  coord: DatalogQueryCoord,
): QueryTriple<string, string>[] {
  const input = patternInputForBinding(clause, binding);
  return scanned
    .filter((event) => {
      if (
        event.kind !== "assert" ||
        event.e === undefined ||
        event.a === undefined ||
        event.v === undefined
      ) {
        return false;
      }
      if (!visible(event, coord, fullLog)) return false;
      if (input.eConst !== undefined && input.eConst !== event.e) return false;
      if (input.aConst !== undefined && input.aConst !== event.a) return false;
      if (input.vIsConst && valueKey(input.vConst) !== valueKey(event.v)) {
        return false;
      }
      return true;
    })
    .map((event) => ({
      e: event.e!,
      a: event.a!,
      v: event.v!,
      prov: [event.id],
      eventProv: [event.id],
    }))
    .sort((a, b) => a.prov[0]!.localeCompare(b.prov[0]!));
}

function fetchPatternCandidates(
  store: EventStoreEffect,
  clause: PatternClause,
  binding: Binding,
  fullLog: Log,
  coord: DatalogQueryCoord,
): Effect.Effect<QueryTriple<string, string>[], RuntimeError> {
  const filter = scanFilterForPattern(clause, binding);
  if (filter === null) return Effect.succeed([]);
  return Effect.map(store.scan(filter), (events) =>
    visibleAssertCandidates(clause, binding, events, fullLog, coord),
  );
}

function solveParsedQuery(
  store: EventStoreEffect,
  clauses: AnyClause[],
  seed: QueryState,
  fullLog: Log,
  coord: DatalogQueryCoord,
): Effect.Effect<QueryState[], RuntimeError> {
  return Effect.gen(function* () {
    let frame = initialSolverFrame<string, string>(
      clauses,
      seed.binding,
      seed.sources,
      seed.eventSources ?? [],
    );

    while (frame.remaining.length > 0) {
      const selected = yield* Effect.try({
        try: () => selectNextClause(clauses, frame.remaining, frame.bound),
        catch: (cause) => operationError("DatalogQuery.selectNextClause", cause),
      });
      const clause = selected.clause;
      let nextStates: QueryState[] = [];

      if (clause.kind === "pattern") {
        for (const state of frame.states) {
          const candidates = yield* fetchPatternCandidates(
            store,
            clause,
            state.binding,
            fullLog,
            coord,
          );
          nextStates.push(
            ...extendPatternCandidatesWithinLimit(
              clause,
              state,
              candidates,
              nextStates.length,
            ),
          );
        }
      } else if (clause.kind === "compare") {
        nextStates = yield* Effect.try({
          try: () => filterCompareStates(clause, frame.states),
          catch: (cause) => operationError("DatalogQuery.compare", cause),
        });
      } else if (clause.kind === "compute") {
        nextStates = yield* Effect.try({
          try: () => applyComputeStates(clause, frame.states),
          catch: (cause) => operationError("DatalogQuery.compute", cause),
        });
      } else if (clause.kind === "not") {
        for (const state of frame.states) {
          const candidates = yield* fetchPatternCandidates(
            store,
            clause.pattern,
            state.binding,
            fullLog,
            coord,
          );
          if (passesNegationCandidates(clause, state.binding, candidates)) {
            nextStates.push(state);
          }
        }
      } else {
        for (const state of frame.states) {
          for (const branch of clause.branches) {
            nextStates.push(
              ...(yield* solveParsedQuery(store, branch, state, fullLog, coord)),
            );
          }
        }
      }

      frame = {
        remaining: selected.remaining,
        bound: advanceBoundVars(frame.bound, clause),
        states: yield* Effect.try({
          try: () => dedupeProvenancedBindings(nextStates),
          catch: (cause) => operationError("DatalogQuery.dedupe", cause),
        }),
      };
    }

    return frame.states;
  });
}

function runQuery(
  store: EventStoreEffect,
  args: DatalogQueryArgs,
): Effect.Effect<DatalogQueryResult, RuntimeError> {
  return Effect.gen(function* () {
    const clauses = yield* Effect.try({
      try: () => parseClauses([...args.where]),
      catch: (cause) => operationError("DatalogQuery.parse", cause),
    });
    const allEvents = yield* store.scan();
    const fullLog = fromEvents(allEvents);
    const states = yield* solveParsedQuery(
      store,
      clauses,
      { binding: {}, sources: [], eventSources: [] },
      fullLog,
      args.coord,
    );
    const rows = yield* Effect.try({
      try: () => project(states.map((state) => state.binding), [...args.select]),
      catch: (cause) => operationError("DatalogQuery.project", cause),
    });
    return {
      states,
      rows,
      eventSourceIds: uniqueSorted(
        states.flatMap((state) => state.eventSources ?? []),
      ),
    };
  });
}

export function datalogQueryService(store: EventStoreEffect): DatalogQueryEffect {
  return {
    query: (input) =>
      Effect.flatMap(
        decode("DatalogQuery.query.args", DatalogQueryArgs, input),
        (args) => runQuery(store, args),
      ),
    page: (input) =>
      Effect.gen(function* () {
        const args = yield* decode(
          "DatalogQuery.page.args",
          DatalogQueryPageArgs,
          input,
        );
        const result = yield* runQuery(store, args);
        return yield* Effect.try({
          try: () => paginateRows(sortRows(result.rows), args.paginationOpts),
          catch: (cause) => operationError("DatalogQuery.page", cause),
        });
      }),
    aggregate: (input) =>
      Effect.gen(function* () {
        const args = yield* decode(
          "DatalogQuery.aggregate.args",
          DatalogAggregateArgs,
          input,
        );
        const result = yield* runQuery(store, {
          where: args.where,
          select: [],
          coord: args.coord,
        });
        return yield* Effect.try({
          try: () =>
            aggregateBindings(
              result.states.map((state) => state.binding),
              [...args.groupBy],
              args.aggregates as AggSpec[],
            ),
          catch: (cause) => operationError("DatalogQuery.aggregate", cause),
        });
      }),
    derivedRows: (input) =>
      Effect.gen(function* () {
        const args = yield* decode(
          "DatalogQuery.derivedRows.args",
          DatalogDerivedRowsArgs,
          input,
        );
        const result = yield* runQuery(store, {
          where: args.where,
          select: [],
          coord: args.coord,
        });
        return yield* Effect.try({
          try: () =>
            derivedRowsFromBindings(
              result.states.map((state) => state.binding),
              args.emit as EmitSpec,
            ),
          catch: (cause) => operationError("DatalogQuery.derivedRows", cause),
        });
      }),
  };
}

export function datalogQueryLayer(): Layer.Layer<
  DatalogQueryService,
  never,
  EventStoreService
> {
  return Layer.effect(
    DatalogQueryService,
    Effect.map(EventStoreService, datalogQueryService),
  );
}
