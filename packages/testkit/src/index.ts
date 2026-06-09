import {
  assert as assertEvent,
  entity as projectEntity,
  fromEvents,
  retract as retractEvent,
  tombstone as tombstoneEvent,
  visible,
  value as projectValue,
  valueOf,
  verifyId,
  type Event,
  type Value,
} from "@metacrdt/core";
import {
  valueKey,
} from "@metacrdt/query";
import {
  COLLECT_TOKEN_TTL_MS,
  formDefinitionFacts,
  requirementClauses,
  scopeEntity,
  submissionFacts,
  tokenInvalidReason,
  type FormDef as CollectFormDef,
} from "@metacrdt/collect";
import {
  DatalogQueryService,
  applyOperationEffect,
  datalogQueryLayer,
  mergeFromEffect,
  projectionRowsFromLog,
  runtimeServicesLayer,
  versionVector,
  EventStoreService,
  ProjectionStoreService,
  RuntimeClockService,
  RuntimeProfileService,
  RuntimeSequencerService,
  SchedulerService,
  TransportService,
  type RuntimeError,
  type RuntimeServices,
  type ScheduledOperation,
  type ProjectionRow,
  projectionDatalogQueryLayer,
} from "@metacrdt/runtime";
import {
  stepFlow,
  validateFlowDef,
  waitKeyFromSubmission,
  type FlowDef,
  type FlowRun,
} from "@metacrdt/workflow";
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

export type RuntimeProjectionStoreConformanceServices =
  | RuntimeConformanceServices
  | ProjectionStoreService;

export type RuntimeQueryConformanceServices =
  | RuntimeConformanceServices
  | DatalogQueryService;

export type RuntimeProjectionQueryConformanceServices =
  | RuntimeProjectionStoreConformanceServices
  | DatalogQueryService;

export type RuntimeProjectionStoreConformanceLayer = Layer.Layer<
  RuntimeProjectionStoreConformanceServices,
  unknown
>;

export interface RuntimeLayerConformanceTarget {
  readonly name: string;
  createLayer(options: RuntimeFactoryOptions): RuntimeConformanceLayer;
}

export interface RuntimeProjectionStoreConformanceTarget {
  readonly name: string;
  createLayer(options: RuntimeFactoryOptions): RuntimeProjectionStoreConformanceLayer;
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

export interface WorkflowConformanceTarget extends NamedTarget {}

export interface CollectConformanceTarget extends NamedTarget {}

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

async function runWithQueryTargetLayer<A>(
  target: AnyRuntimeConformanceTarget,
  options: RuntimeFactoryOptions,
  program: Effect.Effect<A, RuntimeError, RuntimeQueryConformanceServices>,
): Promise<A> {
  const session = await layerSession(target, options);
  const layer = Layer.provideMerge(session.layer)(datalogQueryLayer());
  try {
    return await Effect.runPromise(Effect.provide(program, layer));
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

async function runWithProjectionStoreTargetLayer<A>(
  target: RuntimeProjectionStoreConformanceTarget,
  options: RuntimeFactoryOptions,
  program: Effect.Effect<
    A,
    RuntimeError,
    RuntimeProjectionStoreConformanceServices
  >,
): Promise<A> {
  return await Effect.runPromise(Effect.provide(program, target.createLayer(options)));
}

async function runWithProjectionQueryTargetLayer<A>(
  target: RuntimeProjectionStoreConformanceTarget,
  options: RuntimeFactoryOptions,
  program: Effect.Effect<
    A,
    RuntimeError,
    RuntimeProjectionQueryConformanceServices
  >,
): Promise<A> {
  const layer = Layer.provideMerge(target.createLayer(options))(
    projectionDatalogQueryLayer(),
  );
  return await Effect.runPromise(Effect.provide(program, layer));
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

function sameRows(
  actual: readonly Record<string, unknown>[],
  expected: readonly Record<string, unknown>[],
): boolean {
  return JSON.stringify(sortRows(actual)) === JSON.stringify(sortRows(expected));
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
      const firstRetracted = retractEvent({
        target: first.id,
        actor: "testkit",
        actorType: "system",
        hlc: { pt: 3, l: 0, r: profile.replicaId },
      });
      yield* store.append(firstRetracted);
      expect(
        target,
        (yield* store.scan({ target: first.id })).map((e) => e.id).join(",") ===
          firstRetracted.id,
        "scan({target}) failed",
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

export async function runRuntimeProjectionStoreConformance(
  target: RuntimeProjectionStoreConformanceTarget,
): Promise<ConformanceReport> {
  return await runWithProjectionStoreTargetLayer(
    target,
    { replicaId: "testkit:projection-store", wall: () => 1_000 },
    Effect.gen(function* () {
      const checks: string[] = [];
      const store = yield* EventStoreService;
      const projection = yield* ProjectionStoreService;
      const coord = { txTime: 10_000, validTime: 100 };
      const cardinalityOf = (a: string) =>
        a === "worker.tag" ? ("many" as const) : ("one" as const);
      const ev = (pt: number, e: string, a: string, v: Value) =>
        assertEvent({
          e,
          a,
          v,
          validFrom: 0,
          actor: "testkit",
          actorType: "system",
          hlc: { pt, l: 0, r: "testkit:projection-store" },
        });

      const active = ev(1, "worker:maria", "worker.status", "active");
      const terminated = ev(2, "worker:maria", "worker.status", "terminated");
      const remote = ev(3, "worker:maria", "worker.tag", "remote");
      const urgent = ev(4, "worker:maria", "worker.tag", "urgent");
      const stale = assertEvent({
        e: "worker:maria",
        a: "worker.cert",
        v: "expired",
        validFrom: 0,
        validTo: 50,
        actor: "testkit",
        actorType: "system",
        hlc: { pt: 5, l: 0, r: "testkit:projection-store" },
      });

      for (const event of [urgent, active, stale, remote, terminated]) {
        yield* store.append(event);
      }

      const firstRows = projectionRowsFromLog(
        fromEvents(yield* store.scan()),
        coord,
        cardinalityOf,
      );
      const firstReplace = yield* projection.replace(firstRows);
      const all = yield* projection.scan();
      expect(
        target,
        firstReplace.rows === 3 &&
          all.length === 3 &&
          !all.some((row) => row.eventId === active.id) &&
          !all.some((row) => row.eventId === stale.id) &&
          all.some((row) => row.eventId === terminated.id),
        "projection store replace should materialize the current fold only",
      );
      checks.push("projection-store-replace-from-fold");

      const statusRows = yield* projection.scan({
        e: "worker:maria",
        a: "worker.status",
      });
      const remoteRows = yield* projection.scan({ eventIds: [remote.id] });
      const idRows = yield* projection.scan({
        ids: remoteRows.map((row) => row.id),
      });
      expect(
        target,
        statusRows.length === 1 &&
          statusRows[0]?.v === "terminated" &&
          remoteRows.length === 1 &&
          idRows.length === 1 &&
          idRows[0]?.eventId === remote.id,
        "projection store scan should filter by entity, attribute, row id, and event id",
      );
      checks.push("projection-store-scan-filters");

      const available = ev(6, "worker:maria", "worker.status", "available");
      yield* store.append(available);
      const secondRows = projectionRowsFromLog(
        fromEvents(yield* store.scan()),
        coord,
        cardinalityOf,
      );
      const replacementStatusRows = secondRows.filter(
        (row) => row.e === "worker:maria" && row.a === "worker.status",
      );
      const secondReplace = yield* projection.replaceMatching(
        { e: "worker:maria", a: "worker.status" },
        replacementStatusRows,
      );
      const currentStatus = yield* projection.scan({
        e: "worker:maria",
        a: "worker.status",
      });
      const staleStatusRows = yield* projection.scan({ eventIds: [terminated.id] });
      const currentTags = yield* projection.scan({
        e: "worker:maria",
        a: "worker.tag",
      });
      expect(
        target,
        secondReplace.rows === 1 &&
          (yield* projection.scan()).length === 3 &&
          currentStatus.length === 1 &&
          currentStatus[0]?.eventId === available.id &&
          staleStatusRows.length === 0 &&
          currentTags.length === 2,
        "projection store replaceMatching should atomically replace only matching rows",
      );
      checks.push("projection-store-replace-matching-is-scoped");

      yield* projection.clear();
      expect(
        target,
        (yield* projection.scan()).length === 0,
        "projection store clear should remove all materialized rows",
      );
      checks.push("projection-store-clear");

      // Keep the row type part of the public conformance surface.
      const _typedRows: readonly ProjectionRow[] = secondRows;
      void _typedRows;

      return { target: target.name, checks };
    }),
  );
}

export async function runRuntimeProjectionQueryConformance(
  target: RuntimeProjectionStoreConformanceTarget,
): Promise<ConformanceReport> {
  return await runWithProjectionQueryTargetLayer(
    target,
    { replicaId: "testkit:projection-query", wall: () => 20_000 },
    Effect.gen(function* () {
      const checks: string[] = [];
      const store = yield* EventStoreService;
      const projection = yield* ProjectionStoreService;
      const datalog = yield* DatalogQueryService;
      const coord = { txTime: 10_000, validTime: 100 };
      const cardinalityOf = (a: string) =>
        a === "worker.tag" ? ("many" as const) : ("one" as const);
      const ev = (pt: number, e: string, a: string, v: Value) =>
        assertEvent({
          e,
          a,
          v,
          validFrom: 0,
          actor: "testkit",
          actorType: "system",
          hlc: { pt, l: 0, r: "testkit:projection-query" },
        });

      const events = [
        ev(1, "worker:maria", "type", "Worker"),
        ev(2, "worker:maria", "worker.status", "active"),
        ev(3, "worker:maria", "worker.status", "terminated"),
        ev(4, "worker:maria", "worker.tag", "remote"),
        ev(5, "worker:maria", "worker.tag", "urgent"),
        ev(6, "worker:ivan", "type", "Worker"),
        ev(7, "worker:ivan", "worker.status", "pending"),
        ev(8, "placement:1", "placement.worker", "worker:maria"),
        ev(9, "placement:1", "placement.status", "open"),
      ];
      for (const event of events) yield* store.append(event);

      yield* projection.replace(
        projectionRowsFromLog(fromEvents(yield* store.scan()), coord, cardinalityOf),
      );

      const query = yield* datalog.query({
        where: [
          ["?w", "type", "Worker"],
          ["?w", "worker.status", "terminated"],
          ["?w", "worker.tag", "remote"],
          { not: ["?w", "worker.status", "pending"] },
          ["?p", "placement.worker", "?w"],
          ["?p", "placement.status", "open"],
        ],
        select: ["?w", "?p"],
        coord,
      });
      expect(
        target,
        query.rows.length === 1 &&
          query.rows[0]?.w === "worker:maria" &&
          query.rows[0]?.p === "placement:1" &&
          query.eventSourceIds.length >= 5,
        "projection query provider should join current rows and preserve source events",
      );
      checks.push("projection-query-join-negation-provenance");

      const firstTag = yield* datalog.page({
        where: [["worker:maria", "worker.tag", "?tag"]],
        select: ["?tag"],
        coord,
        paginationOpts: { numItems: 1 },
      });
      const aggregate = yield* datalog.aggregate({
        where: [["worker:maria", "worker.tag", "?tag"]],
        coord,
        groupBy: [],
        aggregates: [{ op: "count", as: "tags" }],
      });
      expect(
        target,
        firstTag.page.length === 1 &&
          firstTag.page[0]?.tag === "remote" &&
          firstTag.continueCursor === "1" &&
          aggregate.length === 1 &&
          aggregate[0]?.tags === 2,
        "projection query provider should paginate and aggregate current rows",
      );
      checks.push("projection-query-pagination-aggregation");

      const derived = yield* datalog.derivedRows({
        where: [["?w", "worker.status", "terminated"]],
        coord,
        emit: { e: "?w", a: "worker.offboarded", v: true },
      });
      expect(
        target,
        derived.length === 1 &&
          derived[0]?.e === "worker:maria" &&
          derived[0]?.a === "worker.offboarded" &&
          derived[0]?.v === true,
        "projection query provider should shape derived rows from current bindings",
      );
      checks.push("projection-query-derived-rows");

      return { target: target.name, checks };
    }),
  );
}

export async function runRuntimeQueryConformance(
  target: AnyRuntimeConformanceTarget,
): Promise<ConformanceReport> {
  const checks: string[] = [];
  return await runWithQueryTargetLayer(
    target,
    { replicaId: "testkit:query", wall: () => 20_000 },
    Effect.gen(function* () {
      const store = yield* EventStoreService;
      const datalog = yield* DatalogQueryService;
      const coord = { txTime: 10_000, validTime: 100 };
      const ev = (pt: number, e: string, a: string, v: Value) =>
        assertEvent({
          e,
          a,
          v,
          validFrom: 0,
          actor: "testkit",
          actorType: "system",
          hlc: { pt, l: 0, r: "testkit:query" },
        });

      const mariaType = ev(1, "worker:maria", "type", "Worker");
      const mariaStatus = ev(2, "worker:maria", "worker.status", "active");
      const mariaScore = ev(3, "worker:maria", "worker.score", 12);
      const mariaName = ev(4, "worker:maria", "worker.name", "MARIA");
      const ivanType = ev(5, "worker:ivan", "type", "Worker");
      const ivanStatus = ev(6, "worker:ivan", "worker.status", "pending");
      const ivanScore = ev(7, "worker:ivan", "worker.score", 8);
      const terminatedType = ev(8, "worker:terminated", "type", "Worker");
      const terminatedStatus = ev(
        9,
        "worker:terminated",
        "worker.status",
        "terminated",
      );
      const terminatedScore = ev(
        10,
        "worker:terminated",
        "worker.score",
        20,
      );
      const placement1Worker = ev(
        11,
        "placement:1",
        "placement.worker",
        "worker:maria",
      );
      const placement1Status = ev(12, "placement:1", "placement.status", "open");
      const placement2Worker = ev(
        13,
        "placement:2",
        "placement.worker",
        "worker:ivan",
      );
      const placement2Status = ev(14, "placement:2", "placement.status", "open");
      const placement3Worker = ev(
        15,
        "placement:3",
        "placement.worker",
        "worker:terminated",
      );
      const placement3Status = ev(16, "placement:3", "placement.status", "open");
      const oldPlacement = assertEvent({
        e: "placement:old",
        a: "placement.worker",
        v: "worker:maria",
        validFrom: 0,
        validTo: 50,
        actor: "testkit",
        actorType: "system",
        hlc: { pt: 17, l: 0, r: "testkit:query" },
      });

      for (const event of [
        placement2Status,
        mariaScore,
        terminatedStatus,
        placement1Worker,
        ivanStatus,
        oldPlacement,
        mariaType,
        placement3Worker,
        terminatedType,
        mariaName,
        placement1Status,
        ivanScore,
        placement2Worker,
        mariaStatus,
        terminatedScore,
        ivanType,
        placement3Status,
      ]) {
        yield* store.append(event);
      }

      const openAssignable = yield* datalog.query({
        coord,
        where: [
          ["?w", "type", "Worker"],
          { or: [[["?w", "worker.status", "active"]], [["?w", "worker.status", "pending"]]] },
          { not: ["?w", "worker.status", "terminated"] },
          ["?p", "placement.worker", "?w"],
          ["?p", "placement.status", "open"],
        ],
        select: ["?w", "?p"],
      });
      expect(
        target,
        sameRows(openAssignable.rows, [
          { w: "worker:maria", p: "placement:1" },
          { w: "worker:ivan", p: "placement:2" },
        ]),
        "query should join visible triples, branch over status, and filter negation",
      );
      expect(
        target,
        openAssignable.eventSourceIds.includes(placement1Worker.id) &&
          openAssignable.eventSourceIds.includes(placement2Worker.id) &&
          !openAssignable.eventSourceIds.includes(placement3Worker.id),
        "query provenance should include contributing visible event ids",
      );
      checks.push("query-join-or-negation-provenance");

      const scored = yield* datalog.query({
        coord,
        where: [
          ["?w", "type", "Worker"],
          ["?w", "worker.score", "?score"],
          ["?score", ">=", 10],
          { compute: ["+", "?score", 1], as: "?next" },
        ],
        select: ["?w", "?next"],
      });
      expect(
        target,
        sameRows(scored.rows, [
          { w: "worker:maria", next: 13 },
          { w: "worker:terminated", next: 21 },
        ]),
        "query should apply compare and compute clauses after binding inputs",
      );
      checks.push("query-compare-compute-project");

      const deduped = yield* datalog.query({
        coord,
        where: [
          { or: [[["?w", "worker.status", "active"]], [["?w", "worker.score", 12]]] },
        ],
        select: ["?w"],
      });
      expect(
        target,
        sameRows(deduped.rows, [{ w: "worker:maria" }]) &&
          deduped.eventSourceIds.includes(mariaStatus.id) &&
          deduped.eventSourceIds.includes(mariaScore.id),
        "query disjunction should dedupe rows while preserving merged provenance",
      );
      checks.push("query-or-dedupe");

      const page = yield* datalog.page({
        coord,
        where: [
          ["?w", "type", "Worker"],
          { or: [[["?w", "worker.status", "active"]], [["?w", "worker.status", "pending"]]] },
          { not: ["?w", "worker.status", "terminated"] },
          ["?p", "placement.worker", "?w"],
          ["?p", "placement.status", "open"],
        ],
        select: ["?w", "?p"],
        paginationOpts: { numItems: 1 },
      });
      const nextPage = yield* datalog.page({
        coord,
        where: [
          ["?w", "type", "Worker"],
          { or: [[["?w", "worker.status", "active"]], [["?w", "worker.status", "pending"]]] },
          { not: ["?w", "worker.status", "terminated"] },
          ["?p", "placement.worker", "?w"],
          ["?p", "placement.status", "open"],
        ],
        select: ["?w", "?p"],
        paginationOpts: { numItems: 1, cursor: page.continueCursor },
      });
      expect(
        target,
        page.page.length === 1 &&
          page.continueCursor === "1" &&
          !page.isDone &&
          nextPage.page.length === 1 &&
          nextPage.isDone,
        "query pagination should split stable projected rows",
      );

      const aggregates = yield* datalog.aggregate({
        coord,
        where: [
          ["?w", "type", "Worker"],
          { or: [[["?w", "worker.status", "active"]], [["?w", "worker.status", "pending"]]] },
          { not: ["?w", "worker.status", "terminated"] },
          ["?p", "placement.worker", "?w"],
          ["?p", "placement.status", "open"],
        ],
        groupBy: [],
        aggregates: [
          { op: "count", as: "openAssignments" },
          { op: "countDistinct", var: "?w", as: "workers" },
        ],
      });
      expect(
        target,
        sameRows(aggregates, [{ openAssignments: 2, workers: 2 }]),
        "query aggregation should summarize provenanced bindings",
      );
      checks.push("query-pagination-aggregation");

      const derived = yield* datalog.derivedRows({
        coord,
        where: [
          ["?w", "type", "Worker"],
          { or: [[["?w", "worker.status", "active"]], [["?w", "worker.status", "pending"]]] },
          { not: ["?w", "worker.status", "terminated"] },
          ["?p", "placement.worker", "?w"],
          ["?p", "placement.status", "open"],
        ],
        emit: { e: "?w", a: "worker.hasOpenPlacement", v: true },
      });
      expect(
        target,
        sameRows(derived, [
          { e: "worker:ivan", a: "worker.hasOpenPlacement", v: true },
          { e: "worker:maria", a: "worker.hasOpenPlacement", v: true },
        ]),
        "query bindings should shape deterministic derived rows",
      );
      checks.push("query-derived-rows");

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
  const query = await runRuntimeQueryConformance(target);
  return {
    target: target.name,
    checks: [
      ...store.checks,
      ...convergence.checks,
      ...projection.checks,
      ...query.checks,
    ],
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

export async function runWorkflowConformance(
  target: WorkflowConformanceTarget,
): Promise<ConformanceReport> {
  const checks: string[] = [];
  const flow: FlowDef = {
    name: "testkit_onboarding",
    startStepId: "collect-i9",
    steps: [
      {
        id: "collect-i9",
        type: "collect",
        config: { form: "i9", scopeFrom: "employer", reminderSeconds: 5 },
        next: "branch",
      },
      {
        id: "branch",
        type: "branch",
        config: { ifTrue: "assert", ifFalse: "wait" },
      },
      { id: "assert", type: "assert", config: { a: "workflow.done", v: true }, next: "done" },
      { id: "wait", type: "wait", config: { seconds: 2 }, next: "done" },
      { id: "done", type: "done" },
    ],
  };
  const run: FlowRun = {
    id: "flow:1",
    subject: "worker:maria",
    status: "running",
    currentStepId: "collect-i9",
    context: { employer: "employer:acme" },
  };

  const validation = validateFlowDef(flow);
  expect(target, validation.ok, "workflow conformance flow should be valid");
  checks.push("dag-validation-accepts-valid-flow");

  const invalid = validateFlowDef({
    name: "bad",
    startStepId: "a",
    steps: [
      { id: "a", type: "notify", next: "missing" },
      { id: "orphan", type: "done" },
    ],
  });
  expect(
    target,
    !invalid.ok &&
      invalid.diagnostics.some((diag) => diag.code === "dangling-target") &&
      invalid.diagnostics.some((diag) => diag.code === "unreachable-step"),
    "workflow DAG validation should reject dangling and unreachable steps",
  );
  checks.push("dag-validation-rejects-bad-defs");

  const collect = stepFlow(flow, run);
  const parked = collect.intents.find((intent) => intent.kind === "park");
  expect(target, collect.run.status === "waiting", "collect step should park run");
  expect(
    target,
    parked?.kind === "park" &&
      parked.reason === "collect" &&
      JSON.stringify(parked.waitKey) ===
        JSON.stringify({ subject: "worker:maria", form: "i9", scope: "employer:acme" }),
    "collect step should park on the submitted marker wait-key",
  );
  checks.push("collect-step-parks-on-wait-key");

  const parsedKey = waitKeyFromSubmission(
    "worker:maria",
    "submitted.i9",
    "employer:acme",
  );
  expect(
    target,
    JSON.stringify(parsedKey) === JSON.stringify(parked?.kind === "park" ? parked.waitKey : null),
    "submitted marker should round-trip to the parked wait-key",
  );
  checks.push("submitted-marker-resolves-wait-key");

  const branched = stepFlow(
    flow,
    { ...run, currentStepId: "branch" },
    { branchResults: { branch: true } },
  );
  expect(
    target,
    branched.intents.some((intent) => intent.kind === "assert" && intent.a === "workflow.done"),
    "branch true path should reach assert step",
  );
  checks.push("branch-routes-true-to-assert");

  const waiting = stepFlow(flow, { ...run, currentStepId: "wait" });
  expect(
    target,
    waiting.intents.some(
      (intent) =>
        intent.kind === "schedule" &&
        intent.afterMs === 2_000 &&
        intent.op.op === "flow.resume",
    ),
    "wait step should schedule flow resume",
  );
  checks.push("wait-step-schedules-resume");

  const done = stepFlow(flow, { ...run, currentStepId: "done" });
  expect(target, done.run.status === "completed", "done step should complete run");
  checks.push("done-step-completes");

  return { target: target.name, checks };
}

export async function runCollectConformance(
  target: CollectConformanceTarget,
): Promise<ConformanceReport> {
  const checks: string[] = [];
  const form: CollectFormDef = {
    form: "i9",
    title: "Form I-9",
    validityDays: 365,
    fields: [
      { name: "ssn", label: "SSN", type: "string", required: true, pii: true },
      {
        name: "citizenship",
        label: "Citizenship",
        type: "select",
        required: true,
        options: ["citizen", "authorized_alien"],
      },
    ],
  };

  expect(
    target,
    JSON.stringify(formDefinitionFacts(form)) ===
      JSON.stringify([
        { e: "form:i9", a: "type", value: "Form" },
        {
          e: "form:i9",
          a: "formDef",
          value: { title: "Form I-9", fields: form.fields },
        },
      ]),
    "form definition facts should use the canonical form entity",
  );
  checks.push("form-definition-facts");

  const facts = submissionFacts(
    "worker:maria",
    form,
    { ssn: "123", citizenship: "authorized_alien" },
    "employer:acme",
    1_000,
  );
  expect(
    target,
    facts.some((fact) => fact.e === "worker:maria" && fact.a === "i9/ssn" && fact.value === "123"),
    "submission should lower field values to facts",
  );
  checks.push("submission-field-facts");
  expect(
    target,
    facts.some(
      (fact) =>
        fact.e === "worker:maria" &&
        fact.a === "submitted.i9" &&
        fact.value === "employer:acme" &&
        fact.validTo === 1_000 + 365 * 24 * 60 * 60 * 1000,
    ),
    "submission should lower the scope-keyed submitted marker with validTo",
  );
  checks.push("submission-marker-with-validity");

  const clauses = requirementClauses({
    form: "forklift",
    scopeAttr: "job",
    guard: ["role", "forklift"],
  });
  const lastTaskClause = clauses.task.where[clauses.task.where.length - 1];
  expect(
    target,
    JSON.stringify(lastTaskClause) ===
      JSON.stringify({ not: ["?w", "submitted.forklift", "?s"] }),
    "task requirement should be requirements AND NOT submitted",
  );
  checks.push("requirement-negation-clause");

  expect(
    target,
    scopeEntity(
      { scopeAttr: "job", guard: ["role", "forklift"] },
      { job: "job:forklift1" },
      { role: "forklift" },
    ) === "job:forklift1",
    "scopeEntity should reuse a matching guarded scope",
  );
  checks.push("scope-reuse-guard");

  expect(
    target,
    tokenInvalidReason(
      { status: "waiting", tokenExpiresAt: 1_000 + COLLECT_TOKEN_TTL_MS },
      1_000,
    ) === null,
    "fresh waiting token should be valid",
  );
  expect(
    target,
    tokenInvalidReason({ status: "waiting", tokenExpiresAt: 1_000 }, 1_000) ===
      "expired",
    "expired token should be rejected",
  );
  checks.push("token-expiry-predicates");

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
