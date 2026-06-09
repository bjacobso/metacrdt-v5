import { describe, expect, test } from "vitest";
import {
  DurableObjectSqliteLiveCurrentQueryFanout,
  DurableObjectSqliteLiveInvalidationFanout,
  createDurableObjectSqliteRuntime,
  createDurableObjectSqliteLiveQueryClient,
  durableObjectSqliteLiveQueryDependencies,
  publishDurableObjectSqliteLiveCurrentQueryChanges,
  publishDurableObjectSqliteLiveInvalidations,
  type DurableObjectSqliteLiveQueryClientSocket,
  type DurableObjectSqliteProjectionChange,
  type DurableObjectSqliteLiveQueryServerMessage,
  type DurableObjectSqliteLiveServerMessage,
  type WebSocketLike,
} from "./index.js";
import type {
  DatalogQueryArgsType,
  DatalogQueryResult,
} from "@metacrdt/runtime";
import { FakeDurableObjectSqlStorage } from "./sqliteFake.test-support.js";

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

  queryMessages(): DurableObjectSqliteLiveQueryServerMessage[] {
    return this.sent.map((message) =>
      JSON.parse(message) as DurableObjectSqliteLiveQueryServerMessage
    );
  }
}

class FakeClientWebSocket implements DurableObjectSqliteLiveQueryClientSocket {
  static instances: FakeClientWebSocket[] = [];

  readonly url: string;
  readyState = 0;
  readonly sent: string[] = [];
  readonly openListeners = new Set<(event: Record<string, unknown>) => void>();
  readonly messageListeners = new Set<(event: { data: unknown }) => void>();
  readonly closeListeners = new Set<(event: { code?: number; reason?: string }) => void>();
  readonly errorListeners = new Set<(event: { code?: number; reason?: string }) => void>();

  constructor(url: string) {
    this.url = url;
    FakeClientWebSocket.instances.push(this);
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    for (const listener of this.closeListeners) listener({ code, reason });
  }

  addEventListener(
    type: "open" | "message" | "close" | "error",
    listener:
      | ((event: Record<string, unknown>) => void)
      | ((event: { data: unknown }) => void)
      | ((event: { code?: number; reason?: string }) => void),
  ): void {
    if (type === "open") {
      this.openListeners.add(listener as (event: Record<string, unknown>) => void);
    } else if (type === "message") {
      this.messageListeners.add(listener as (event: { data: unknown }) => void);
    } else if (type === "close") {
      this.closeListeners.add(listener as (event: { code?: number; reason?: string }) => void);
    } else {
      this.errorListeners.add(listener as (event: { code?: number; reason?: string }) => void);
    }
  }

  removeEventListener(
    type: "open" | "message" | "close" | "error",
    listener:
      | ((event: Record<string, unknown>) => void)
      | ((event: { data: unknown }) => void)
      | ((event: { code?: number; reason?: string }) => void),
  ): void {
    if (type === "open") {
      this.openListeners.delete(listener as (event: Record<string, unknown>) => void);
    } else if (type === "message") {
      this.messageListeners.delete(listener as (event: { data: unknown }) => void);
    } else if (type === "close") {
      this.closeListeners.delete(listener as (event: { code?: number; reason?: string }) => void);
    } else {
      this.errorListeners.delete(listener as (event: { code?: number; reason?: string }) => void);
    }
  }

  open(): void {
    this.readyState = 1;
    for (const listener of this.openListeners) listener({});
  }

  receive(message: unknown): void {
    for (const listener of this.messageListeners) listener({ data: message });
  }

  messages(): unknown[] {
    return this.sent.map((message) => JSON.parse(message) as unknown);
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

async function flushTimers(): Promise<void> {
  await flush();
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

const liveQueryArgs: DatalogQueryArgsType = {
  where: [["task:1", "status", "?status"]],
  select: ["?status"],
  coord: { txTime: 10, validTime: 10 },
};

function queryResult(status: string): DatalogQueryResult {
  return {
    states: [],
    rows: [{ status }],
    eventSourceIds: [`event:${status}`],
  };
}

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

  test("subscribes current queries and refreshes on matching changes", async () => {
    const calls: DatalogQueryArgsType[] = [];
    const fanout = new DurableObjectSqliteLiveCurrentQueryFanout({
      from: "do:room",
      queryCurrent: async (args) => {
        calls.push(args);
        return queryResult(`run-${calls.length}`);
      },
    });
    const socket = new FakeSocket();
    fanout.connect(socket, "client:1");

    await fanout.subscribeQuery("client:1", liveQueryArgs, "query:status");
    expect(calls).toHaveLength(1);
    expect(socket.queryMessages()).toEqual([
      {
        protocol: "metacrdt.cloudflare.sqlite.live-query.v1",
        type: "query.subscribed",
        from: "do:room",
        id: "query:status",
        dependencies: [{ e: "task:1", a: "status" }],
        result: queryResult("run-1"),
      },
    ]);

    await expect(
      publishDurableObjectSqliteLiveCurrentQueryChanges(fanout, [ownerChange]),
    ).resolves.toEqual({
      changed: [ownerChange],
      delivered: 0,
      subscriptions: [],
    });
    expect(socket.queryMessages()).toHaveLength(1);
    expect(calls).toHaveLength(1);

    await expect(
      publishDurableObjectSqliteLiveCurrentQueryChanges(fanout, [
        otherChange,
        statusChange,
      ]),
    ).resolves.toEqual({
      changed: [otherChange, statusChange],
      delivered: 1,
      subscriptions: ["query:status"],
    });
    expect(calls).toHaveLength(2);
    expect(socket.queryMessages()[1]).toEqual({
      protocol: "metacrdt.cloudflare.sqlite.live-query.v1",
      type: "query.updated",
      from: "do:room",
      id: "query:status",
      changed: [statusChange],
      result: queryResult("run-2"),
    });
  });

  test("handles socket current-query subscribe and unsubscribe messages", async () => {
    let runs = 0;
    const fanout = new DurableObjectSqliteLiveCurrentQueryFanout({
      from: "do:room",
      protocol: "live-query.test",
      queryCurrent: async () => queryResult(`socket-${++runs}`),
    });
    const socket = new FakeSocket();
    fanout.connect(socket, "client:1");

    socket.receive(
      JSON.stringify({
        protocol: "live-query.test",
        type: "query.subscribe",
        id: "query:open",
        query: {
          where: [["?task", "status", "open"]],
          select: ["?task"],
          coord: { txTime: 10, validTime: 10 },
        },
      }),
    );
    await flush();
    expect(socket.queryMessages()).toEqual([
      {
        protocol: "live-query.test",
        type: "query.subscribed",
        from: "do:room",
        id: "query:open",
        dependencies: [{ a: "status" }],
        result: queryResult("socket-1"),
      },
    ]);

    await fanout.publishChanges([statusChange]);
    expect(socket.queryMessages()[1]).toEqual({
      protocol: "live-query.test",
      type: "query.updated",
      from: "do:room",
      id: "query:open",
      changed: [statusChange],
      result: queryResult("socket-2"),
    });

    socket.receive(
      JSON.stringify({
        protocol: "live-query.test",
        type: "query.unsubscribe",
        id: "query:open",
      }),
    );
    await flush();
    expect(socket.queryMessages()[2]).toEqual({
      protocol: "live-query.test",
      type: "query.unsubscribed",
      from: "do:room",
      id: "query:open",
    });

    await fanout.publishChanges([statusChange]);
    expect(socket.queryMessages()).toHaveLength(3);
  });

  test("optionally persists current-query subscriptions through the SQLite registry", async () => {
    const runtime = await createDurableObjectSqliteRuntime({
      sql: new FakeDurableObjectSqlStorage(),
      replicaId: "do-sqlite:live-query-persist",
      wall: () => 700,
    });
    const fanout = new DurableObjectSqliteLiveCurrentQueryFanout({
      from: "do:room",
      protocol: "live-query.persist",
      queryCurrent: async () => queryResult("persisted"),
      subscriptions: runtime.liveQueries,
      now: () => 42_000,
      scope: "tenant:1",
    });
    const socket = new FakeSocket();
    fanout.connect(socket, "client:persist");

    await fanout.subscribeQuery("client:persist", liveQueryArgs, "query:persist");
    await expect(runtime.liveQueries.get("query:persist")).resolves.toMatchObject({
      id: "query:persist",
      connectionId: "client:persist",
      protocol: "live-query.persist",
      status: "active",
      createdAt: 42_000,
      updatedAt: 42_000,
      closedAt: null,
      query: liveQueryArgs,
      dependencies: [{ e: "task:1", a: "status" }],
      scope: "tenant:1",
    });

    await expect(
      runtime.liveQueries.list({ status: "active", a: "status" }),
    ).resolves.toHaveLength(1);

    await fanout.unsubscribeQuery("client:persist", "query:persist");
    await expect(runtime.liveQueries.get("query:persist")).resolves.toMatchObject({
      id: "query:persist",
      status: "closed",
      updatedAt: 42_000,
      closedAt: 42_000,
    });
    await expect(
      runtime.liveQueries.list({ status: "active", a: "status" }),
    ).resolves.toEqual([]);
  });

  test("hydrates persisted current-query subscriptions for reconnecting sockets", async () => {
    const runtime = await createDurableObjectSqliteRuntime({
      sql: new FakeDurableObjectSqlStorage(),
      replicaId: "do-sqlite:live-query-hydrate",
      wall: () => 701,
    });
    await runtime.liveQueries.upsert({
      id: "query:rehydrate",
      connectionId: "client:reconnect",
      protocol: "live-query.persist",
      query: liveQueryArgs,
      dependencies: [{ e: "task:1", a: "status" }],
      createdAt: 41_000,
      scope: "tenant:1",
    });
    await runtime.liveQueries.upsert({
      id: "query:other-protocol",
      connectionId: "client:reconnect",
      protocol: "live-query.other",
      query: liveQueryArgs,
      dependencies: [{ e: "task:1", a: "status" }],
      createdAt: 41_001,
      scope: "tenant:1",
    });
    await runtime.liveQueries.upsert({
      id: "query:other-scope",
      connectionId: "client:reconnect",
      protocol: "live-query.persist",
      query: liveQueryArgs,
      dependencies: [{ e: "task:1", a: "status" }],
      createdAt: 41_002,
      scope: "tenant:2",
    });

    const calls: DatalogQueryArgsType[] = [];
    const fanout = new DurableObjectSqliteLiveCurrentQueryFanout({
      from: "do:room",
      protocol: "live-query.persist",
      queryCurrent: async (args) => {
        calls.push(args);
        return queryResult(`hydrate-${calls.length}`);
      },
      subscriptions: runtime.liveQueries,
      scope: "tenant:1",
    });
    const socket = new FakeSocket();
    fanout.connect(socket, "client:reconnect");

    await expect(fanout.hydrateConnection("client:reconnect")).resolves.toEqual({
      connectionId: "client:reconnect",
      hydrated: 1,
      subscriptions: ["query:rehydrate"],
    });
    expect(fanout.subscriptionCount).toBe(1);
    expect(calls).toEqual([liveQueryArgs]);
    expect(socket.queryMessages()).toEqual([
      {
        protocol: "live-query.persist",
        type: "query.subscribed",
        from: "do:room",
        id: "query:rehydrate",
        dependencies: [{ e: "task:1", a: "status" }],
        result: queryResult("hydrate-1"),
      },
    ]);

    await expect(fanout.publishChanges([statusChange])).resolves.toEqual({
      changed: [statusChange],
      delivered: 1,
      subscriptions: ["query:rehydrate"],
    });
    expect(socket.queryMessages()[1]).toEqual({
      protocol: "live-query.persist",
      type: "query.updated",
      from: "do:room",
      id: "query:rehydrate",
      changed: [statusChange],
      result: queryResult("hydrate-2"),
    });
  });

  test("handles socket current-query hydrate messages", async () => {
    const runtime = await createDurableObjectSqliteRuntime({
      sql: new FakeDurableObjectSqlStorage(),
      replicaId: "do-sqlite:live-query-socket-hydrate",
      wall: () => 702,
    });
    await runtime.liveQueries.upsert({
      id: "query:socket-hydrate",
      connectionId: "client:socket",
      protocol: "live-query.persist",
      query: liveQueryArgs,
      dependencies: [{ e: "task:1", a: "status" }],
      createdAt: 42_000,
    });
    const fanout = new DurableObjectSqliteLiveCurrentQueryFanout({
      from: "do:room",
      protocol: "live-query.persist",
      queryCurrent: async () => queryResult("socket-hydrate"),
      subscriptions: runtime.liveQueries,
    });
    const socket = new FakeSocket();
    fanout.connect(socket, "client:socket");

    socket.receive(
      JSON.stringify({
        protocol: "live-query.persist",
        type: "query.hydrate",
      }),
    );
    await flush();

    expect(fanout.subscriptionCount).toBe(1);
    expect(socket.queryMessages()).toEqual([
      {
        protocol: "live-query.persist",
        type: "query.subscribed",
        from: "do:room",
        id: "query:socket-hydrate",
        dependencies: [{ e: "task:1", a: "status" }],
        result: queryResult("socket-hydrate"),
      },
    ]);
  });

  test("derives bounded query dependencies and rejects unbounded live queries", async () => {
    await expect(
      durableObjectSqliteLiveQueryDependencies({
        where: [
          ["task:1", "status", "?status"],
          { not: ["task:1", "blocked", true] },
          {
            or: [
              [["task:2", "status", "?status"]],
              [["?task", "kind", "Task"]],
            ],
          },
        ],
        select: ["?status"],
        coord: { txTime: 10, validTime: 10 },
      }),
    ).resolves.toEqual([
      { a: "kind" },
      { e: "task:1", a: "blocked" },
      { e: "task:1", a: "status" },
      { e: "task:2", a: "status" },
    ]);

    const unboundedQuery: DatalogQueryArgsType = {
      where: [["?e", "?a", "?v"]],
      select: ["?e"],
      coord: { txTime: 10, validTime: 10 },
    };
    const fanout = new DurableObjectSqliteLiveCurrentQueryFanout({
      from: "do:room",
      queryCurrent: async () => queryResult("unused"),
    });
    const socket = new FakeSocket();
    fanout.connect(socket, "client:1");

    await expect(
      fanout.subscribeQuery("client:1", unboundedQuery, "query:all"),
    ).rejects.toThrow(/requires at least one bounded e or a pattern/);

    socket.receive(
      JSON.stringify({
        protocol: fanout.protocol,
        type: "query.subscribe",
        id: "query:bad",
        query: unboundedQuery,
      }),
    );
    await flush();
    expect(socket.closed).toEqual({
      code: 1003,
      reason: "invalid live query subscription",
    });
    expect(fanout.subscriptionCount).toBe(0);
  });

  test("live-query client subscribes and receives current-query messages", async () => {
    FakeClientWebSocket.instances = [];
    const received: DurableObjectSqliteLiveQueryServerMessage[] = [];
    const client = createDurableObjectSqliteLiveQueryClient({
      url: "wss://relay.example/live-query/room?client=browser",
      protocol: "live-query.client",
      WebSocket: FakeClientWebSocket,
      onMessage: (message) => received.push(message),
    });

    const socket = client.connect() as FakeClientWebSocket;
    expect(socket.url).toBe("wss://relay.example/live-query/room?client=browser");
    socket.open();
    client.subscribe({ id: "query:status", query: liveQueryArgs });

    expect(socket.messages()).toEqual([
      {
        protocol: "live-query.client",
        type: "query.subscribe",
        id: "query:status",
        query: liveQueryArgs,
      },
    ]);

    socket.receive(
      JSON.stringify({
        protocol: "live-query.client",
        type: "query.subscribed",
        from: "do:room",
        id: "query:status",
        dependencies: [{ e: "task:1", a: "status" }],
        result: queryResult("open"),
      }),
    );
    socket.receive(
      JSON.stringify({
        protocol: "live-query.client",
        type: "query.updated",
        from: "do:room",
        id: "query:status",
        changed: [statusChange],
        result: queryResult("closed"),
      }),
    );
    socket.receive(
      JSON.stringify({
        protocol: "other",
        type: "query.updated",
        from: "do:room",
        id: "query:status",
        changed: [statusChange],
        result: queryResult("ignored"),
      }),
    );

    expect(received).toEqual([
      {
        protocol: "live-query.client",
        type: "query.subscribed",
        from: "do:room",
        id: "query:status",
        dependencies: [{ e: "task:1", a: "status" }],
        result: queryResult("open"),
      },
      {
        protocol: "live-query.client",
        type: "query.updated",
        from: "do:room",
        id: "query:status",
        changed: [statusChange],
        result: queryResult("closed"),
      },
    ]);

    client.unsubscribe("query:status");
    expect(socket.messages()[1]).toEqual({
      protocol: "live-query.client",
      type: "query.unsubscribe",
      id: "query:status",
    });
  });

  test("live-query client flushes pre-connect subscriptions once", async () => {
    FakeClientWebSocket.instances = [];
    const client = createDurableObjectSqliteLiveQueryClient({
      url: "wss://relay.example/live-query/room",
      protocol: "live-query.client",
      WebSocket: FakeClientWebSocket,
    });

    const socket = client.connect() as FakeClientWebSocket;
    client.subscribe({ id: "query:status", query: liveQueryArgs });
    socket.open();

    expect(socket.messages()).toEqual([
      {
        protocol: "live-query.client",
        type: "query.subscribe",
        id: "query:status",
        query: liveQueryArgs,
      },
    ]);
  });

  test("live-query client reconnects with a stable hydration request", async () => {
    FakeClientWebSocket.instances = [];
    const closes: unknown[] = [];
    const opens: unknown[] = [];
    const client = createDurableObjectSqliteLiveQueryClient({
      url: "wss://relay.example/live-query/room?client=client:reconnect",
      protocol: "live-query.client",
      connectionId: "client:reconnect",
      WebSocket: FakeClientWebSocket,
      reconnect: { retries: 1, delayMs: 0 },
      onOpen: () => opens.push({ opened: true }),
      onClose: (event) => closes.push(event),
    });

    const first = client.connect() as FakeClientWebSocket;
    client.subscribe({ id: "query:status", query: liveQueryArgs });
    first.open();
    expect(first.messages()).toEqual([
      {
        protocol: "live-query.client",
        type: "query.subscribe",
        id: "query:status",
        query: liveQueryArgs,
      },
      {
        protocol: "live-query.client",
        type: "query.hydrate",
        connectionId: "client:reconnect",
      },
    ]);

    first.close(1006, "network");
    await flushTimers();
    expect(FakeClientWebSocket.instances).toHaveLength(2);
    const second = FakeClientWebSocket.instances[1]!;
    second.open();
    expect(second.messages()).toEqual([
      {
        protocol: "live-query.client",
        type: "query.hydrate",
        connectionId: "client:reconnect",
      },
    ]);
    expect(opens).toHaveLength(2);
    expect(closes).toEqual([{ code: 1006, reason: "network" }]);

    client.close(1000, "done");
    second.close(1006, "after-client-close");
    await flushTimers();
    expect(FakeClientWebSocket.instances).toHaveLength(2);
  });
});
