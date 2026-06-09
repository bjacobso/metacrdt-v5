import { describe, expect, test } from "vitest";
import { fromEvents, valueOf } from "@metacrdt/core";
import {
  EventStoreService,
  applyOperation,
  applyOperationEffect,
  versionVector,
} from "@metacrdt/runtime";
import { Effect } from "effect";
import {
  createAsyncLocalRuntime,
  createAsyncLocalRuntimeLayer,
  createIndexedDbLocalFirstRuntime,
  createIndexedDbLocalFirstRuntimeLayer,
  indexedDbStorage,
  startIndexedDbLocalFirstRuntime,
  type AsyncLocalRuntimeStorage,
  type BrowserBroadcastChannelLike,
} from "./index.js";

class AsyncMemoryStorage implements AsyncLocalRuntimeStorage {
  readonly data = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.data.delete(key);
  }
}

class BroadcastBus {
  readonly channels = new Set<FakeBroadcastChannel>();
}

class FakeBroadcastChannel implements BrowserBroadcastChannelLike {
  readonly listeners = new Set<(event: { data: unknown }) => void>();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  closed = false;

  constructor(private readonly bus: BroadcastBus) {
    bus.channels.add(this);
  }

  postMessage(message: unknown): void {
    for (const channel of this.bus.channels) {
      if (channel === this || channel.closed) continue;
      queueMicrotask(() => channel.deliver(message));
    }
  }

  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void {
    if (type === "message") this.listeners.add(listener);
  }

  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void {
    if (type === "message") this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.bus.channels.delete(this);
  }

  deliver(data: unknown): void {
    const event = { data };
    this.onmessage?.(event);
    for (const listener of this.listeners) listener(event);
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const coord = { txTime: 10_000, validTime: 10_000 };
const one = () => "one" as const;

const asyncLayerProgram = Effect.gen(function* () {
  const event = yield* applyOperationEffect({
    op: "assert",
    e: "async:layer",
    a: "status",
    v: "ready",
    actor: "test",
    actorType: "system",
  });
  const store = yield* EventStoreService;
  return { event, stored: yield* store.get(event.id), events: yield* store.scan() };
});

describe("@metacrdt/local async local runtime", () => {
  test("async local runtime provides an Effect Layer", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        asyncLayerProgram,
        createAsyncLocalRuntimeLayer({
          storage: new AsyncMemoryStorage(),
          namespace: "async-layer",
          replicaId: "browser:async-layer",
          wall: () => 850,
        }),
      ),
    );
    expect(result.stored).toEqual(result.event);
    expect(result.event.seq).toBe(1);
    expect(versionVector(result.events)).toEqual({ "browser:async-layer": 1 });
  });

  test("IndexedDB local-first runtime provides an Effect Layer", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        asyncLayerProgram,
        createIndexedDbLocalFirstRuntimeLayer({
          storage: new AsyncMemoryStorage(),
          namespace: "idb-layer",
          replicaId: "browser:idb-layer",
          wall: () => 875,
          broadcast: false,
        }),
      ),
    );
    expect(result.stored).toEqual(result.event);
    expect(result.event.seq).toBe(1);
    expect(versionVector(result.events)).toEqual({ "browser:idb-layer": 1 });
  });

  test("persists event log, HLC, and seq over async storage", async () => {
    const storage = new AsyncMemoryStorage();
    const first = await createAsyncLocalRuntime({
      storage,
      namespace: "async",
      replicaId: "browser:async",
      wall: () => 900,
    });

    const active = await applyOperation(first, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });
    expect(active.seq).toBe(1);

    const second = await createAsyncLocalRuntime({
      storage,
      namespace: "async",
      replicaId: "browser:async",
      wall: () => 900,
    });
    expect(second.clock.current()).toEqual({ pt: 900, l: 0, r: "browser:async" });
    expect(second.sequencer.current()).toBe(1);
    expect(await second.store.get(active.id)).toEqual(active);

    const terminated = await applyOperation(second, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "terminated",
      actor: "user:1",
    });
    expect(terminated.seq).toBe(2);
    expect(terminated.hlc).toEqual({ pt: 900, l: 1, r: "browser:async" });

    const third = await createAsyncLocalRuntime({
      storage,
      namespace: "async",
      replicaId: "browser:async",
      wall: () => 900,
    });
    const log = fromEvents(await third.store.scan());
    expect(valueOf("worker:maria", "worker.status", coord, log, one)).toBe(
      "terminated",
    );
    expect(versionVector(await third.store.scan())).toEqual({
      "browser:async": 2,
    });
  });

  test("IndexedDB local-first runtime composes async storage with BroadcastChannel", async () => {
    const bus = new BroadcastBus();
    const leftStorage = new AsyncMemoryStorage();
    const rightStorage = new AsyncMemoryStorage();
    const left = await startIndexedDbLocalFirstRuntime({
      storage: leftStorage,
      channel: new FakeBroadcastChannel(bus),
      namespace: "idb",
      replicaId: "browser:left",
      wall: () => 1_000,
      announceOnStart: false,
    });
    const right = await startIndexedDbLocalFirstRuntime({
      storage: rightStorage,
      channel: new FakeBroadcastChannel(bus),
      namespace: "idb",
      replicaId: "browser:right",
      wall: () => 1_000,
      announceOnStart: false,
    });

    const event = await applyOperation(left, {
      op: "assert",
      e: "task:1",
      a: "status",
      v: "ready",
      actor: "alice",
    });
    await flush();

    expect(left.profile.capabilities.has("transport")).toBe(true);
    expect(await right.store.get(event.id)).toEqual(event);
    expect(versionVector(await right.store.scan())).toEqual({ "browser:left": 1 });
    left.stop();
    right.stop();
  });

  test("late IndexedDB local-first replica catches up by hello/delta", async () => {
    const bus = new BroadcastBus();
    const left = await startIndexedDbLocalFirstRuntime({
      storage: new AsyncMemoryStorage(),
      channel: new FakeBroadcastChannel(bus),
      namespace: "catchup",
      replicaId: "browser:left",
      wall: () => 1_100,
      announceOnStart: false,
    });

    const existing = await applyOperation(left, {
      op: "assert",
      e: "doc:1",
      a: "status",
      v: "ready",
      actor: "alice",
    });
    await flush();

    const right = await startIndexedDbLocalFirstRuntime({
      storage: new AsyncMemoryStorage(),
      channel: new FakeBroadcastChannel(bus),
      namespace: "catchup",
      replicaId: "browser:right",
      wall: () => 1_100,
      announceOnStart: true,
    });
    await flush();

    expect(await right.store.get(existing.id)).toEqual(existing);
    left.stop();
    right.stop();
  });

  test("broadcast:false works over async storage without a channel", async () => {
    const storage = new AsyncMemoryStorage();
    const runtime = await createIndexedDbLocalFirstRuntime({
      storage,
      namespace: "solo-idb",
      replicaId: "browser:solo",
      wall: () => 1_200,
      broadcast: false,
    });

    expect(runtime.transport).toBeUndefined();
    const active = await applyOperation(runtime, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });
    runtime.stop();

    const restarted = await createIndexedDbLocalFirstRuntime({
      storage,
      namespace: "solo-idb",
      replicaId: "browser:solo",
      wall: () => 1_200,
      broadcast: false,
    });
    expect(await restarted.store.get(active.id)).toEqual(active);
    expect(restarted.sequencer.current()).toBe(1);
  });

  test("IndexedDB helper fails clearly when the host has no indexedDB", async () => {
    if (typeof globalThis.indexedDB === "undefined") {
      await expect(indexedDbStorage()).rejects.toThrow(/indexedDB/);
    }
  });
});
