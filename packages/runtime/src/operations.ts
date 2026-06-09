import {
  Event,
  assert as assertEvent,
  compareHlc,
  retract,
  tombstone,
  untombstone,
} from "@metacrdt/core";
import { Effect } from "effect";
import {
  EventStoreService,
  RuntimeCapabilityError,
  RuntimeClockService,
  RuntimeOperationError,
  RuntimeProfileService,
  RuntimeSequencerService,
  TransportService,
  type RuntimeError,
} from "./services.js";
import { Operation, RuntimeCapability, RuntimeServices } from "./types.js";

export function requireCapability(
  runtime: RuntimeServices,
  capability: RuntimeCapability,
): void {
  if (!runtime.profile.capabilities.has(capability)) {
    throw new Error(
      `${runtime.profile.name}:${runtime.profile.replicaId} lacks ${capability}`,
    );
  }
}

export function requireCapabilityEffect(
  capability: RuntimeCapability,
): Effect.Effect<void, RuntimeCapabilityError, RuntimeProfileService> {
  return Effect.gen(function* () {
    const profile = yield* RuntimeProfileService;
    if (!profile.capabilities.has(capability)) {
      return yield* Effect.fail(
        new RuntimeCapabilityError({
          runtime: profile.name,
          replicaId: profile.replicaId,
          capability,
        }),
      );
    }
  });
}

function operationError(
  operation: string,
  cause: unknown,
): RuntimeOperationError {
  return new RuntimeOperationError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

function buildEventEffect(
  operation: Operation,
  hlc: Event["hlc"],
): Effect.Effect<Event, RuntimeOperationError> {
  return Effect.try({
    try: () => {
      const actorType = operation.actorType ?? "human";
      return operation.op === "assert"
        ? assertEvent({
            e: operation.e,
            a: operation.a,
            v: operation.v,
            validFrom: operation.validFrom ?? hlc.pt,
            validTo: operation.validTo ?? null,
            actor: operation.actor,
            actorType,
            hlc,
            causalRefs: operation.causalRefs,
            reason: operation.reason,
          })
        : operation.op === "retract"
          ? retract({
              target: operation.target,
              actor: operation.actor,
              actorType,
              hlc,
              causalRefs: operation.causalRefs,
              reason: operation.reason,
            })
          : operation.op === "tombstone"
            ? tombstone({
                target: operation.target,
                actor: operation.actor,
                actorType,
                hlc,
                causalRefs: operation.causalRefs,
                reason: operation.reason,
              })
            : untombstone({
                target: operation.target,
                actor: operation.actor,
                actorType,
                hlc,
                causalRefs: operation.causalRefs,
                reason: operation.reason,
              });
    },
    catch: (cause) => operationError(operation.op, cause),
  });
}

export function applyOperationEffect(
  operation: Operation,
): Effect.Effect<
  Event,
  RuntimeError,
  | RuntimeProfileService
  | RuntimeClockService
  | RuntimeSequencerService
  | EventStoreService
  | TransportService
> {
  return Effect.gen(function* () {
    yield* requireCapabilityEffect("convergent-log");
    const clock = yield* RuntimeClockService;
    const sequencer = yield* RuntimeSequencerService;
    const store = yield* EventStoreService;
    const transport = yield* TransportService;

    const hlc = yield* clock.tick();
    const event = yield* buildEventEffect(operation, hlc);
    const sequenced = { ...event, seq: yield* sequencer.next() };
    yield* store.append(sequenced);
    yield* transport.publish([sequenced]);
    return sequenced;
  });
}

export function mergeFromEffect(
  events: Iterable<Event>,
): Effect.Effect<
  number,
  RuntimeError,
  EventStoreService | RuntimeClockService
> {
  return Effect.gen(function* () {
    const store = yield* EventStoreService;
    const clock = yield* RuntimeClockService;
    let maxRemote = undefined as Event["hlc"] | undefined;
    const batch = [];
    for (const event of events) {
      batch.push(event);
      if (!maxRemote || compareHlc(event.hlc, maxRemote) > 0) {
        maxRemote = event.hlc;
      }
    }
    const result = yield* store.merge(batch);
    if (maxRemote) yield* clock.receive(maxRemote);
    return result.inserted;
  });
}

export async function applyOperation(
  runtime: RuntimeServices,
  operation: Operation,
): Promise<Event> {
  requireCapability(runtime, "convergent-log");
  const hlc = await runtime.clock.tick();
  const actorType = operation.actorType ?? "human";
  const event =
    operation.op === "assert"
      ? assertEvent({
          e: operation.e,
          a: operation.a,
          v: operation.v,
          validFrom: operation.validFrom ?? hlc.pt,
          validTo: operation.validTo ?? null,
          actor: operation.actor,
          actorType,
          hlc,
          causalRefs: operation.causalRefs,
          reason: operation.reason,
        })
      : operation.op === "retract"
        ? retract({
            target: operation.target,
            actor: operation.actor,
            actorType,
            hlc,
            causalRefs: operation.causalRefs,
            reason: operation.reason,
          })
        : operation.op === "tombstone"
          ? tombstone({
              target: operation.target,
              actor: operation.actor,
              actorType,
              hlc,
              causalRefs: operation.causalRefs,
              reason: operation.reason,
            })
          : untombstone({
              target: operation.target,
              actor: operation.actor,
              actorType,
              hlc,
              causalRefs: operation.causalRefs,
              reason: operation.reason,
            });

  const sequenced =
    runtime.sequencer === undefined
      ? event
      : { ...event, seq: await runtime.sequencer.next() };

  await runtime.store.append(sequenced);
  await runtime.transport?.publish([sequenced]);
  return sequenced;
}

export async function mergeFrom(
  target: RuntimeServices,
  events: Iterable<Event>,
): Promise<number> {
  let maxRemote = undefined as Event["hlc"] | undefined;
  const batch = [];
  for (const event of events) {
    batch.push(event);
    if (!maxRemote || compareHlc(event.hlc, maxRemote) > 0) maxRemote = event.hlc;
  }
  const result = await target.store.merge(batch);
  if (maxRemote) await target.clock.receive(maxRemote);
  return result.inserted;
}
