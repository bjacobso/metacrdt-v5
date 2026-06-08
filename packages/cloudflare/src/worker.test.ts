import { describe, expect, test } from "vitest";
import {
  MetaCrdtRelayDurableObject,
  createRelayWorker,
  type DurableObjectNamespaceLike,
  type DurableObjectStateLike,
  type DurableObjectStorageLike,
  type DurableObjectStubLike,
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
  sent: string[] = [];

  accept(): void {
    this.accepted = true;
  }

  send(message: string): void {
    this.sent.push(message);
  }

  addEventListener(): void {}
  removeEventListener(): void {}
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

  test("reports health and clear routing errors", async () => {
    const worker = createRelayWorker();
    const health = await worker.fetch(
      new Request("https://relay.example/health"),
      {},
    );
    expect(health.status).toBe(200);
    expect(await body(health)).toEqual({ ok: true, binding: "METACRDT_RELAY" });

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
      error: "missing room; use ?room=<name> or /rooms/<name>",
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
});
