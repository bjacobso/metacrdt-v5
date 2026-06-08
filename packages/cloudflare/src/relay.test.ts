import { describe, expect, test } from "vitest";
import { fromEvents, valueOf } from "@metacrdt/core";
import {
  applyOperation,
  requireCapability,
  versionVector,
  type BroadcastMessage,
} from "@metacrdt/runtime";
import {
  attachDurableObjectRelay,
  createDurableObjectRuntime,
  type DurableObjectStorageLike,
  type WebSocketLike,
} from "./index.js";

class FakeStorage implements DurableObjectStorageLike {
  readonly data = new Map<string, unknown>();

  async get<T = unknown>(key: string): Promise<T | undefined> {
    return this.data.get(key) as T | undefined;
  }

  async put<T = unknown>(key: string, value: T): Promise<void> {
    this.data.set(key, value);
  }
}

class FakeSocket implements WebSocketLike {
  accepted = false;
  closed: { code?: number; reason?: string } | undefined;
  readonly sent: string[] = [];
  readonly messageListeners = new Set<(event: { data: unknown }) => void>();
  readonly closeListeners = new Set<(event: { code?: number; reason?: string }) => void>();
  readonly errorListeners = new Set<(event: { code?: number; reason?: string }) => void>();

  accept(): void {
    this.accepted = true;
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    this.closed = { code, reason };
  }

  addEventListener(
    type: "message" | "close" | "error",
    listener:
      | ((event: { data: unknown }) => void)
      | ((event: { code?: number; reason?: string }) => void),
  ): void {
    if (type === "message") {
      this.messageListeners.add(listener as (event: { data: unknown }) => void);
    } else if (type === "close") {
      this.closeListeners.add(listener as (event: { code?: number; reason?: string }) => void);
    } else {
      this.errorListeners.add(listener as (event: { code?: number; reason?: string }) => void);
    }
  }

  removeEventListener(
    type: "message" | "close" | "error",
    listener:
      | ((event: { data: unknown }) => void)
      | ((event: { code?: number; reason?: string }) => void),
  ): void {
    if (type === "message") {
      this.messageListeners.delete(listener as (event: { data: unknown }) => void);
    } else if (type === "close") {
      this.closeListeners.delete(listener as (event: { code?: number; reason?: string }) => void);
    } else {
      this.errorListeners.delete(listener as (event: { code?: number; reason?: string }) => void);
    }
  }

  receive(message: unknown): void {
    for (const listener of this.messageListeners) listener({ data: message });
  }

  messages(): BroadcastMessage[] {
    return this.sent.map((m) => JSON.parse(m) as BroadcastMessage);
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const coord = { txTime: 10_000, validTime: 10_000 };
const many = () => "many" as const;

describe("@metacrdt/cloudflare Durable Object WebSocket relay", () => {
  test("accepts sockets, announces version vectors, and publishes local operations", async () => {
    const runtime = attachDurableObjectRelay(
      await createDurableObjectRuntime({
        storage: new FakeStorage(),
        namespace: "room",
        replicaId: "do:room",
        wall: () => 100,
      }),
    );
    expect(() => requireCapability(runtime, "transport")).not.toThrow();
    const socket = new FakeSocket();

    runtime.transport.connect(socket, "client:1");
    await flush();
    expect(socket.accepted).toBe(true);
    expect(socket.messages()[0]).toMatchObject({
      protocol: "metacrdt.cloudflare.relay.v1",
      type: "hello",
      from: "do:room",
      vv: {},
    });

    const event = await applyOperation(runtime, {
      op: "assert",
      e: "task:1",
      a: "tag",
      v: "server",
      actor: "system",
      actorType: "system",
    });
    await flush();

    const messages = socket.messages();
    expect(messages[messages.length - 1]).toMatchObject({
      type: "events",
      from: "do:room",
      events: [{ id: event.id, seq: 1, e: "task:1", a: "tag", v: "server" }],
    });
  });

  test("answers client hello with deltas and then remains idempotent", async () => {
    const runtime = attachDurableObjectRelay(
      await createDurableObjectRuntime({
        storage: new FakeStorage(),
        namespace: "room",
        replicaId: "do:room",
        wall: () => 100,
      }),
      { announceOnConnect: false },
    );
    const event = await applyOperation(runtime, {
      op: "assert",
      e: "doc:1",
      a: "status",
      v: "ready",
      actor: "system",
      actorType: "system",
    });
    const socket = new FakeSocket();
    runtime.transport.connect(socket, "client:1");

    socket.receive(
      JSON.stringify({
        protocol: runtime.transport.protocol,
        type: "hello",
        from: "client:replica",
        vv: {},
      }),
    );
    await flush();
    expect(socket.messages()).toMatchObject([
      {
        protocol: runtime.transport.protocol,
        type: "delta",
        from: "do:room",
        to: "client:replica",
        since: {},
        events: [{ id: event.id, seq: 1, e: "doc:1", a: "status", v: "ready" }],
      },
    ]);

    socket.receive(
      JSON.stringify({
        protocol: runtime.transport.protocol,
        type: "hello",
        from: "client:replica",
        vv: versionVector(await runtime.store.scan()),
      }),
    );
    await flush();
    expect(socket.messages()).toHaveLength(1);
  });

  test("merges client events and fans out to other sockets", async () => {
    const runtime = attachDurableObjectRelay(
      await createDurableObjectRuntime({
        storage: new FakeStorage(),
        namespace: "room",
        replicaId: "do:room",
        wall: () => 100,
      }),
      { announceOnConnect: false },
    );
    const sender = new FakeSocket();
    const observer = new FakeSocket();
    runtime.transport.connect(sender, "sender");
    runtime.transport.connect(observer, "observer");

    const clientRuntime = await createDurableObjectRuntime({
      storage: new FakeStorage(),
      namespace: "client",
      replicaId: "client:replica",
      wall: () => 100,
    });
    const event = await applyOperation(clientRuntime, {
      op: "assert",
      e: "task:1",
      a: "tag",
      v: "client",
      actor: "alice",
    });

    sender.receive(
      JSON.stringify({
        protocol: runtime.transport.protocol,
        type: "events",
        from: "client:replica",
        events: [event],
      }),
    );
    await flush();

    expect(await runtime.store.get(event.id)).toEqual(event);
    const log = fromEvents(await runtime.store.scan());
    expect(valueOf("task:1", "tag", coord, log, many)).toEqual(["client"]);
    expect(sender.messages()).toEqual([]);
    expect(observer.messages()).toEqual([
      {
        protocol: runtime.transport.protocol,
        type: "events",
        from: "client:replica",
        events: [event],
      },
    ]);
  });

  test("ignores foreign protocol messages and closes invalid JSON", async () => {
    const runtime = attachDurableObjectRelay(
      await createDurableObjectRuntime({
        storage: new FakeStorage(),
        namespace: "room",
        replicaId: "do:room",
        wall: () => 100,
      }),
      { announceOnConnect: false },
    );
    const socket = new FakeSocket();
    runtime.transport.connect(socket, "client:1");

    socket.receive(
      JSON.stringify({
        protocol: "other",
        type: "events",
        from: "client:replica",
        events: [{ id: "bad" }],
      }),
    );
    await flush();
    expect(await runtime.store.scan()).toEqual([]);

    socket.receive("{not json");
    await flush();
    expect(socket.closed).toEqual({ code: 1003, reason: "invalid json" });
    expect(runtime.transport.size).toBe(0);
  });
});
