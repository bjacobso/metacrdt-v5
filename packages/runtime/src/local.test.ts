import { describe, expect, test } from "vitest";
import { fromEvents, valueOf } from "@metacrdt/core";
import {
  applyOperation,
  createLocalRuntime,
  exchangeDeltas,
  versionVector,
  type LocalRuntimeStorage,
} from "./index.js";

class FakeStorage implements LocalRuntimeStorage {
  readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const coord = { txTime: 10_000, validTime: 10_000 };
const one = () => "one" as const;
const many = () => "many" as const;

describe("@metacrdt/runtime localStorage target", () => {
  test("persists event log, HLC, and sequence across recreated runtimes", async () => {
    const storage = new FakeStorage();
    let wall = 100;
    const first = createLocalRuntime({
      storage,
      namespace: "suite",
      replicaId: "browser:a",
      wall: () => wall,
    });

    const active = await applyOperation(first, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });
    expect(active.seq).toBe(1);
    expect(active.hlc).toEqual({ pt: 100, l: 0, r: "browser:a" });

    wall = 100;
    const second = createLocalRuntime({
      storage,
      namespace: "suite",
      replicaId: "browser:a",
      wall: () => wall,
    });
    expect(second.clock.current()).toEqual({ pt: 100, l: 0, r: "browser:a" });
    expect(second.sequencer.current()).toBe(1);
    expect((await second.store.scan()).map((e) => e.id)).toEqual([active.id]);

    const terminated = await applyOperation(second, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "terminated",
      actor: "user:1",
    });
    expect(terminated.seq).toBe(2);
    expect(terminated.hlc).toEqual({ pt: 100, l: 1, r: "browser:a" });

    const third = createLocalRuntime({
      storage,
      namespace: "suite",
      replicaId: "browser:a",
      wall: () => 100,
    });
    const log = fromEvents(await third.store.scan());
    expect(valueOf("worker:maria", "worker.status", coord, log, one)).toBe(
      "terminated",
    );
    expect(versionVector(await third.store.scan())).toEqual({ "browser:a": 2 });
  });

  test("local runtimes exchange persisted deltas and converge after restart", async () => {
    const leftStorage = new FakeStorage();
    const rightStorage = new FakeStorage();
    const left = createLocalRuntime({
      storage: leftStorage,
      namespace: "left",
      replicaId: "browser:left",
      wall: () => 200,
    });
    const right = createLocalRuntime({
      storage: rightStorage,
      namespace: "right",
      replicaId: "browser:right",
      wall: () => 200,
    });

    await applyOperation(left, {
      op: "assert",
      e: "task:1",
      a: "tag",
      v: "left",
      actor: "alice",
    });
    await applyOperation(right, {
      op: "assert",
      e: "task:1",
      a: "tag",
      v: "right",
      actor: "bob",
    });

    const first = await exchangeDeltas(left, right);
    expect(first).toMatchObject({
      sentFromA: 1,
      sentFromB: 1,
      insertedIntoA: 1,
      insertedIntoB: 1,
      vvA: { "browser:left": 1, "browser:right": 1 },
      vvB: { "browser:left": 1, "browser:right": 1 },
    });

    const restartedLeft = createLocalRuntime({
      storage: leftStorage,
      namespace: "left",
      replicaId: "browser:left",
      wall: () => 200,
    });
    const restartedRight = createLocalRuntime({
      storage: rightStorage,
      namespace: "right",
      replicaId: "browser:right",
      wall: () => 200,
    });
    const logA = fromEvents(await restartedLeft.store.scan());
    const logB = fromEvents(await restartedRight.store.scan());
    expect([...logA.keys()].sort()).toEqual([...logB.keys()].sort());
    expect(
      (valueOf("task:1", "tag", coord, logA, many) as string[]).sort(),
    ).toEqual(["left", "right"]);
    expect(
      (valueOf("task:1", "tag", coord, logB, many) as string[]).sort(),
    ).toEqual(["left", "right"]);

    const second = await exchangeDeltas(restartedLeft, restartedRight);
    expect(second).toMatchObject({
      sentFromA: 0,
      sentFromB: 0,
      insertedIntoA: 0,
      insertedIntoB: 0,
    });
  });

  test("round-trips byte values without breaking content addressing", async () => {
    const storage = new FakeStorage();
    const rt = createLocalRuntime({
      storage,
      namespace: "bytes",
      replicaId: "browser:bytes",
      wall: () => 300,
    });
    const event = await applyOperation(rt, {
      op: "assert",
      e: "blob:1",
      a: "bytes",
      v: new Uint8Array([1, 2, 3]),
      actor: "user:1",
    });

    const restarted = createLocalRuntime({
      storage,
      namespace: "bytes",
      replicaId: "browser:bytes",
      wall: () => 300,
    });
    expect(await restarted.store.get(event.id)).toEqual(event);
  });
});
