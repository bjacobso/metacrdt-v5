import { describe, expect, test } from "vitest";
import { fromEvents, valueOf } from "@metacrdt/core";
import {
  applyOperation,
  attachBroadcastTransport,
  createMemoryRuntime,
  exchangeDeltas,
  requireCapability,
  versionVector,
  type BroadcastChannelLike,
} from "./index.js";

class BroadcastBus {
  readonly channels = new Set<FakeBroadcastChannel>();
}

class FakeBroadcastChannel implements BroadcastChannelLike {
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
const many = () => "many" as const;

describe("@metacrdt/runtime BroadcastChannel transport", () => {
  test("publishes local operations to peers and merges through the G-Set path", async () => {
    const bus = new BroadcastBus();
    const left = attachBroadcastTransport(
      createMemoryRuntime({ replicaId: "left", wall: () => 100 }),
      new FakeBroadcastChannel(bus),
      { announceOnStart: false },
    );
    const right = attachBroadcastTransport(
      createMemoryRuntime({ replicaId: "right", wall: () => 100 }),
      new FakeBroadcastChannel(bus),
      { announceOnStart: false },
    );
    await left.transport.start();
    await right.transport.start();
    expect(() => requireCapability(left, "transport")).not.toThrow();

    const event = await applyOperation(left, {
      op: "assert",
      e: "task:1",
      a: "tag",
      v: "left",
      actor: "alice",
    });
    await flush();

    expect(await right.store.get(event.id)).toEqual(event);
    const rightLog = fromEvents(await right.store.scan());
    expect(valueOf("task:1", "tag", coord, rightLog, many)).toEqual(["left"]);
    left.transport.stop();
    right.transport.stop();
  });

  test("hello messages answer with version-vector deltas for catch-up", async () => {
    const bus = new BroadcastBus();
    const left = attachBroadcastTransport(
      createMemoryRuntime({ replicaId: "left", wall: () => 100 }),
      new FakeBroadcastChannel(bus),
      { announceOnStart: false },
    );
    const right = attachBroadcastTransport(
      createMemoryRuntime({ replicaId: "right", wall: () => 100 }),
      new FakeBroadcastChannel(bus),
      { announceOnStart: false },
    );
    await left.transport.start();

    const existing = await applyOperation(left, {
      op: "assert",
      e: "doc:1",
      a: "status",
      v: "ready",
      actor: "alice",
    });
    await flush();

    await right.transport.start();
    await right.transport.announce();
    await flush();

    expect(await right.store.get(existing.id)).toEqual(existing);
    expect(versionVector(await right.store.scan())).toEqual({ left: 1 });

    const second = await exchangeDeltas(left, right);
    expect(second).toMatchObject({
      sentFromA: 0,
      sentFromB: 0,
      insertedIntoA: 0,
      insertedIntoB: 0,
    });
    left.transport.stop();
    right.transport.stop();
  });

  test("ignores other protocol channels and directed deltas for other replicas", async () => {
    const bus = new BroadcastBus();
    const leftChannel = new FakeBroadcastChannel(bus);
    const rightChannel = new FakeBroadcastChannel(bus);
    const left = attachBroadcastTransport(
      createMemoryRuntime({ replicaId: "left", wall: () => 100 }),
      leftChannel,
      { announceOnStart: false, protocol: "suite" },
    );
    const right = attachBroadcastTransport(
      createMemoryRuntime({ replicaId: "right", wall: () => 100 }),
      rightChannel,
      { announceOnStart: false, protocol: "suite" },
    );
    await left.transport.start();
    await right.transport.start();

    const event = await applyOperation(left, {
      op: "assert",
      e: "task:2",
      a: "tag",
      v: "left",
      actor: "alice",
    });
    await flush();
    expect(await right.store.get(event.id)).toEqual(event);

    rightChannel.deliver({
      protocol: "other",
      type: "events",
      from: "intruder",
      events: [
        {
          ...event,
          id: "not-a-real-id",
          e: "task:2",
          v: "wrong",
        },
      ],
    });
    rightChannel.deliver({
      protocol: "suite",
      type: "delta",
      from: "left",
      to: "someone-else",
      since: {},
      events: [
        {
          ...event,
          id: "not-a-real-id",
          e: "task:2",
          v: "wrong",
        },
      ],
    });
    await flush();

    const log = fromEvents(await right.store.scan());
    expect(valueOf("task:2", "tag", coord, log, one)).toBe("left");
    expect(await right.store.scan()).toHaveLength(1);
    left.transport.stop();
    right.transport.stop();
  });
});
