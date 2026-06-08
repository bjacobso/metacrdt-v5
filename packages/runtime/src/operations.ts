import {
  Event,
  assert as assertEvent,
  compareHlc,
  retract,
  tombstone,
  untombstone,
} from "@metacrdt/core";
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
