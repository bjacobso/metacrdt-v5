import { versionVector } from "@metacrdt/runtime";
import {
  createDurableObjectRuntime,
  type DurableObjectRuntimeOptions,
  type DurableObjectStorageLike,
} from "./durableObject.js";
import {
  attachDurableObjectRelay,
  type DurableObjectWebSocketRelay,
  type RelayOptions,
  type WebSocketLike,
} from "./relay.js";

export interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
}

export interface DurableObjectStubLike {
  fetch(request: Request): Promise<Response>;
}

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

export type WebSocketPairLike = {
  0: unknown;
  1: WebSocketLike;
};

export type WebSocketPairFactory = () => WebSocketPairLike;
export type WebSocketResponseFactory = (client: unknown) => Response;

export type ResponseInitWithWebSocket = ResponseInit & {
  webSocket?: unknown;
};

export type RelayDurableObjectOptions = RelayOptions & {
  namespace?: string;
  replicaId?: string;
  wall?: () => number;
  webSocketPair?: WebSocketPairFactory;
  webSocketResponse?: WebSocketResponseFactory;
};

export type RelayWorkerOptions = {
  binding?: string;
  healthPath?: string;
  roomParam?: string;
  roomPathPrefix?: string;
};

function defaultWebSocketPair(): WebSocketPairLike {
  const ctor = (globalThis as { WebSocketPair?: new () => WebSocketPairLike })
    .WebSocketPair;
  if (!ctor) throw new Error("WebSocketPair is not available in this runtime");
  return new ctor();
}

function isUpgrade(request: Request): boolean {
  return request.headers.get("Upgrade")?.toLowerCase() === "websocket";
}

function json(value: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(value), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

function roomFromRequest(request: Request, options: Required<RelayWorkerOptions>): string | null {
  const url = new URL(request.url);
  const byParam = url.searchParams.get(options.roomParam);
  if (byParam) return byParam;

  const prefix = options.roomPathPrefix.endsWith("/")
    ? options.roomPathPrefix
    : `${options.roomPathPrefix}/`;
  if (!url.pathname.startsWith(prefix)) return null;
  const room = decodeURIComponent(url.pathname.slice(prefix.length)).replace(/^\/+/, "");
  return room === "" ? null : room;
}

function relayWorkerOptions(options: RelayWorkerOptions = {}): Required<RelayWorkerOptions> {
  return {
    binding: options.binding ?? "METACRDT_RELAY",
    healthPath: options.healthPath ?? "/health",
    roomParam: options.roomParam ?? "room",
    roomPathPrefix: options.roomPathPrefix ?? "/rooms",
  };
}

/**
 * Durable Object class shell for a MetaCRDT relay room. It owns no protocol
 * logic: storage/runtime services come from `createDurableObjectRuntime`, and
 * socket sync/fan-out comes from `DurableObjectWebSocketRelay`.
 */
export class MetaCrdtRelayDurableObject {
  readonly namespace: string;
  readonly replicaId: string;
  readonly webSocketPair: WebSocketPairFactory;
  readonly webSocketResponse: WebSocketResponseFactory;
  #runtime:
    | (Awaited<ReturnType<typeof createDurableObjectRuntime>> & {
        transport: DurableObjectWebSocketRelay;
      })
    | undefined;

  constructor(
    private readonly state: DurableObjectStateLike,
    options: RelayDurableObjectOptions = {},
  ) {
    this.namespace = options.namespace ?? "metacrdt";
    this.replicaId = options.replicaId ?? `cloudflare:${this.namespace}`;
    this.webSocketPair = options.webSocketPair ?? defaultWebSocketPair;
    this.webSocketResponse =
      options.webSocketResponse ??
      ((client) =>
        new Response(null, {
          status: 101,
          webSocket: client,
        } as ResponseInitWithWebSocket));
    this.relayOptions = options;
    this.runtimeOptions = {
      namespace: this.namespace,
      replicaId: this.replicaId,
      wall: options.wall,
    };
  }

  readonly relayOptions: RelayOptions;
  readonly runtimeOptions: Omit<DurableObjectRuntimeOptions, "storage">;

  async runtime(): Promise<
    Awaited<ReturnType<typeof createDurableObjectRuntime>> & {
      transport: DurableObjectWebSocketRelay;
    }
  > {
    if (!this.#runtime) {
      this.#runtime = attachDurableObjectRelay(
        await createDurableObjectRuntime({
          ...this.runtimeOptions,
          storage: this.state.storage,
        }),
        this.relayOptions,
      );
    }
    return this.#runtime;
  }

  async fetch(request: Request): Promise<Response> {
    const runtime = await this.runtime();
    if (isUpgrade(request)) {
      const pair = this.webSocketPair();
      const url = new URL(request.url);
      const id =
        url.searchParams.get("client") ??
        request.headers.get("Sec-WebSocket-Key") ??
        undefined;
      runtime.transport.connect(pair[1], id);
      return this.webSocketResponse(pair[0]);
    }

    if (new URL(request.url).pathname === "/health") {
      return json({
        ok: true,
        replicaId: runtime.profile.replicaId,
        connections: runtime.transport.size,
        vv: versionVector(await runtime.store.scan()),
      });
    }

    return json(
      {
        error: "websocket upgrade required",
      },
      { status: 426 },
    );
  }
}

export function createRelayWorker(options: RelayWorkerOptions = {}) {
  const resolved = relayWorkerOptions(options);
  return {
    async fetch(
      request: Request,
      env: Record<string, DurableObjectNamespaceLike>,
    ): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === resolved.healthPath) {
        return json({ ok: true, binding: resolved.binding });
      }

      const namespace = env[resolved.binding];
      if (!namespace) {
        return json({ error: `missing Durable Object binding ${resolved.binding}` }, { status: 500 });
      }

      const room = roomFromRequest(request, resolved);
      if (!room) {
        return json(
          {
            error: `missing room; use ?${resolved.roomParam}=<name> or ${resolved.roomPathPrefix}/<name>`,
          },
          { status: 400 },
        );
      }

      const id = namespace.idFromName(room);
      return namespace.get(id).fetch(request);
    },
  };
}

export const relayWorker = createRelayWorker();
