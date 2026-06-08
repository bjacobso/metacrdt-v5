import {
  assert as assertEvent,
  fromEvents,
  valueOf,
  verifyId,
  type Event,
} from "@metacrdt/core";
import {
  applyOperationEffect,
  mergeFromEffect,
  runtimeServicesLayer,
  versionVector,
  EventStoreService,
  RuntimeClockService,
  RuntimeProfileService,
  RuntimeSequencerService,
  SchedulerService,
  TransportService,
  type RuntimeError,
  type RuntimeServices,
} from "@metacrdt/runtime";
import { Effect, Layer } from "effect";
import * as Either from "effect/Either";

export interface RuntimeFactoryOptions {
  readonly replicaId: string;
  readonly wall?: () => number;
}

export interface RuntimeConformanceTarget {
  readonly name: string;
  createRuntime(
    options: RuntimeFactoryOptions,
  ): RuntimeServices | Promise<RuntimeServices>;
  disposeRuntime?(runtime: RuntimeServices): void | Promise<void>;
}

export type RuntimeConformanceServices =
  | RuntimeProfileService
  | EventStoreService
  | RuntimeClockService
  | RuntimeSequencerService
  | SchedulerService
  | TransportService;

export type RuntimeConformanceLayer = Layer.Layer<
  RuntimeConformanceServices,
  unknown
>;

export interface RuntimeLayerConformanceTarget {
  readonly name: string;
  createLayer(options: RuntimeFactoryOptions): RuntimeConformanceLayer;
}

export type AnyRuntimeConformanceTarget =
  | RuntimeConformanceTarget
  | RuntimeLayerConformanceTarget;

export interface ConformanceReport {
  readonly target: string;
  readonly checks: readonly string[];
}

const MANY = () => "many" as const;
const ONE = () => "one" as const;
const COORD = { txTime: 10_000, validTime: 1_000 };

function fail(target: AnyRuntimeConformanceTarget, message: string): never {
  throw new Error(`@metacrdt/testkit(${target.name}): ${message}`);
}

function expect(
  target: AnyRuntimeConformanceTarget,
  condition: unknown,
  message: string,
): asserts condition {
  if (!condition) fail(target, message);
}

function sameIds(a: readonly Event[], b: readonly Event[]): boolean {
  const left = a.map((e) => e.id).sort();
  const right = b.map((e) => e.id).sort();
  return JSON.stringify(left) === JSON.stringify(right);
}

function hasLayerTarget(
  target: AnyRuntimeConformanceTarget,
): target is RuntimeLayerConformanceTarget {
  return "createLayer" in target;
}

function requireSequencer(
  target: RuntimeConformanceTarget,
  rt: RuntimeServices,
) {
  if (rt.sequencer === undefined) {
    fail(target, "runtime target must provide a sequencer for Effect conformance");
  }
  return { ...rt, sequencer: rt.sequencer };
}

async function runWithTargetLayer<A>(
  target: AnyRuntimeConformanceTarget,
  options: RuntimeFactoryOptions,
  program: Effect.Effect<A, RuntimeError, RuntimeConformanceServices>,
): Promise<A> {
  const session = await layerSession(target, options);
  try {
    return await runWithLayer(session.layer, program);
  } finally {
    await session.dispose();
  }
}

type TargetLayerSession = {
  readonly layer: RuntimeConformanceLayer;
  dispose(): Promise<void>;
};

async function layerSession(
  target: AnyRuntimeConformanceTarget,
  options: RuntimeFactoryOptions,
): Promise<TargetLayerSession> {
  if (hasLayerTarget(target)) {
    return {
      layer: target.createLayer(options),
      async dispose() {},
    };
  }

  const rt = await target.createRuntime(options);
  return {
    layer: runtimeServicesLayer(requireSequencer(target, rt)),
    async dispose() {
      await target.disposeRuntime?.(rt);
    },
  };
}

async function runWithLayer<A>(
  layer: RuntimeConformanceLayer,
  program: Effect.Effect<A, RuntimeError, RuntimeConformanceServices>,
): Promise<A> {
  return await Effect.runPromise(Effect.provide(program, layer));
}

async function runWithSession<A>(
  session: TargetLayerSession,
  program: Effect.Effect<A, RuntimeError, RuntimeConformanceServices>,
): Promise<A> {
  return await runWithLayer(session.layer, program);
}

async function withLayerSessions<A>(
  sessions: readonly TargetLayerSession[],
  f: () => Promise<A>,
): Promise<A> {
  try {
    return await f();
  } finally {
    for (const session of sessions) await session.dispose();
  }
}

function sampleAssert(replicaId: string, n: number): Event {
  return assertEvent({
    e: `entity:${n}`,
    a: "status",
    v: n === 1 ? "ready" : "waiting",
    validFrom: 0,
    actor: "testkit",
    actorType: "system",
    hlc: { pt: n, l: 0, r: replicaId },
  });
}

export async function runEventStoreConformance(
  target: AnyRuntimeConformanceTarget,
): Promise<ConformanceReport> {
  return await runWithTargetLayer(
    target,
    { replicaId: "testkit:store", wall: () => 1_000 },
    Effect.gen(function* () {
      const checks: string[] = [];
      const profile = yield* RuntimeProfileService;
      const store = yield* EventStoreService;
      expect(
        target,
        profile.replicaId === "testkit:store",
        "runtime profile replicaId mismatch",
      );

      const first = sampleAssert(profile.replicaId, 1);
      const second = sampleAssert(profile.replicaId, 2);
    expect(target, verifyId(first), "sample event should have a valid id");

    const inserted = yield* store.append(first);
    expect(target, inserted.inserted, "first append should insert");
    expect(target, inserted.event.id === first.id, "append should echo the event");
    const duplicate = yield* store.append(first);
    expect(target, !duplicate.inserted, "duplicate append should be idempotent");
    checks.push("append-idempotent");

    yield* store.append(second);
    expect(
      target,
      (yield* store.get(first.id))?.id === first.id,
      "get(id) failed",
    );
    expect(
      target,
      (yield* store.scan({ e: first.e })).length === 1,
      "scan({e}) failed",
    );
    expect(
      target,
      (yield* store.scan({ a: "status" })).length === 2,
      "scan({a}) failed",
    );
    expect(
      target,
      (yield* store.scan({ ids: [second.id] })).map((e) => e.id).join(",") ===
        second.id,
      "scan({ids}) failed",
    );
    checks.push("scan-filters");

    const merge = yield* store.merge([first, second]);
    expect(target, merge.seen === 2, "merge should count seen events");
    expect(
      target,
      merge.inserted === 0,
      "merge should be idempotent for seen events",
    );
    checks.push("gset-merge-idempotent");

    const invalid = yield* Effect.either(
      store.append({ ...first, id: "not-the-content-id" }),
    );
    expect(
      target,
      Either.isLeft(invalid),
      "store MUST reject events with invalid content ids",
    );
    checks.push("content-id-verification");

      return { target: target.name, checks };
    }),
  );
}

export async function runRuntimeConvergenceConformance(
  target: AnyRuntimeConformanceTarget,
): Promise<ConformanceReport> {
  const checks: string[] = [];
  const leftOptions = { replicaId: "testkit:left", wall: () => 1_000 };
  const rightOptions = { replicaId: "testkit:right", wall: () => 1_000 };
  const left = await layerSession(target, leftOptions);
  const right = await layerSession(target, rightOptions);

  return await withLayerSessions([left, right], async () => {
    const leftStatus = await runWithSession(
    left,
    applyOperationEffect({
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "alice",
    }),
  );
  const rightStatus = await runWithSession(
    right,
    applyOperationEffect({
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "terminated",
      actor: "bob",
    }),
  );
  await runWithSession(
    left,
    applyOperationEffect({
      op: "assert",
      e: "worker:maria",
      a: "worker.tag",
      v: "left",
      actor: "alice",
    }),
  );
  await runWithSession(
    right,
    applyOperationEffect({
      op: "assert",
      e: "worker:maria",
      a: "worker.tag",
      v: "right",
      actor: "bob",
    }),
  );

    const first = await exchangeDeltasEffect(left, right);
    expect(
      target,
      first.insertedIntoA === 2,
      "left should merge right's two events",
    );
    expect(
      target,
      first.insertedIntoB === 2,
      "right should merge left's two events",
    );
    checks.push("bidirectional-delta-exchange");

    const leftEvents = await eventsFor(left);
    const rightEvents = await eventsFor(right);
    expect(
      target,
      sameIds(leftEvents, rightEvents),
      "replicas should hold equal event ids",
    );
    expect(
      target,
      JSON.stringify(versionVector(leftEvents)) === JSON.stringify(first.vvA),
      "vvA mismatch",
    );
    expect(
      target,
      JSON.stringify(versionVector(rightEvents)) === JSON.stringify(first.vvB),
      "vvB mismatch",
    );
    checks.push("version-vector-convergence");

    const leftLog = fromEvents(leftEvents);
    const rightLog = fromEvents(rightEvents);
    const leftOne = valueOf("worker:maria", "worker.status", COORD, leftLog, ONE);
    const rightOne = valueOf("worker:maria", "worker.status", COORD, rightLog, ONE);
    expect(target, leftOne === rightOne, "cardinality-one fold diverged");
    expect(
      target,
      leftOne === leftStatus.v || leftOne === rightStatus.v,
      "cardinality-one fold returned an unexpected value",
    );
    const leftMany = (
      valueOf("worker:maria", "worker.tag", COORD, leftLog, MANY) as string[]
    ).sort();
    const rightMany = (
      valueOf("worker:maria", "worker.tag", COORD, rightLog, MANY) as string[]
    ).sort();
    expect(
      target,
      JSON.stringify(leftMany) === JSON.stringify(["left", "right"]),
      "left many fold failed",
    );
    expect(
      target,
      JSON.stringify(rightMany) === JSON.stringify(["left", "right"]),
      "right many fold failed",
    );
    checks.push("deterministic-fold-convergence");

    const second = await exchangeDeltasEffect(left, right);
    expect(
      target,
      second.sentFromA === 0,
      "second exchange should send no A delta",
    );
    expect(
      target,
      second.sentFromB === 0,
      "second exchange should send no B delta",
    );
    expect(
      target,
      second.insertedIntoA === 0,
      "second exchange should insert nothing into A",
    );
    expect(
      target,
      second.insertedIntoB === 0,
      "second exchange should insert nothing into B",
    );
    checks.push("idempotent-second-sync");

    return { target: target.name, checks };
  });
}

export async function runRuntimeConformance(
  target: AnyRuntimeConformanceTarget,
): Promise<ConformanceReport> {
  const store = await runEventStoreConformance(target);
  const convergence = await runRuntimeConvergenceConformance(target);
  return {
    target: target.name,
    checks: [...store.checks, ...convergence.checks],
  };
}

async function eventsFor(
  session: TargetLayerSession,
): Promise<Event[]> {
  return await runWithSession(
    session,
    Effect.gen(function* () {
      const store = yield* EventStoreService;
      return yield* store.scan();
    }),
  );
}

async function mergeInto(
  session: TargetLayerSession,
  events: readonly Event[],
): Promise<number> {
  return await runWithSession(session, mergeFromEffect(events));
}

async function exchangeDeltasEffect(
  a: TargetLayerSession,
  b: TargetLayerSession,
) {
  const eventsA = await eventsFor(a);
  const eventsB = await eventsFor(b);
  const vvA0 = versionVector(eventsA);
  const vvB0 = versionVector(eventsB);
  const deltaA = eventsA.filter((event) => {
    const seq = event.seq ?? 0;
    return seq <= 0 || seq > (vvB0[event.hlc.r] ?? 0);
  });
  const deltaB = eventsB.filter((event) => {
    const seq = event.seq ?? 0;
    return seq <= 0 || seq > (vvA0[event.hlc.r] ?? 0);
  });

  const insertedIntoA = await mergeInto(a, deltaB);
  const insertedIntoB = await mergeInto(b, deltaA);

  return {
    sentFromA: deltaA.length,
    sentFromB: deltaB.length,
    insertedIntoA,
    insertedIntoB,
    vvA: versionVector(await eventsFor(a)),
    vvB: versionVector(await eventsFor(b)),
  };
}
