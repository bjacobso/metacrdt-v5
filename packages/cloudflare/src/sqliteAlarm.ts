import { Data, Effect } from "effect";
import type { DurableObjectSqliteCollectionTick } from "./durableObjectSqlite.js";
import type {
  DurableObjectSqliteCurrentSurface,
  DurableObjectSqliteFireCollectionTickResult,
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
  readonly nextTick?: DurableObjectSqliteCollectionTick;
};

export type DurableObjectSqliteAlarmDrainResult = {
  readonly dueAt: number;
  readonly fired: readonly DurableObjectSqliteFireCollectionTickResult[];
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

export function armDurableObjectSqliteAlarmEffect(
  storage: DurableObjectAlarmStorageLike,
  surface: Pick<DurableObjectSqliteCurrentSurface, "listCollectionTicks">,
): Effect.Effect<DurableObjectSqliteAlarmArmResult, DurableObjectSqliteAlarmError> {
  return Effect.gen(function* () {
    const pending = yield* Effect.tryPromise({
      try: () => surface.listCollectionTicks({ status: "pending", limit: 1 }),
      catch: (cause) => alarmError("armDurableObjectSqliteAlarm", cause),
    });
    const next = pending[0];
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
      try: () => Promise.resolve(storage.setAlarm(next.fireAt)),
      catch: (cause) => alarmError("armDurableObjectSqliteAlarm", cause),
    });
    return { nextAlarmAt: next.fireAt, nextTick: next };
  });
}

export function drainDurableObjectSqliteAlarmEffect(
  storage: DurableObjectAlarmStorageLike,
  surface: Pick<
    DurableObjectSqliteCurrentSurface,
    "listCollectionTicks" | "fireCollectionTick"
  >,
  options: DurableObjectSqliteAlarmMuxOptions = {},
): Effect.Effect<
  DurableObjectSqliteAlarmDrainResult,
  DurableObjectSqliteAlarmError
> {
  return Effect.gen(function* () {
    const dueAt = options.now?.() ?? Date.now();
    const due = yield* Effect.tryPromise({
      try: () =>
        surface.listCollectionTicks({
          status: "pending",
          dueAt,
          limit: batchLimit(options.batchSize),
        }),
      catch: (cause) => alarmError("drainDurableObjectSqliteAlarm", cause),
    });
    const fired: DurableObjectSqliteFireCollectionTickResult[] = [];
    for (const tick of due) {
      fired.push(
        yield* Effect.tryPromise({
          try: () => surface.fireCollectionTick({ id: tick.id, firedAt: dueAt }),
          catch: (cause) => alarmError("drainDurableObjectSqliteAlarm", cause),
        }),
      );
    }
    const rearm = yield* armDurableObjectSqliteAlarmEffect(storage, surface);
    return { dueAt, fired, rearm };
  });
}

export function armDurableObjectSqliteAlarm(
  storage: DurableObjectAlarmStorageLike,
  surface: Pick<DurableObjectSqliteCurrentSurface, "listCollectionTicks">,
): Promise<DurableObjectSqliteAlarmArmResult> {
  return Effect.runPromise(armDurableObjectSqliteAlarmEffect(storage, surface));
}

export function drainDurableObjectSqliteAlarm(
  storage: DurableObjectAlarmStorageLike,
  surface: Pick<
    DurableObjectSqliteCurrentSurface,
    "listCollectionTicks" | "fireCollectionTick"
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
    "listCollectionTicks" | "fireCollectionTick"
  >,
  options: DurableObjectSqliteAlarmMuxOptions = {},
): DurableObjectSqliteAlarmMultiplexer {
  return {
    arm: () => armDurableObjectSqliteAlarm(storage, surface),
    drain: () => drainDurableObjectSqliteAlarm(storage, surface, options),
  };
}
