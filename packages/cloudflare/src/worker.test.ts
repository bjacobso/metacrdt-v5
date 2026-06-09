import { describe, expect, test } from "vitest";
import {
  DurableObjectSqliteLiveCurrentQueryFanout,
  MetaCrdtRelayDurableObject,
  MetaCrdtSqliteLiveQueryDurableObject,
  attachDurableObjectSqliteLiveQueryWebSocket,
  createRelayWorker,
  type DurableObjectNamespaceLike,
  type DurableObjectStateLike,
  type DurableObjectStorageLike,
  type DurableObjectStubLike,
  type WebSocketLike,
} from "./index.js";
import type {
  DatalogQueryArgsType,
  DatalogQueryResult,
} from "@metacrdt/runtime";
import { FakeDurableObjectSqlStorage } from "./sqliteFake.test-support.js";

class FakeStorage implements DurableObjectStorageLike {
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

class FakeSqliteStorage extends FakeStorage {
  readonly sql = new FakeDurableObjectSqlStorage();
}

class FakeSocket implements WebSocketLike {
  accepted = false;
  closed: { code?: number; reason?: string } | undefined;
  sent: string[] = [];
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
}

class FakeStub implements DurableObjectStubLike {
  requests: Request[] = [];

  constructor(private readonly response = () => new Response("ok")) {}

  async fetch(request: Request): Promise<Response> {
    this.requests.push(request);
    return this.response();
  }
}

class FakeNamespace implements DurableObjectNamespaceLike {
  readonly ids: string[] = [];
  readonly stub = new FakeStub();

  idFromName(name: string): unknown {
    this.ids.push(name);
    return { name };
  }

  get(): DurableObjectStubLike {
    return this.stub;
  }
}

async function body(res: Response): Promise<unknown> {
  return JSON.parse(await res.text()) as unknown;
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

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

describe("@metacrdt/cloudflare Worker shell", () => {
  test("routes room requests by query or path to the configured DO binding", async () => {
    const worker = createRelayWorker();
    const ns = new FakeNamespace();
    const env = { METACRDT_RELAY: ns };

    const byQuery = await worker.fetch(
      new Request("https://relay.example/sync?room=alpha"),
      env,
    );
    expect(await byQuery.text()).toBe("ok");
    expect(ns.ids).toEqual(["alpha"]);
    expect(ns.stub.requests[0]?.url).toBe("https://relay.example/sync?room=alpha");

    const byPath = await worker.fetch(
      new Request("https://relay.example/rooms/beta"),
      env,
    );
    expect(await byPath.text()).toBe("ok");
    expect(ns.ids).toEqual(["alpha", "beta"]);
  });

  test("routes live-query room requests through the same authenticated DO binding", async () => {
    const worker = createRelayWorker({
      liveQueryPathPrefix: "/queries",
      auth: { token: "secret" },
    });
    const ns = new FakeNamespace();
    const env = { METACRDT_RELAY: ns };

    const denied = await worker.fetch(
      new Request("https://relay.example/queries/alpha", {
        headers: { Upgrade: "websocket" },
      }),
      env,
    );
    expect(denied.status).toBe(401);
    expect(ns.ids).toEqual([]);

    const allowed = await worker.fetch(
      new Request("https://relay.example/queries/alpha", {
        headers: {
          Upgrade: "websocket",
          authorization: "Bearer secret",
        },
      }),
      env,
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toBe("ok");
    expect(ns.ids).toEqual(["alpha"]);
    expect(ns.stub.requests[0]?.url).toBe("https://relay.example/queries/alpha");
    expect(ns.stub.requests[0]?.headers.get("Upgrade")).toBe("websocket");
  });

  test("reports health and clear routing errors", async () => {
    const worker = createRelayWorker();
    const health = await worker.fetch(
      new Request("https://relay.example/health"),
      {},
    );
    expect(health.status).toBe(200);
    expect(await body(health)).toEqual({
      ok: true,
      binding: "METACRDT_RELAY",
      liveQueryPathPrefix: "/live-query",
      writePathPrefix: "/write",
    });

    const noBinding = await worker.fetch(
      new Request("https://relay.example/rooms/alpha"),
      {},
    );
    expect(noBinding.status).toBe(500);
    expect(await body(noBinding)).toEqual({
      error: "missing Durable Object binding METACRDT_RELAY",
    });

    const noRoom = await worker.fetch(
      new Request("https://relay.example/sync"),
      { METACRDT_RELAY: new FakeNamespace() },
    );
    expect(noRoom.status).toBe(400);
    expect(await body(noRoom)).toEqual({
      error:
        "missing room; use ?room=<name>, /rooms/<name>, /live-query/<name>, or /write/<name>/<operation>",
    });
  });

  test("routes write requests through the same authenticated DO binding", async () => {
    const worker = createRelayWorker({ auth: { token: "secret" } });
    const ns = new FakeNamespace();
    const env = { METACRDT_RELAY: ns };

    const denied = await worker.fetch(
      new Request("https://relay.example/write/alpha/assert", {
        method: "POST",
      }),
      env,
    );
    expect(denied.status).toBe(401);
    expect(ns.ids).toEqual([]);

    const allowed = await worker.fetch(
      new Request("https://relay.example/write/alpha/assert", {
        method: "POST",
        headers: { authorization: "Bearer secret" },
      }),
      env,
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toBe("ok");
    expect(ns.ids).toEqual(["alpha"]);
    expect(ns.stub.requests[0]?.url).toBe(
      "https://relay.example/write/alpha/assert",
    );
  });

  test("requires relay token when configured by Worker env", async () => {
    const worker = createRelayWorker();
    const ns = new FakeNamespace();
    const env = {
      METACRDT_RELAY: ns,
      METACRDT_RELAY_TOKEN: "secret",
    };

    const denied = await worker.fetch(
      new Request("https://relay.example/rooms/alpha"),
      env,
    );
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toBe(
      'Bearer realm="metacrdt-relay"',
    );
    expect(await body(denied)).toEqual({ error: "unauthorized relay request" });
    expect(ns.ids).toEqual([]);
    expect(ns.stub.requests).toEqual([]);

    const allowed = await worker.fetch(
      new Request("https://relay.example/rooms/alpha", {
        headers: { authorization: "Bearer secret" },
      }),
      env,
    );
    expect(allowed.status).toBe(200);
    expect(await allowed.text()).toBe("ok");
    expect(ns.ids).toEqual(["alpha"]);
    expect(ns.stub.requests).toHaveLength(1);
  });

  test("accepts configured header and query token forms", async () => {
    const byHeaderWorker = createRelayWorker({
      auth: { token: "secret", header: "x-metacrdt-token" },
    });
    const ns = new FakeNamespace();

    const byHeader = await byHeaderWorker.fetch(
      new Request("https://relay.example/rooms/alpha", {
        headers: { "x-metacrdt-token": "secret" },
      }),
      { METACRDT_RELAY: ns },
    );
    expect(byHeader.status).toBe(200);
    expect(ns.ids).toEqual(["alpha"]);

    const byQueryWorker = createRelayWorker({
      auth: { token: "secret", queryParam: "relayToken" },
    });
    const byQuery = await byQueryWorker.fetch(
      new Request("https://relay.example/rooms/beta?relayToken=secret"),
      { METACRDT_RELAY: ns },
    );
    expect(byQuery.status).toBe(200);
    expect(ns.ids).toEqual(["alpha", "beta"]);
  });

  test("health is public by default and can be token-protected", async () => {
    const publicHealth = createRelayWorker({ auth: { token: "secret" } });
    const publicResponse = await publicHealth.fetch(
      new Request("https://relay.example/health"),
      {},
    );
    expect(publicResponse.status).toBe(200);

    const protectedHealth = createRelayWorker({
      auth: { token: "secret", requireHealth: true },
    });
    const denied = await protectedHealth.fetch(
      new Request("https://relay.example/health"),
      {},
    );
    expect(denied.status).toBe(401);

    const allowed = await protectedHealth.fetch(
      new Request("https://relay.example/health?token=secret"),
      {},
    );
    expect(allowed.status).toBe(200);
    expect(await body(allowed)).toEqual({
      ok: true,
      binding: "METACRDT_RELAY",
      liveQueryPathPrefix: "/live-query",
      writePathPrefix: "/write",
    });
  });

  test("Durable Object health reports replica, connections, and version vector", async () => {
    const object = new MetaCrdtRelayDurableObject(
      { storage: new FakeStorage() },
      {
        namespace: "room",
        replicaId: "do:room",
        wall: () => 100,
      },
    );
    const res = await object.fetch(new Request("https://relay.example/health"));
    expect(res.status).toBe(200);
    expect(await body(res)).toEqual({
      ok: true,
      replicaId: "do:room",
      connections: 0,
      vv: {},
    });
  });

  test("Durable Object upgrades WebSocket requests and connects the server socket", async () => {
    const server = new FakeSocket();
    const client = { client: true };
    const object = new MetaCrdtRelayDurableObject(
      { storage: new FakeStorage() } satisfies DurableObjectStateLike,
      {
        namespace: "room",
        replicaId: "do:room",
        webSocketPair: () => ({ 0: client, 1: server }),
        webSocketResponse: (webSocket) =>
          new Response(null, {
            status: 200,
            headers: { "x-test-upgrade": "websocket" },
          } as ResponseInit & { webSocket?: unknown }) as Response & {
            webSocket?: unknown;
          } & { webSocket: unknown },
      },
    );
    const res = await object.fetch(
      new Request("https://relay.example/room?client=alice", {
        headers: { Upgrade: "websocket" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-test-upgrade")).toBe("websocket");
    expect(server.accepted).toBe(true);
    await flush();
    expect(server.sent.map((m) => JSON.parse(m))).toMatchObject([
      {
        type: "hello",
        from: "do:room",
        vv: {},
      },
    ]);
  });

  test("Durable Object rejects non-WebSocket sync requests", async () => {
    const object = new MetaCrdtRelayDurableObject({
      storage: new FakeStorage(),
    });
    const res = await object.fetch(new Request("https://relay.example/sync"));
    expect(res.status).toBe(426);
    expect(await body(res)).toEqual({ error: "websocket upgrade required" });
  });

  test("attaches SQLite live-query WebSocket requests to a structural fanout", async () => {
    const server = new FakeSocket();
    const client = { client: true };
    const fanout = new DurableObjectSqliteLiveCurrentQueryFanout({
      from: "do:room",
      protocol: "live-query.test",
      queryCurrent: async () => queryResult("open"),
    });

    const res = attachDurableObjectSqliteLiveQueryWebSocket(
      new Request("https://relay.example/live-query/room?client=alice", {
        headers: { Upgrade: "websocket" },
      }),
      fanout,
      {
        webSocketPair: () => ({ 0: client, 1: server }),
        webSocketResponse: (webSocket) =>
          new Response(null, {
            status: 200,
            headers: { "x-test-upgrade": "live-query" },
          } as ResponseInit & { webSocket?: unknown }) as Response & {
            webSocket?: unknown;
          } & { webSocket: unknown },
      },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("x-test-upgrade")).toBe("live-query");
    expect(server.accepted).toBe(true);
    expect(fanout.size).toBe(1);

    server.receive(
      JSON.stringify({
        protocol: "live-query.test",
        type: "query.subscribe",
        id: "query:status",
        query: liveQueryArgs,
      }),
    );
    await flush();
    expect(server.sent.map((message) => JSON.parse(message))).toEqual([
      {
        protocol: "live-query.test",
        type: "query.subscribed",
        from: "do:room",
        id: "query:status",
        dependencies: [{ e: "task:1", a: "status" }],
        result: queryResult("open"),
      },
    ]);
  });

  test("SQLite live-query Durable Object assembles runtime, surface, and fanout", async () => {
    const server = new FakeSocket();
    const storage = new FakeSqliteStorage();
    const live = new MetaCrdtSqliteLiveQueryDurableObject(
      { storage },
      {
        replicaId: "do:sqlite-live",
        wall: () => 100,
        cardinalityOf: () => "one",
        currentCoord: () => ({ txTime: 10_000, validTime: 10_000 }),
        webSocketPair: () => ({ 0: { client: true }, 1: server }),
        webSocketResponse: () =>
          new Response(null, {
            status: 200,
            headers: { "x-test-upgrade": "sqlite-live-query" },
          } as ResponseInit & { webSocket?: unknown }),
      },
    );

    const assembled = await live.liveQueryRuntime();
    await assembled.surface.appendAssert({
      e: "task:1",
      a: "status",
      v: "open",
      actor: "user:1",
      actorType: "human",
    });

    const res = await live.fetch(
      new Request("https://relay.example/live-query/room?client=alice", {
        headers: { Upgrade: "websocket" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("x-test-upgrade")).toBe("sqlite-live-query");
    expect(server.accepted).toBe(true);
    expect(assembled.fanout.size).toBe(1);

    server.receive(
      JSON.stringify({
        protocol: assembled.fanout.protocol,
        type: "query.subscribe",
        id: "query:status",
        query: {
          where: [["task:1", "status", "?status"]],
          select: ["?status"],
          coord: { txTime: 10_000, validTime: 10_000 },
        },
      }),
    );
    await flush();
    expect(server.sent.map((message) => JSON.parse(message))).toEqual([
      {
        protocol: assembled.fanout.protocol,
        type: "query.subscribed",
        from: "do:sqlite-live",
        id: "query:status",
        dependencies: [{ e: "task:1", a: "status" }],
        result: {
          states: [
            {
              binding: { status: "open" },
              sources: [expect.stringMatching(/^e_/)],
              eventSources: [expect.stringMatching(/^e_/)],
            },
          ],
          rows: [{ status: "open" }],
          eventSourceIds: [expect.stringMatching(/^e_/)],
        },
      },
    ]);
    await expect(
      assembled.runtime.liveQueries.get("query:status"),
    ).resolves.toMatchObject({
      id: "query:status",
      connectionId: "alice",
      status: "active",
      dependencies: [{ e: "task:1", a: "status" }],
    });
  });

  test("SQLite live-query Durable Object write routes publish query updates", async () => {
    const server = new FakeSocket();
    const live = new MetaCrdtSqliteLiveQueryDurableObject(
      { storage: new FakeSqliteStorage() },
      {
        replicaId: "do:sqlite-live",
        wall: () => 100,
        cardinalityOf: () => "one",
        currentCoord: () => ({ txTime: 10_000, validTime: 10_000 }),
        webSocketPair: () => ({ 0: { client: true }, 1: server }),
        webSocketResponse: () =>
          new Response(null, {
            status: 200,
            headers: { "x-test-upgrade": "sqlite-live-query" },
          } as ResponseInit & { webSocket?: unknown }),
      },
    );
    const assembled = await live.liveQueryRuntime();

    await live.fetch(
      new Request("https://relay.example/live-query/room?client=alice", {
        headers: { Upgrade: "websocket" },
      }),
    );
    server.receive(
      JSON.stringify({
        protocol: assembled.fanout.protocol,
        type: "query.subscribe",
        id: "query:status",
        query: {
          where: [["task:1", "status", "?status"]],
          select: ["?status"],
          coord: { txTime: 10_000, validTime: 10_000 },
        },
      }),
    );
    await flush();

    expect(server.sent.map((message) => JSON.parse(message))).toEqual([
      {
        protocol: assembled.fanout.protocol,
        type: "query.subscribed",
        from: "do:sqlite-live",
        id: "query:status",
        dependencies: [{ e: "task:1", a: "status" }],
        result: {
          states: [],
          rows: [],
          eventSourceIds: [],
        },
      },
    ]);

    const write = await live.fetch(
      new Request("https://relay.example/write/room/assert", {
        method: "POST",
        body: JSON.stringify({
          e: "task:1",
          a: "status",
          v: "open",
          actor: "user:1",
          actorType: "human",
        }),
      }),
    );
    expect(write.status).toBe(200);
    expect(await body(write)).toMatchObject({
      ok: true,
      live: {
        delivered: 1,
        subscriptions: ["query:status"],
        changed: [
          {
            e: "task:1",
            a: "status",
            beforeEventIds: [],
            afterEventIds: [expect.stringMatching(/^e_/)],
          },
        ],
      },
      result: {
        projection: {
          changed: [
            {
              e: "task:1",
              a: "status",
              beforeEventIds: [],
              afterEventIds: [expect.stringMatching(/^e_/)],
            },
          ],
        },
      },
    });

    await flush();
    expect(server.sent.map((message) => JSON.parse(message))).toEqual([
      expect.objectContaining({
        type: "query.subscribed",
        result: {
          states: [],
          rows: [],
          eventSourceIds: [],
        },
      }),
      {
        protocol: assembled.fanout.protocol,
        type: "query.updated",
        from: "do:sqlite-live",
        id: "query:status",
        changed: [
          {
            e: "task:1",
            a: "status",
            beforeEventIds: [],
            afterEventIds: [expect.stringMatching(/^e_/)],
          },
        ],
        result: {
          states: [
            {
              binding: { status: "open" },
              sources: [expect.stringMatching(/^e_/)],
              eventSources: [expect.stringMatching(/^e_/)],
            },
          ],
          rows: [{ status: "open" }],
          eventSourceIds: [expect.stringMatching(/^e_/)],
        },
      },
    ]);
  });
});
