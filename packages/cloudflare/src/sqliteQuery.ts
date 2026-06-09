import { fromEvents, visible, type Event } from "@metacrdt/core";
import {
  datalogQueryServiceFromSourceFactory,
  RuntimeOperationError,
  type DatalogPatternCandidateSource,
  type DatalogQueryEffect,
  type EventStoreEffect,
  type RuntimeError,
} from "@metacrdt/runtime";
import {
  patternInputForBinding,
  valueKey,
  type Binding,
  type PatternClause,
  type QueryTriple,
} from "@metacrdt/query";
import { Effect } from "effect";

function operationError(operation: string, cause: unknown): RuntimeOperationError {
  return new RuntimeOperationError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
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

function assertCandidateMatchesValue(
  event: Event,
  clause: PatternClause,
  binding: Binding,
): boolean {
  const input = patternInputForBinding(clause, binding);
  return !input.vIsConst || valueKey(input.vConst) === valueKey(event.v);
}

function eventCandidate(event: Event): QueryTriple<string, string> {
  return {
    e: event.e!,
    a: event.a!,
    v: event.v!,
    prov: [event.id],
    eventProv: [event.id],
  };
}

export function durableObjectSqliteIndexedHistoricalDatalogQueryService(
  store: EventStoreEffect,
): DatalogQueryEffect {
  return datalogQueryServiceFromSourceFactory(
    "DurableObjectSqliteIndexedDatalogQuery",
    () =>
      Effect.succeed<DatalogPatternCandidateSource>((clause, binding, coord) => {
        const filter = scanFilterForPattern(clause, binding);
        if (filter === null) return Effect.succeed([]);

        const lifecycleByTarget = new Map<string, readonly Event[]>();
        const lifecycleEventsFor = (
          target: string,
        ): Effect.Effect<readonly Event[], RuntimeError> => {
          const cached = lifecycleByTarget.get(target);
          if (cached !== undefined) return Effect.succeed(cached);
          return Effect.map(store.scan({ target }), (events) => {
            lifecycleByTarget.set(target, events);
            return events;
          });
        };

        return Effect.gen(function* () {
          const scanned = yield* store.scan(filter);
          const out: QueryTriple<string, string>[] = [];
          for (const event of scanned) {
            if (
              event.kind !== "assert" ||
              event.e === undefined ||
              event.a === undefined ||
              event.v === undefined ||
              !assertCandidateMatchesValue(event, clause, binding)
            ) {
              continue;
            }
            const lifecycleEvents = yield* lifecycleEventsFor(event.id);
            const visibilityLog = yield* Effect.try({
              try: () => fromEvents([event, ...lifecycleEvents]),
              catch: (cause) =>
                operationError(
                  "DurableObjectSqliteIndexedDatalogQuery.visibilityLog",
                  cause,
                ),
            });
            if (!visible(event, coord, visibilityLog)) continue;
            out.push(eventCandidate(event));
          }
          return out.sort((a, b) => a.prov[0]!.localeCompare(b.prov[0]!));
        });
      }),
  );
}
