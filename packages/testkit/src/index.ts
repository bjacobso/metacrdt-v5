import {
  assert as assertEvent,
  fromEvents,
  valueOf,
  verifyId,
  type Event,
} from "@metacrdt/core";
import {
  applyOperation,
  exchangeDeltas,
  versionVector,
  type RuntimeServices,
} from "@metacrdt/runtime";

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

export interface ConformanceReport {
  readonly target: string;
  readonly checks: readonly string[];
}

const MANY = () => "many" as const;
const ONE = () => "one" as const;
const COORD = { txTime: 10_000, validTime: 1_000 };

function fail(target: RuntimeConformanceTarget, message: string): never {
  throw new Error(`@metacrdt/testkit(${target.name}): ${message}`);
}

function expect(
  target: RuntimeConformanceTarget,
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

async function runtime(
  target: RuntimeConformanceTarget,
  replicaId: string,
  wall: () => number = () => 1_000,
): Promise<RuntimeServices> {
  const rt = await target.createRuntime({ replicaId, wall });
  expect(
    target,
    rt.profile.replicaId === replicaId,
    "runtime profile replicaId mismatch",
  );
  return rt;
}

async function cleanup(
  target: RuntimeConformanceTarget,
  runtimes: readonly RuntimeServices[],
): Promise<void> {
  for (const rt of runtimes) await target.disposeRuntime?.(rt);
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
  target: RuntimeConformanceTarget,
): Promise<ConformanceReport> {
  const checks: string[] = [];
  const rt = await runtime(target, "testkit:store");
  try {
    const first = sampleAssert(rt.profile.replicaId, 1);
    const second = sampleAssert(rt.profile.replicaId, 2);
    expect(target, verifyId(first), "sample event should have a valid id");

    const inserted = await rt.store.append(first);
    expect(target, inserted.inserted, "first append should insert");
    expect(target, inserted.event.id === first.id, "append should echo the event");
    const duplicate = await rt.store.append(first);
    expect(target, !duplicate.inserted, "duplicate append should be idempotent");
    checks.push("append-idempotent");

    await rt.store.append(second);
    expect(
      target,
      (await rt.store.get(first.id))?.id === first.id,
      "get(id) failed",
    );
    expect(
      target,
      (await rt.store.scan({ e: first.e })).length === 1,
      "scan({e}) failed",
    );
    expect(
      target,
      (await rt.store.scan({ a: "status" })).length === 2,
      "scan({a}) failed",
    );
    expect(
      target,
      (await rt.store.scan({ ids: [second.id] })).map((e) => e.id).join(",") ===
        second.id,
      "scan({ids}) failed",
    );
    checks.push("scan-filters");

    const merge = await rt.store.merge([first, second]);
    expect(target, merge.seen === 2, "merge should count seen events");
    expect(
      target,
      merge.inserted === 0,
      "merge should be idempotent for seen events",
    );
    checks.push("gset-merge-idempotent");

    let rejected = false;
    try {
      await rt.store.append({ ...first, id: "not-the-content-id" });
    } catch {
      rejected = true;
    }
    expect(target, rejected, "store MUST reject events with invalid content ids");
    checks.push("content-id-verification");

    return { target: target.name, checks };
  } finally {
    await cleanup(target, [rt]);
  }
}

export async function runRuntimeConvergenceConformance(
  target: RuntimeConformanceTarget,
): Promise<ConformanceReport> {
  const checks: string[] = [];
  const left = await runtime(target, "testkit:left", () => 1_000);
  const right = await runtime(target, "testkit:right", () => 1_000);
  try {
    const leftStatus = await applyOperation(left, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "alice",
    });
    const rightStatus = await applyOperation(right, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "terminated",
      actor: "bob",
    });
    await applyOperation(left, {
      op: "assert",
      e: "worker:maria",
      a: "worker.tag",
      v: "left",
      actor: "alice",
    });
    await applyOperation(right, {
      op: "assert",
      e: "worker:maria",
      a: "worker.tag",
      v: "right",
      actor: "bob",
    });

    const first = await exchangeDeltas(left, right);
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

    const leftEvents = await left.store.scan();
    const rightEvents = await right.store.scan();
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

    const second = await exchangeDeltas(left, right);
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
  } finally {
    await cleanup(target, [left, right]);
  }
}

export async function runRuntimeConformance(
  target: RuntimeConformanceTarget,
): Promise<ConformanceReport> {
  const store = await runEventStoreConformance(target);
  const convergence = await runRuntimeConvergenceConformance(target);
  return {
    target: target.name,
    checks: [...store.checks, ...convergence.checks],
  };
}
