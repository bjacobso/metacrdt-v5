import { describe, expect, test } from "vitest";
import { fromEvents, valueOf } from "@metacrdt/core";
import {
  EventStoreService,
  applyOperation,
  applyOperationEffect,
  exchangeDeltas,
  versionVector,
} from "@metacrdt/runtime";
import { Effect } from "effect";
import {
  createDurableObjectRuntime,
  createDurableObjectRuntimeLayer,
  type DurableObjectStorageLike,
} from "./index.js";

class FakeDurableObjectStorage implements DurableObjectStorageLike {
  readonly data = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put<T = unknown>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }

  async delete(key: string): Promise<boolean> {
    return this.data.delete(key);
  }
}

const coord = { txTime: 10_000, validTime: 10_000 };
const one = () => "one" as const;
const many = () => "many" as const;

describe("@metacrdt/cloudflare Durable Object runtime", () => {
  test("Durable Object runtime provides an Effect Layer", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        Effect.gen(function* () {
          const event = yield* applyOperationEffect({
            op: "assert",
            e: "do:layer",
            a: "status",
            v: "ready",
            actor: "test",
            actorType: "system",
          });
          const store = yield* EventStoreService;
          return {
            event,
            stored: yield* store.get(event.id),
            events: yield* store.scan(),
          };
        }),
        createDurableObjectRuntimeLayer({
          storage: new FakeDurableObjectStorage(),
          namespace: "layer",
          replicaId: "do:layer",
          wall: () => 50,
        }),
      ),
    );
    expect(result.stored).toEqual(result.event);
    expect(result.event.seq).toBe(1);
    expect(versionVector(result.events)).toEqual({ "do:layer": 1 });
  });

  test("persists event log, HLC, and per-replica sequence across runtime recreation", async () => {
    const storage = new FakeDurableObjectStorage();
    let wall = 100;
    const first = await createDurableObjectRuntime({
      storage,
      namespace: "room",
      replicaId: "do:room",
      wall: () => wall,
    });

    const active = await applyOperation(first, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });
    expect(active.hlc).toEqual({ pt: 100, l: 0, r: "do:room" });
    expect(active.seq).toBe(1);

    wall = 100;
    const second = await createDurableObjectRuntime({
      storage,
      namespace: "room",
      replicaId: "do:room",
      wall: () => wall,
    });
    expect(second.clock.current()).toEqual({ pt: 100, l: 0, r: "do:room" });
    expect(second.sequencer.current()).toBe(1);

    const terminated = await applyOperation(second, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "terminated",
      actor: "user:1",
    });
    expect(terminated.hlc).toEqual({ pt: 100, l: 1, r: "do:room" });
    expect(terminated.seq).toBe(2);

    const third = await createDurableObjectRuntime({
      storage,
      namespace: "room",
      replicaId: "do:room",
      wall: () => 100,
    });
    const log = fromEvents(await third.store.scan());
    expect(valueOf("worker:maria", "worker.status", coord, log, one)).toBe(
      "terminated",
    );
    expect(versionVector(await third.store.scan())).toEqual({ "do:room": 2 });
  });

  test("two Durable Object runtimes exchange deltas and persist convergence", async () => {
    const leftStorage = new FakeDurableObjectStorage();
    const rightStorage = new FakeDurableObjectStorage();
    const left = await createDurableObjectRuntime({
      storage: leftStorage,
      namespace: "left",
      replicaId: "do:left",
      wall: () => 200,
    });
    const right = await createDurableObjectRuntime({
      storage: rightStorage,
      namespace: "right",
      replicaId: "do:right",
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
      vvA: { "do:left": 1, "do:right": 1 },
      vvB: { "do:left": 1, "do:right": 1 },
    });

    const restartedLeft = await createDurableObjectRuntime({
      storage: leftStorage,
      namespace: "left",
      replicaId: "do:left",
      wall: () => 200,
    });
    const restartedRight = await createDurableObjectRuntime({
      storage: rightStorage,
      namespace: "right",
      replicaId: "do:right",
      wall: () => 200,
    });
    const leftLog = fromEvents(await restartedLeft.store.scan());
    const rightLog = fromEvents(await restartedRight.store.scan());
    expect([...leftLog.keys()].sort()).toEqual([...rightLog.keys()].sort());
    expect(
      (valueOf("task:1", "tag", coord, leftLog, many) as string[]).sort(),
    ).toEqual(["left", "right"]);
    expect(
      (valueOf("task:1", "tag", coord, rightLog, many) as string[]).sort(),
    ).toEqual(["left", "right"]);

    const second = await exchangeDeltas(restartedLeft, restartedRight);
    expect(second).toMatchObject({
      sentFromA: 0,
      sentFromB: 0,
      insertedIntoA: 0,
      insertedIntoB: 0,
    });
  });

  test("loads only verified stored events", async () => {
    const storage = new FakeDurableObjectStorage();
    const runtime = await createDurableObjectRuntime({
      storage,
      namespace: "verify",
      replicaId: "do:verify",
      wall: () => 300,
    });
    const event = await applyOperation(runtime, {
      op: "assert",
      e: "doc:1",
      a: "status",
      v: "ready",
      actor: "user:1",
    });
    await storage.put("verify:event:bad", { ...event, id: "bad" });
    await storage.put("verify:events:index", [event.id, "bad"]);

    const restarted = await createDurableObjectRuntime({
      storage,
      namespace: "verify",
      replicaId: "do:verify",
      wall: () => 300,
    });
    await expect(restarted.store.scan()).rejects.toThrow(/invalid stored event id/);
  });
});
