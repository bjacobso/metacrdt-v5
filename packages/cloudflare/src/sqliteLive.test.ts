import { describe, expect, test } from "vitest";
import {
  DurableObjectSqliteLiveCurrentQueryFanout,
  DurableObjectSqliteLiveInvalidationFanout,
  createDurableObjectSqliteRuntime,
  durableObjectSqliteLiveQueryDependencies,
  publishDurableObjectSqliteLiveCurrentQueryChanges,
  publishDurableObjectSqliteLiveInvalidations,
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
});
