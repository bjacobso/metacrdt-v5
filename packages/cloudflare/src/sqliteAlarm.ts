import { Data, Effect } from "effect";
import type {
  DurableObjectSqliteCollectionTick,
  DurableObjectSqliteFlowWaitTick,
} from "./durableObjectSqlite.js";
import type {
  DurableObjectSqliteCurrentSurface,
  DurableObjectSqliteFireCollectionTickResult,
  DurableObjectSqliteFireFlowWaitTickResult,
} from "./sqliteCurrent.js";

export interface DurableObjectAlarmStorageLike {
  setAlarm(scheduledTime: number | Date): void | Promise<void>;
  deleteAlarm?(): void | Promise<void>;
}

export class DurableObjectSqliteAlarmError extends Data.TaggedError(
  "DurableObjectSqliteAlarmError",
)<{
  readonly operation: string;
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type DurableObjectSqliteAlarmArmResult = {
  readonly nextAlarmAt: number | null;
  readonly nextTick?:
    | DurableObjectSqliteCollectionTick
    | DurableObjectSqliteFlowWaitTick;
  readonly nextTickKind?: "collection" | "flow-wait";
};

export type DurableObjectSqliteAlarmFireResult =
  | (DurableObjectSqliteFireCollectionTickResult & {
      readonly kind: "collection";
    })
  | (DurableObjectSqliteFireFlowWaitTickResult & {
      readonly kind: "flow-wait";
    });

export type DurableObjectSqliteAlarmDrainResult = {
  readonly dueAt: number;
  readonly fired: readonly DurableObjectSqliteAlarmFireResult[];
  readonly rearm: DurableObjectSqliteAlarmArmResult;
};

export type DurableObjectSqliteAlarmMuxOptions = {
  readonly now?: () => number;
  readonly batchSize?: number;
};

export type DurableObjectSqliteAlarmMultiplexer = {
  arm(): Promise<DurableObjectSqliteAlarmArmResult>;
  drain(): Promise<DurableObjectSqliteAlarmDrainResult>;
};

function alarmError(
  operation: string,
  cause: unknown,
): DurableObjectSqliteAlarmError {
  return new DurableObjectSqliteAlarmError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

function batchLimit(value: number | undefined): number {
  return Math.max(1, Math.min(Math.floor(value ?? 100), 1000));
}

type AlarmCandidate =
  | {
      readonly kind: "collection";
      readonly tick: DurableObjectSqliteCollectionTick;
    }
  | {
      readonly kind: "flow-wait";
      readonly tick: DurableObjectSqliteFlowWaitTick;
    };

function orderCandidates(a: AlarmCandidate, b: AlarmCandidate): number {
  const fire = a.tick.fireAt - b.tick.fireAt;
  if (fire !== 0) return fire;
  if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
  return a.tick.id.localeCompare(b.tick.id);
}

function firstCandidate(
  collections: readonly DurableObjectSqliteCollectionTick[],
  flowWaits: readonly DurableObjectSqliteFlowWaitTick[],
): AlarmCandidate | undefined {
  return [
    ...collections.map((tick) => ({ kind: "collection" as const, tick })),
    ...flowWaits.map((tick) => ({ kind: "flow-wait" as const, tick })),
  ].sort(orderCandidates)[0];
}

export function armDurableObjectSqliteAlarmEffect(
  storage: DurableObjectAlarmStorageLike,
  surface: Pick<
    DurableObjectSqliteCurrentSurface,
    "listCollectionTicks" | "listFlowWaitTicks"
  >,
): Effect.Effect<DurableObjectSqliteAlarmArmResult, DurableObjectSqliteAlarmError> {
  return Effect.gen(function* () {
    const pendingCollections = yield* Effect.tryPromise({
      try: () => surface.listCollectionTicks({ status: "pending", limit: 1 }),
      catch: (cause) => alarmError("armDurableObjectSqliteAlarm", cause),
    });
    const pendingFlowWaits = yield* Effect.tryPromise({
      try: () => surface.listFlowWaitTicks({ status: "pending", limit: 1 }),
      catch: (cause) => alarmError("armDurableObjectSqliteAlarm", cause),
    });
    const next = firstCandidate(pendingCollections, pendingFlowWaits);
    if (next === undefined) {
      if (storage.deleteAlarm !== undefined) {
        yield* Effect.tryPromise({
          try: () => Promise.resolve(storage.deleteAlarm?.()),
          catch: (cause) => alarmError("armDurableObjectSqliteAlarm", cause),
        });
      }
      return { nextAlarmAt: null };
    }
    yield* Effect.tryPromise({
      try: () => Promise.resolve(storage.setAlarm(next.tick.fireAt)),
      catch: (cause) => alarmError("armDurableObjectSqliteAlarm", cause),
    });
    return {
      nextAlarmAt: next.tick.fireAt,
      nextTick: next.tick,
      nextTickKind: next.kind,
    };
  });
}

export function drainDurableObjectSqliteAlarmEffect(
  storage: DurableObjectAlarmStorageLike,
  surface: Pick<
    DurableObjectSqliteCurrentSurface,
    | "listCollectionTicks"
    | "fireCollectionTick"
    | "listFlowWaitTicks"
    | "fireFlowWaitTick"
  >,
  options: DurableObjectSqliteAlarmMuxOptions = {},
): Effect.Effect<
  DurableObjectSqliteAlarmDrainResult,
  DurableObjectSqliteAlarmError
> {
  return Effect.gen(function* () {
    const dueAt = options.now?.() ?? Date.now();
    const limit = batchLimit(options.batchSize);
    const dueCollections = yield* Effect.tryPromise({
      try: () =>
        surface.listCollectionTicks({
          status: "pending",
          dueAt,
          limit,
        }),
      catch: (cause) => alarmError("drainDurableObjectSqliteAlarm", cause),
    });
    const dueFlowWaits = yield* Effect.tryPromise({
      try: () =>
        surface.listFlowWaitTicks({
          status: "pending",
          dueAt,
          limit,
        }),
      catch: (cause) => alarmError("drainDurableObjectSqliteAlarm", cause),
    });
    const due = [
      ...dueCollections.map((tick) => ({ kind: "collection" as const, tick })),
      ...dueFlowWaits.map((tick) => ({ kind: "flow-wait" as const, tick })),
    ]
      .sort(orderCandidates)
      .slice(0, limit);
    const fired: DurableObjectSqliteAlarmFireResult[] = [];
    for (const tick of due) {
      if (tick.kind === "collection") {
        fired.push({
          kind: "collection",
          ...(yield* Effect.tryPromise({
            try: () =>
              surface.fireCollectionTick({ id: tick.tick.id, firedAt: dueAt }),
            catch: (cause) => alarmError("drainDurableObjectSqliteAlarm", cause),
          })),
        });
      } else {
        fired.push({
          kind: "flow-wait",
          ...(yield* Effect.tryPromise({
            try: () =>
              surface.fireFlowWaitTick({ id: tick.tick.id, firedAt: dueAt }),
            catch: (cause) => alarmError("drainDurableObjectSqliteAlarm", cause),
          })),
        });
      }
    }
    const rearm = yield* armDurableObjectSqliteAlarmEffect(storage, surface);
    return { dueAt, fired, rearm };
  });
}

export function armDurableObjectSqliteAlarm(
  storage: DurableObjectAlarmStorageLike,
  surface: Pick<
    DurableObjectSqliteCurrentSurface,
    "listCollectionTicks" | "listFlowWaitTicks"
  >,
): Promise<DurableObjectSqliteAlarmArmResult> {
  return Effect.runPromise(armDurableObjectSqliteAlarmEffect(storage, surface));
}

export function drainDurableObjectSqliteAlarm(
  storage: DurableObjectAlarmStorageLike,
  surface: Pick<
    DurableObjectSqliteCurrentSurface,
    | "listCollectionTicks"
    | "fireCollectionTick"
    | "listFlowWaitTicks"
    | "fireFlowWaitTick"
  >,
  options: DurableObjectSqliteAlarmMuxOptions = {},
): Promise<DurableObjectSqliteAlarmDrainResult> {
  return Effect.runPromise(
    drainDurableObjectSqliteAlarmEffect(storage, surface, options),
  );
}

export function createDurableObjectSqliteAlarmMultiplexer(
  storage: DurableObjectAlarmStorageLike,
  surface: Pick<
    DurableObjectSqliteCurrentSurface,
    | "listCollectionTicks"
    | "fireCollectionTick"
    | "listFlowWaitTicks"
    | "fireFlowWaitTick"
  >,
  options: DurableObjectSqliteAlarmMuxOptions = {},
): DurableObjectSqliteAlarmMultiplexer {
  return {
    arm: () => armDurableObjectSqliteAlarm(storage, surface),
    drain: () => drainDurableObjectSqliteAlarm(storage, surface, options),
  };
}
