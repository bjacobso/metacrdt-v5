import { describe, expect, test } from "vitest";
import {
  DurableObjectSqliteLiveInvalidationFanout,
  publishDurableObjectSqliteLiveInvalidations,
  type DurableObjectSqliteProjectionChange,
  type DurableObjectSqliteLiveServerMessage,
  type WebSocketLike,
} from "./index.js";

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

  messages(): DurableObjectSqliteLiveServerMessage[] {
    return this.sent.map((message) =>
      JSON.parse(message) as DurableObjectSqliteLiveServerMessage
    );
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const statusChange: DurableObjectSqliteProjectionChange = {
  e: "task:1",
  a: "status",
  beforeEventIds: ["event:old"],
  afterEventIds: ["event:new"],
};

const ownerChange: DurableObjectSqliteProjectionChange = {
  e: "task:1",
  a: "owner",
  beforeEventIds: [],
  afterEventIds: ["event:owner"],
};

const otherChange: DurableObjectSqliteProjectionChange = {
  e: "task:2",
  a: "status",
  beforeEventIds: [],
  afterEventIds: ["event:other"],
};

describe("@metacrdt/cloudflare SQLite live invalidation fanout", () => {
  test("publishes projection changes only to matching coordinate subscriptions", async () => {
    const fanout = new DurableObjectSqliteLiveInvalidationFanout({ from: "do:room" });
    const statusSocket = new FakeSocket();
    const entitySocket = new FakeSocket();
    fanout.connect(statusSocket, "status-client");
    fanout.connect(entitySocket, "entity-client");

    await fanout.subscribe("status-client", { e: "task:1", a: "status" }, "sub:status");
    await fanout.subscribe("entity-client", { e: "task:1" }, "sub:entity");
    expect(fanout.size).toBe(2);
    expect(fanout.subscriptionCount).toBe(2);

    const result = await publishDurableObjectSqliteLiveInvalidations(fanout, [
      statusChange,
      ownerChange,
      otherChange,
    ]);
    expect(result).toEqual({
      changed: [statusChange, ownerChange, otherChange],
      delivered: 2,
      subscriptions: ["sub:entity", "sub:status"],
    });

    expect(statusSocket.messages()).toEqual([
      {
        protocol: "metacrdt.cloudflare.sqlite.live.v1",
        type: "subscribed",
        id: "sub:status",
        filter: { e: "task:1", a: "status" },
      },
      {
        protocol: "metacrdt.cloudflare.sqlite.live.v1",
        type: "invalidate",
        from: "do:room",
        subscriptions: ["sub:status"],
        changed: [statusChange],
      },
    ]);
    expect(entitySocket.messages()).toEqual([
      {
        protocol: "metacrdt.cloudflare.sqlite.live.v1",
        type: "subscribed",
        id: "sub:entity",
        filter: { e: "task:1" },
      },
      {
        protocol: "metacrdt.cloudflare.sqlite.live.v1",
        type: "invalidate",
        from: "do:room",
        subscriptions: ["sub:entity"],
        changed: [ownerChange, statusChange],
      },
    ]);
  });

  test("handles socket subscribe and unsubscribe messages", async () => {
    const fanout = new DurableObjectSqliteLiveInvalidationFanout({
      from: "do:room",
      protocol: "live.test",
    });
    const socket = new FakeSocket();
    fanout.connect(socket, "client:1");

    socket.receive(
      JSON.stringify({
        protocol: "live.test",
        type: "subscribe",
        id: "sub:status",
        a: "status",
      }),
    );
    await flush();
    expect(socket.messages()).toEqual([
      {
        protocol: "live.test",
        type: "subscribed",
        id: "sub:status",
        filter: { a: "status" },
      },
    ]);

    await fanout.publishChanges([statusChange, ownerChange]);
    expect(socket.messages()[1]).toEqual({
      protocol: "live.test",
      type: "invalidate",
      from: "do:room",
      subscriptions: ["sub:status"],
      changed: [statusChange],
    });

    socket.receive(
      JSON.stringify({
        protocol: "live.test",
        type: "unsubscribe",
        id: "sub:status",
      }),
    );
    await flush();
    expect(socket.messages()[2]).toEqual({
      protocol: "live.test",
      type: "unsubscribed",
      id: "sub:status",
    });

    await fanout.publishChanges([otherChange]);
    expect(socket.messages()).toHaveLength(3);
  });

  test("rejects unbounded subscriptions and closes malformed live messages", async () => {
    const fanout = new DurableObjectSqliteLiveInvalidationFanout({ from: "do:room" });
    const socket = new FakeSocket();
    fanout.connect(socket, "client:1");

    await expect(
      fanout.subscribe("client:1", {}, "sub:all"),
    ).rejects.toThrow(/requires e or a/);

    socket.receive("not-json");
    await flush();
    expect(socket.closed).toEqual({ code: 1003, reason: "invalid json" });
    expect(fanout.size).toBe(0);

    const second = new FakeSocket();
    fanout.connect(second, "client:2");
    second.receive(
      JSON.stringify({
        protocol: fanout.protocol,
        type: "subscribe",
        id: "sub:bad",
      }),
    );
    await flush();
    expect(second.closed).toEqual({
      code: 1003,
      reason: "invalid live subscription",
    });
    expect(fanout.subscriptionCount).toBe(0);
  });

  test("does not publish empty or unmatched change sets", async () => {
    const fanout = new DurableObjectSqliteLiveInvalidationFanout({ from: "do:room" });
    const socket = new FakeSocket();
    fanout.connect(socket, "client:1");
    await fanout.subscribe("client:1", { e: "task:missing" }, "sub:missing");

    await expect(fanout.publishChanges([])).resolves.toEqual({
      changed: [],
      delivered: 0,
      subscriptions: [],
    });
    await expect(fanout.publishChanges([statusChange])).resolves.toEqual({
      changed: [statusChange],
      delivered: 0,
      subscriptions: [],
    });
    expect(socket.messages()).toEqual([
      {
        protocol: "metacrdt.cloudflare.sqlite.live.v1",
        type: "subscribed",
        id: "sub:missing",
        filter: { e: "task:missing" },
      },
    ]);
  });
});
