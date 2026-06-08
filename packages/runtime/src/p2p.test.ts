import { describe, expect, test } from "vitest";
import { fromEvents, valueOf } from "@metacrdt/core";
import {
  applyOperation,
  attachPeerDataChannelTransport,
  createMemoryRuntime,
  exchangeDeltas,
  requireCapability,
  versionVector,
  type DataChannelLike,
} from "./index.js";

class FakeDataChannel implements DataChannelLike {
  readyState = "open";
  peer?: FakeDataChannel;
  readonly sent: string[] = [];
  readonly listeners = {
    message: new Set<(event: { data: unknown }) => void>(),
    open: new Set<(event?: unknown) => void>(),
    close: new Set<(event?: unknown) => void>(),
  };
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: ((event?: unknown) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
    if (this.readyState !== "open") throw new Error("channel is not open");
    queueMicrotask(() => this.peer?.deliver(data));
  }

  addEventListener(
    type: "message" | "open" | "close",
    listener:
      | ((event: { data: unknown }) => void)
      | ((event?: unknown) => void),
  ): void {
    if (type === "message") {
      this.listeners.message.add(listener as (event: { data: unknown }) => void);
    } else {
      this.listeners[type].add(listener as (event?: unknown) => void);
    }
  }

  removeEventListener(
    type: "message" | "open" | "close",
    listener:
      | ((event: { data: unknown }) => void)
      | ((event?: unknown) => void),
  ): void {
    if (type === "message") {
      this.listeners.message.delete(listener as (event: { data: unknown }) => void);
    } else {
      this.listeners[type].delete(listener as (event?: unknown) => void);
    }
  }

  deliver(data: unknown): void {
    const event = { data };
    this.onmessage?.(event);
    for (const listener of this.listeners.message) listener(event);
  }

  open(): void {
    this.readyState = "open";
    this.onopen?.();
    for (const listener of this.listeners.open) listener();
  }

  close(): void {
    this.readyState = "closed";
    this.onclose?.();
    for (const listener of this.listeners.close) listener();
  }
}

function pair(): [FakeDataChannel, FakeDataChannel] {
  const a = new FakeDataChannel();
  const b = new FakeDataChannel();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const coord = { txTime: 10_000, validTime: 10_000 };
const one = () => "one" as const;
const many = () => "many" as const;

describe("@metacrdt/runtime p2p DataChannel transport", () => {
  test("publishes local operations over point-to-point channels", async () => {
    const [leftChannel, rightChannel] = pair();
    const left = attachPeerDataChannelTransport(
      createMemoryRuntime({ replicaId: "left", wall: () => 100 }),
      { announceOnStart: false },
    );
    const right = attachPeerDataChannelTransport(
      createMemoryRuntime({ replicaId: "right", wall: () => 100 }),
      { announceOnStart: false },
    );
    left.transport.connect(leftChannel, "right");
    right.transport.connect(rightChannel, "left");
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
    const log = fromEvents(await right.store.scan());
    expect(valueOf("task:1", "tag", coord, log, many)).toEqual(["left"]);
    left.transport.stop();
    right.transport.stop();
  });

  test("hello messages answer with directed version-vector deltas", async () => {
    const [leftChannel, rightChannel] = pair();
    const left = attachPeerDataChannelTransport(
      createMemoryRuntime({ replicaId: "left", wall: () => 200 }),
      { announceOnStart: false },
    );
    const right = attachPeerDataChannelTransport(
      createMemoryRuntime({ replicaId: "right", wall: () => 200 }),
      { announceOnStart: false },
    );
    left.transport.connect(leftChannel, "right");
    right.transport.connect(rightChannel, "left");
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

  test("gossips newly inserted remote events to other connected peers", async () => {
    const [leftToMiddle, middleFromLeft] = pair();
    const [middleToRight, rightFromMiddle] = pair();
    const left = attachPeerDataChannelTransport(
      createMemoryRuntime({ replicaId: "left", wall: () => 300 }),
      { announceOnStart: false },
    );
    const middle = attachPeerDataChannelTransport(
      createMemoryRuntime({ replicaId: "middle", wall: () => 300 }),
      { announceOnStart: false },
    );
    const right = attachPeerDataChannelTransport(
      createMemoryRuntime({ replicaId: "right", wall: () => 300 }),
      { announceOnStart: false },
    );
    left.transport.connect(leftToMiddle, "middle");
    middle.transport.connect(middleFromLeft, "left");
    middle.transport.connect(middleToRight, "right");
    right.transport.connect(rightFromMiddle, "middle");
    await left.transport.start();
    await middle.transport.start();
    await right.transport.start();

    const event = await applyOperation(left, {
      op: "assert",
      e: "thread:1",
      a: "message",
      v: "hello",
      actor: "alice",
    });
    await flush();

    expect(await middle.store.get(event.id)).toEqual(event);
    expect(await right.store.get(event.id)).toEqual(event);
    expect(valueOf("thread:1", "message", coord, fromEvents(await right.store.scan()), one)).toBe(
      "hello",
    );
    left.transport.stop();
    middle.transport.stop();
    right.transport.stop();
  });

  test("filters foreign protocols and directed deltas for other replicas", async () => {
    const [leftChannel, rightChannel] = pair();
    const left = attachPeerDataChannelTransport(
      createMemoryRuntime({ replicaId: "left", wall: () => 400 }),
      { announceOnStart: false, protocol: "suite" },
    );
    const right = attachPeerDataChannelTransport(
      createMemoryRuntime({ replicaId: "right", wall: () => 400 }),
      { announceOnStart: false, protocol: "suite" },
    );
    left.transport.connect(leftChannel, "right");
    right.transport.connect(rightChannel, "left");
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

    rightChannel.deliver(
      JSON.stringify({
        protocol: "other",
        type: "events",
        from: "intruder",
        events: [{ ...event, id: "not-a-real-id", v: "wrong" }],
      }),
    );
    rightChannel.deliver(
      JSON.stringify({
        protocol: "suite",
        type: "delta",
        from: "left",
        to: "someone-else",
        since: {},
        events: [{ ...event, id: "not-a-real-id", v: "wrong" }],
      }),
    );
    await flush();

    const log = fromEvents(await right.store.scan());
    expect(valueOf("task:2", "tag", coord, log, one)).toBe("left");
    expect(await right.store.scan()).toHaveLength(1);
    left.transport.stop();
    right.transport.stop();
  });

  test("disconnects listeners and optionally closes channels on stop", async () => {
    const [leftChannel, rightChannel] = pair();
    const left = attachPeerDataChannelTransport(
      createMemoryRuntime({ replicaId: "left", wall: () => 500 }),
      { announceOnStart: false, closeChannelsOnStop: true },
    );
    const right = attachPeerDataChannelTransport(
      createMemoryRuntime({ replicaId: "right", wall: () => 500 }),
      { announceOnStart: false },
    );
    left.transport.connect(leftChannel, "right");
    right.transport.connect(rightChannel, "left");
    await left.transport.start();
    await right.transport.start();
    expect(left.transport.size).toBe(1);

    left.transport.stop();
    expect(left.transport.size).toBe(0);
    expect(leftChannel.readyState).toBe("closed");

    await applyOperation(right, {
      op: "assert",
      e: "task:3",
      a: "tag",
      v: "right",
      actor: "bob",
    });
    await flush();
    expect(await left.store.scan()).toHaveLength(0);
    right.transport.stop();
  });
});
