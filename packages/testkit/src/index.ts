import {
  assert as assertEvent,
  entity as projectEntity,
  fromEvents,
  retract as retractEvent,
  tombstone as tombstoneEvent,
  value as projectValue,
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
  type ScheduledOperation,
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

export interface RuntimePersistenceConformanceTarget
  extends RuntimeLayerConformanceTarget {
  /**
   * Optional cleanup hook. Called before the suite starts when a target wants to
   * clear durable state from prior test runs.
   */
  resetPersistence?(): void | Promise<void>;
}

export interface ScheduledObservation {
  readonly ms: number;
  readonly op: ScheduledOperation;
}

export interface RuntimeSchedulerConformanceTarget
  extends RuntimeLayerConformanceTarget {
  /**
   * Return the operations the target's scheduler has accepted so the conformance
   * suite can verify boundary semantics without pretending to verify host wakeups.
   */
  readScheduled(): readonly ScheduledObservation[];
  resetScheduler?(): void | Promise<void>;
}

export interface RuntimeTransportConformanceTarget
  extends RuntimeLayerConformanceTarget {
  /**
   * Return the event batches the target's transport has published. This verifies
   * the Effect transport service boundary, not network delivery semantics.
   */
  readPublished(): readonly (readonly Event[])[];
  resetTransport?(): void | Promise<void>;
}

export interface RuntimeNetworkTransportPair {
  readonly left: RuntimeServices;
  readonly right: RuntimeServices;
  startLeft(): void | Promise<void>;
  startRight(): void | Promise<void>;
  /**
   * Optional hook for transports where mere construction/connectivity can receive
   * messages (for example DataChannel listeners attached at connect time). When
   * present, the conformance suite calls it after left writes the seed event and
   * before starting/announcing right, so late-peer catch-up tests a real network
   * join rather than a local runtime object that was already connected.
   */
  connectRight?(): void | Promise<void>;
  announceRight(): void | Promise<void>;
  flush(): void | Promise<void>;
  stop(): void | Promise<void>;
}

export interface RuntimeNetworkTransportConformanceTarget {
  readonly name: string;
  /**
   * Return two connected replicas. The lifecycle is explicit because network
   * transport behavior lives outside the pure Effect service boundary: targets
   * attach concrete channels, start listeners, announce peers, and flush their
   * own async delivery mechanism.
   */
  createPair(options: {
    readonly leftReplicaId: string;
    readonly rightReplicaId: string;
    readonly wall?: () => number;
  }): RuntimeNetworkTransportPair | Promise<RuntimeNetworkTransportPair>;
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

type NamedTarget = { readonly name: string };

function fail(target: NamedTarget, message: string): never {
  throw new Error(`@metacrdt/testkit(${target.name}): ${message}`);
}

function expect(
  target: NamedTarget,
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
  target: NamedTarget,
  rt: RuntimeServices,
) {
  if (rt.sequencer === undefined) {
    fail(target, "runtime target must provide a sequencer for Effect conformance");
  }
  return { ...rt, sequencer: rt.sequencer };
}

function sessionForRuntime(
  target: NamedTarget,
  runtime: RuntimeServices,
): TargetLayerSession {
  return {
    layer: runtimeServicesLayer(requireSequencer(target, runtime)),
    async dispose() {},
  };
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

export async function runRuntimeProjectionConformance(
  target: AnyRuntimeConformanceTarget,
): Promise<ConformanceReport> {
  return await runWithTargetLayer(
    target,
    { replicaId: "testkit:projection", wall: () => 1_000 },
    Effect.gen(function* () {
      const checks: string[] = [];
      const profile = yield* RuntimeProfileService;
      const store = yield* EventStoreService;
      expect(
        target,
        profile.replicaId === "testkit:projection",
        "runtime profile replicaId mismatch",
      );

      const active = assertEvent({
        e: "worker:maria",
        a: "worker.status",
        v: "active",
        validFrom: 0,
        actor: "alice",
        actorType: "human",
        hlc: { pt: 1, l: 0, r: "testkit:projection" },
      });
      const terminated = assertEvent({
        e: "worker:maria",
        a: "worker.status",
        v: "terminated",
        validFrom: 0,
        actor: "bob",
        actorType: "human",
        hlc: { pt: 1, l: 0, r: "testkit:projection" },
      });
      const remote = assertEvent({
        e: "worker:maria",
        a: "worker.tag",
        v: "remote",
        validFrom: 0,
        actor: "alice",
        actorType: "human",
        hlc: { pt: 2, l: 0, r: "testkit:projection" },
      });
      const urgent = assertEvent({
        e: "worker:maria",
        a: "worker.tag",
        v: "urgent",
        validFrom: 0,
        actor: "bob",
        actorType: "human",
        hlc: { pt: 3, l: 0, r: "testkit:projection" },
      });
      const seasonal = assertEvent({
        e: "placement:1",
        a: "placement.status",
        v: "active",
        validFrom: 50,
        validTo: 200,
        actor: "system",
        actorType: "system",
        hlc: { pt: 4, l: 0, r: "testkit:projection" },
      });
      const future = assertEvent({
        e: "placement:1",
        a: "placement.status",
        v: "future",
        validFrom: 200,
        actor: "system",
        actorType: "system",
        hlc: { pt: 5, l: 0, r: "testkit:projection" },
      });
      const cert = assertEvent({
        e: "cert:1",
        a: "cert.status",
        v: "valid",
        validFrom: 0,
        actor: "system",
        actorType: "system",
        hlc: { pt: 6, l: 0, r: "testkit:projection" },
      });
      const certRetracted = retractEvent({
        target: cert.id,
        actor: "auditor",
        actorType: "human",
        hlc: { pt: 7, l: 0, r: "testkit:projection" },
      });
      const note = assertEvent({
        e: "worker:maria",
        a: "worker.note",
        v: "hidden",
        validFrom: 0,
        actor: "system",
        actorType: "system",
        hlc: { pt: 8, l: 0, r: "testkit:projection" },
      });
      const noteTombstoned = tombstoneEvent({
        target: note.id,
        actor: "auditor",
        actorType: "human",
        hlc: { pt: 9, l: 0, r: "testkit:projection" },
      });

      // Intentionally append in a non-semantic order. A target may scan in any
      // order; the projection result must come from the shared core fold.
      for (const event of [
        urgent,
        seasonal,
        certRetracted,
        active,
        noteTombstoned,
        future,
        remote,
        cert,
        note,
        terminated,
      ]) {
        yield* store.append(event);
      }

      const current = { txTime: 10_000, validTime: 100 };
      const later = { txTime: 10_000, validTime: 250 };
      const cardinalityOf = (a: string) =>
        a === "worker.tag" ? ("many" as const) : ("one" as const);
      const log = fromEvents(yield* store.scan());

      const status = projectValue(
        "worker:maria",
        "worker.status",
        current,
        log,
        cardinalityOf,
      );
      expect(
        target,
        !Array.isArray(status) &&
          status?.id === terminated.id &&
          status.v === "terminated",
        "cardinality-one projection should pick the ≺-max visible assert",
      );
      checks.push("projection-cardinality-one-winner");

      const tags = valueOf(
        "worker:maria",
        "worker.tag",
        current,
        log,
        cardinalityOf,
      ) as string[];
      expect(
        target,
        JSON.stringify([...tags].sort()) === JSON.stringify(["remote", "urgent"]),
        "cardinality-many projection should return every visible value",
      );
      checks.push("projection-cardinality-many-set");

      const worker = projectEntity("worker:maria", current, log, cardinalityOf);
      expect(
        target,
        "worker.status" in worker &&
          "worker.tag" in worker &&
          !("worker.note" in worker),
        "entity projection should include visible attributes and omit tombstoned ones",
      );
      checks.push("projection-entity-map");

      expect(
        target,
        valueOf("placement:1", "placement.status", current, log, cardinalityOf) ===
          "active" &&
          valueOf("placement:1", "placement.status", later, log, cardinalityOf) ===
            "future",
        "bitemporal projection should respect valid intervals",
      );
      checks.push("projection-bitemporal-coordinate");

      expect(
        target,
        valueOf("cert:1", "cert.status", current, log, cardinalityOf) ===
          undefined &&
          valueOf("cert:1", "cert.status", current, log, cardinalityOf, {
            includeRetracted: true,
          }) === "valid" &&
          valueOf("worker:maria", "worker.note", current, log, cardinalityOf) ===
            undefined &&
          valueOf("worker:maria", "worker.note", current, log, cardinalityOf, {
            includeTombstoned: true,
          }) === "hidden",
        "projection audit flags should expose retracted/tombstoned values only when requested",
      );
      checks.push("projection-audit-flags");

      const workerLog = fromEvents(yield* store.scan({ e: "worker:maria" }));
      expect(
        target,
        valueOf(
          "worker:maria",
          "worker.status",
          current,
          workerLog,
          cardinalityOf,
        ) === "terminated" &&
          valueOf("placement:1", "placement.status", current, workerLog, cardinalityOf) ===
            undefined,
        "projection should work over target-filtered event sources",
      );
      checks.push("projection-filtered-source-query");

      return { target: target.name, checks };
    }),
  );
}

export async function runRuntimeConformance(
  target: AnyRuntimeConformanceTarget,
): Promise<ConformanceReport> {
  const store = await runEventStoreConformance(target);
  const convergence = await runRuntimeConvergenceConformance(target);
  const projection = await runRuntimeProjectionConformance(target);
  return {
    target: target.name,
    checks: [...store.checks, ...convergence.checks, ...projection.checks],
  };
}

export async function runRuntimePersistenceConformance(
  target: RuntimePersistenceConformanceTarget,
): Promise<ConformanceReport> {
  await target.resetPersistence?.();
  const checks: string[] = [];
  const options = { replicaId: "testkit:persist", wall: () => 1_000 };
  let firstEvent: Event;
  let firstEvents: Event[];

  const first = await layerSession(target, options);
  await withLayerSessions([first], async () => {
    firstEvent = await runWithSession(
      first,
      applyOperationEffect({
        op: "assert",
        e: "worker:persist",
        a: "worker.status",
        v: "active",
        actor: "alice",
      }),
    );
    firstEvents = await eventsFor(first);
    expect(target, firstEvent.seq === 1, "first append should have seq=1");
    expect(
      target,
      JSON.stringify(versionVector(firstEvents)) ===
        JSON.stringify({ "testkit:persist": 1 }),
      "first version vector mismatch",
    );
  });

  const second = await layerSession(target, options);
  return await withLayerSessions([second], async () => {
    const result = await runWithSession(
      second,
      Effect.gen(function* () {
        const store = yield* EventStoreService;
        const clock = yield* RuntimeClockService;
        const sequencer = yield* RuntimeSequencerService;
        const persisted = yield* store.get(firstEvent.id);
        const events = yield* store.scan();
        const currentClock = yield* clock.current();
        const currentSeq = yield* sequencer.current();
        const next = yield* applyOperationEffect({
          op: "assert",
          e: "worker:persist",
          a: "worker.tag",
          v: "after-restart",
          actor: "alice",
        });
        return {
          persisted,
          events,
          currentClock,
          currentSeq,
          next,
          after: yield* store.scan(),
        };
      }),
    );

    expect(target, result.persisted?.id === firstEvent.id, "event log did not persist");
    expect(
      target,
      sameIds(result.events, firstEvents),
      "recreated runtime should see the pre-restart log",
    );
    checks.push("event-log-survives-recreate");

    expect(
      target,
      JSON.stringify(versionVector(result.events)) ===
        JSON.stringify({ "testkit:persist": 1 }),
      "version vector did not persist",
    );
    checks.push("version-vector-survives-recreate");

    expect(target, result.currentSeq === 1, "sequencer did not restore current seq");
    expect(target, result.next.seq === 2, "next append should continue seq after restart");
    checks.push("sequencer-survives-recreate");

    expect(
      target,
      JSON.stringify(result.currentClock) === JSON.stringify(firstEvent.hlc),
      "clock did not restore the previous HLC",
    );
    expect(
      target,
      result.next.hlc.pt === firstEvent.hlc.pt &&
        result.next.hlc.l === firstEvent.hlc.l + 1,
      "clock should continue logical time when wall time does not advance",
    );
    checks.push("hlc-survives-recreate");

    expect(
      target,
      JSON.stringify(versionVector(result.after)) ===
        JSON.stringify({ "testkit:persist": 2 }),
      "post-restart append should advance version vector",
    );
    checks.push("post-restart-append-advances-vv");

    return { target: target.name, checks };
  });
}

export async function runRuntimeSchedulerConformance(
  target: RuntimeSchedulerConformanceTarget,
): Promise<ConformanceReport> {
  await target.resetScheduler?.();
  const checks: string[] = [];
  const first: ScheduledOperation = {
    op: "flow.resume",
    payload: { runId: "flow:1", step: "collect-i9" },
  };
  const second: ScheduledOperation = {
    op: "materialize.rule",
    payload: { rule: "requires.i9" },
  };

  await runWithTargetLayer(
    target,
    { replicaId: "testkit:scheduler", wall: () => 1_000 },
    Effect.gen(function* () {
      const profile = yield* RuntimeProfileService;
      const scheduler = yield* SchedulerService;
      expect(
        target,
        profile.replicaId === "testkit:scheduler",
        "runtime profile replicaId mismatch",
      );
      yield* scheduler.after(250, first);
      yield* scheduler.after(0, second);
    }),
  );

  const scheduled = target.readScheduled();
  expect(target, scheduled.length === 2, "scheduler should accept two operations");
  checks.push("scheduler-accepts-operations");

  expect(
    target,
    scheduled[0]?.ms === 250 && scheduled[1]?.ms === 0,
    "scheduler should preserve requested delays and order",
  );
  checks.push("scheduler-preserves-delay-order");

  expect(
    target,
    JSON.stringify(scheduled[0]?.op) === JSON.stringify(first) &&
      JSON.stringify(scheduled[1]?.op) === JSON.stringify(second),
    "scheduler should preserve operation payloads",
  );
  checks.push("scheduler-preserves-payloads");

  return { target: target.name, checks };
}

export async function runRuntimeTransportConformance(
  target: RuntimeTransportConformanceTarget,
): Promise<ConformanceReport> {
  await target.resetTransport?.();
  const checks: string[] = [];
  const first = sampleAssert("testkit:transport", 1);
  const second = sampleAssert("testkit:transport", 2);

  await runWithTargetLayer(
    target,
    { replicaId: "testkit:transport", wall: () => 1_000 },
    Effect.gen(function* () {
      const profile = yield* RuntimeProfileService;
      const transport = yield* TransportService;
      expect(
        target,
        profile.replicaId === "testkit:transport",
        "runtime profile replicaId mismatch",
      );
      yield* transport.publish([first]);
      yield* transport.publish([first, second]);
    }),
  );

  const published = target.readPublished();
  expect(target, published.length === 2, "transport should publish two batches");
  checks.push("transport-accepts-batches");

  expect(
    target,
    published[0]?.length === 1 && published[1]?.length === 2,
    "transport should preserve batch boundaries",
  );
  checks.push("transport-preserves-batches");

  expect(
    target,
    published[0]?.[0]?.id === first.id &&
      published[1]?.[0]?.id === first.id &&
      published[1]?.[1]?.id === second.id,
    "transport should preserve event payload order",
  );
  checks.push("transport-preserves-event-order");

  return { target: target.name, checks };
}

export async function runRuntimeNetworkTransportConformance(
  target: RuntimeNetworkTransportConformanceTarget,
): Promise<ConformanceReport> {
  const checks: string[] = [];

  const delivery = await target.createPair({
    leftReplicaId: "testkit:net:left",
    rightReplicaId: "testkit:net:right",
    wall: () => 1_000,
  });
  const deliveryLeft = sessionForRuntime(target, delivery.left);
  const deliveryRight = sessionForRuntime(target, delivery.right);
  try {
    await delivery.startLeft();
    await delivery.startRight();
    const event = await runWithSession(
      deliveryLeft,
      applyOperationEffect({
        op: "assert",
        e: "network:delivery",
        a: "status",
        v: "sent",
        actor: "alice",
      }),
    );
    await delivery.flush();
    expect(
      target,
      (await eventFor(deliveryRight, event.id))?.id === event.id,
      "right replica should receive left's local event",
    );
    checks.push("network-delivers-local-events");
  } finally {
    await delivery.stop();
  }

  const catchup = await target.createPair({
    leftReplicaId: "testkit:net:left",
    rightReplicaId: "testkit:net:right",
    wall: () => 2_000,
  });
  const catchupLeft = sessionForRuntime(target, catchup.left);
  const catchupRight = sessionForRuntime(target, catchup.right);
  try {
    await catchup.startLeft();
    const existing = await runWithSession(
      catchupLeft,
      applyOperationEffect({
        op: "assert",
        e: "network:late-peer",
        a: "status",
        v: "ready",
        actor: "alice",
      }),
    );
    await catchup.flush();
    await catchup.connectRight?.();
    await catchup.startRight();
    await catchup.announceRight();
    await catchup.flush();

    expect(
      target,
      (await eventFor(catchupRight, existing.id))?.id === existing.id,
      "late peer should receive version-vector delta on announce",
    );
    expect(
      target,
      JSON.stringify(versionVector(await eventsFor(catchupRight))) ===
        JSON.stringify({ "testkit:net:left": 1 }),
      "late peer version vector mismatch after catch-up",
    );
    checks.push("network-catches-up-late-peer");

    const second = await exchangeDeltasEffect(catchupLeft, catchupRight);
    expect(
      target,
      second.sentFromA === 0 &&
        second.sentFromB === 0 &&
        second.insertedIntoA === 0 &&
        second.insertedIntoB === 0,
      "network catch-up should leave no delta for a second sync",
    );
    expect(
      target,
      JSON.stringify(second.vvA) === JSON.stringify(second.vvB),
      "version vectors should match after network catch-up",
    );
    checks.push("network-sync-is-idempotent");
  } finally {
    await catchup.stop();
  }

  return { target: target.name, checks };
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

async function eventFor(
  session: TargetLayerSession,
  id: Event["id"],
): Promise<Event | undefined> {
  return await runWithSession(
    session,
    Effect.gen(function* () {
      const store = yield* EventStoreService;
      return yield* store.get(id);
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
