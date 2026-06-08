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
  browserBroadcastChannel,
  browserStorage,
  createLocalFirstRuntime,
  createLocalFirstRuntimeLayer,
  startLocalFirstRuntime,
  type BrowserBroadcastChannelLike,
  type BrowserStorageLike,
} from "./index.js";

class FakeStorage implements BrowserStorageLike {
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
const many = () => "many" as const;
const one = () => "one" as const;

const localLayerProgram = Effect.gen(function* () {
  const event = yield* applyOperationEffect({
    op: "assert",
    e: "local:layer",
    a: "status",
    v: "ready",
    actor: "test",
    actorType: "system",
  });
  const store = yield* EventStoreService;
  return { event, stored: yield* store.get(event.id), events: yield* store.scan() };
});

describe("@metacrdt/local browser/local-first target", () => {
  test("local-first runtime provides an Effect Layer", async () => {
    const result = await Effect.runPromise(
      Effect.provide(
        localLayerProgram,
        createLocalFirstRuntimeLayer({
          storage: new FakeStorage(),
          namespace: "layer",
          replicaId: "browser:layer",
          wall: () => 450,
          broadcast: false,
        }),
      ),
    );
    expect(result.stored).toEqual(result.event);
    expect(result.event.seq).toBe(1);
    expect(versionVector(result.events)).toEqual({ "browser:layer": 1 });
  });

  test("composes localStorage persistence with BroadcastChannel convergence", async () => {
    const bus = new BroadcastBus();
    const leftStorage = new FakeStorage();
    const rightStorage = new FakeStorage();
    const left = await startLocalFirstRuntime({
      storage: leftStorage,
      channel: new FakeBroadcastChannel(bus),
      namespace: "suite",
      replicaId: "browser:left",
      wall: () => 500,
      announceOnStart: false,
    });
    const right = await startLocalFirstRuntime({
      storage: rightStorage,
      channel: new FakeBroadcastChannel(bus),
      namespace: "suite",
      replicaId: "browser:right",
      wall: () => 500,
      announceOnStart: false,
    });

    expect(left.profile.capabilities.has("transport")).toBe(true);
    const event = await applyOperation(left, {
      op: "assert",
      e: "task:1",
      a: "tag",
      v: "left",
      actor: "alice",
    });
    await flush();

    expect(event.seq).toBe(1);
    expect(await right.store.get(event.id)).toEqual(event);
    expect(versionVector(await right.store.scan())).toEqual({ "browser:left": 1 });

    left.stop();
    right.stop();

    const restartedRight = createLocalFirstRuntime({
      storage: rightStorage,
      channel: new FakeBroadcastChannel(bus),
      namespace: "suite",
      replicaId: "browser:right",
      wall: () => 500,
      announceOnStart: false,
    });
    const log = fromEvents(await restartedRight.store.scan());
    expect(valueOf("task:1", "tag", coord, log, many)).toEqual(["left"]);
    restartedRight.stop();
  });

  test("hello catch-up converges peers after one replica starts later", async () => {
    const bus = new BroadcastBus();
    const left = await startLocalFirstRuntime({
      storage: new FakeStorage(),
      channel: new FakeBroadcastChannel(bus),
      namespace: "late",
      replicaId: "browser:left",
      wall: () => 600,
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

    const right = await startLocalFirstRuntime({
      storage: new FakeStorage(),
      channel: new FakeBroadcastChannel(bus),
      namespace: "late",
      replicaId: "browser:right",
      wall: () => 600,
      announceOnStart: true,
    });
    await flush();

    expect(await right.store.get(existing.id)).toEqual(existing);
    left.stop();
    right.stop();
  });

  test("broadcast:false remains a durable local runtime without transport", async () => {
    const storage = new FakeStorage();
    const runtime = await startLocalFirstRuntime({
      storage,
      namespace: "solo",
      replicaId: "browser:solo",
      wall: () => 700,
      broadcast: false,
    });

    expect(runtime.transport).toBeUndefined();
    expect(runtime.profile.capabilities.has("transport")).toBe(false);
    const active = await applyOperation(runtime, {
      op: "assert",
      e: "worker:maria",
      a: "worker.status",
      v: "active",
      actor: "user:1",
    });
    runtime.stop();

    const restarted = createLocalFirstRuntime({
      storage,
      namespace: "solo",
      replicaId: "browser:solo",
      wall: () => 700,
      broadcast: false,
    });
    expect(await restarted.store.get(active.id)).toEqual(active);
    expect(restarted.sequencer.current()).toBe(1);
    const log = fromEvents(await restarted.store.scan());
    expect(valueOf("worker:maria", "worker.status", coord, log, one)).toBe(
      "active",
    );
  });

  test("default browser helpers handle host globals explicitly", () => {
    expect(() => browserStorage()).toThrow(/localStorage/);
    if (typeof globalThis.BroadcastChannel === "undefined") {
      expect(() => browserBroadcastChannel("suite")).toThrow(/BroadcastChannel/);
    } else {
      const channel = browserBroadcastChannel("suite");
      expect(typeof channel.postMessage).toBe("function");
      channel.close?.();
    }
  });
});
