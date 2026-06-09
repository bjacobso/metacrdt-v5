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
import type { DurableObjectSqliteLiveCurrentQueryFanout } from "./sqliteLive.js";

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

export type RelayWorkerEnv = Record<
  string,
  DurableObjectNamespaceLike | string | undefined
>;

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

export type RelayAuthOptions = {
  /**
   * Static token, useful in tests or non-Workers hosts. Prefer `envKey` for live
   * Cloudflare deployments so the token is supplied by a Wrangler secret.
   */
  token?: string;
  /** Worker env key containing the token. Defaults to METACRDT_RELAY_TOKEN. */
  envKey?: string;
  /** Header to read. Defaults to Authorization and accepts Bearer tokens. */
  header?: string;
  /** Optional query-string token. Defaults to token. */
  queryParam?: string;
  /** Health is public by default; set true to protect it too. */
  requireHealth?: boolean;
};

export type RelayWorkerOptions = {
  binding?: string;
  healthPath?: string;
  roomParam?: string;
  roomPathPrefix?: string;
  liveQueryPathPrefix?: string;
  /**
   * Token auth for the Worker-facing relay routes. Omitted means "enforce when
   * METACRDT_RELAY_TOKEN exists"; `false` disables auth even if that env var is
   * present (useful behind another private boundary).
   */
  auth?: RelayAuthOptions | false;
};

type ResolvedRelayAuthOptions = Required<RelayAuthOptions>;

type ResolvedRelayWorkerOptions = Required<
  Omit<RelayWorkerOptions, "auth">
> & {
  auth: ResolvedRelayAuthOptions | undefined;
};

const DEFAULT_AUTH_ENV_KEY = "METACRDT_RELAY_TOKEN";
const DEFAULT_CLIENT_PARAM = "client";
const DEFAULT_CLIENT_HEADER = "Sec-WebSocket-Key";

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

function roomFromRequest(
  request: Request,
  options: Pick<ResolvedRelayWorkerOptions, "roomParam">,
  pathPrefixes: readonly string[],
): string | null {
  const url = new URL(request.url);
  const byParam = url.searchParams.get(options.roomParam);
  if (byParam) return byParam;

  for (const pathPrefix of pathPrefixes) {
    const prefix = pathPrefix.endsWith("/") ? pathPrefix : `${pathPrefix}/`;
    if (!url.pathname.startsWith(prefix)) continue;
    const room = decodeURIComponent(url.pathname.slice(prefix.length)).replace(/^\/+/, "");
    return room === "" ? null : room;
  }
  return null;
}

function relayAuthOptions(auth: RelayWorkerOptions["auth"]): ResolvedRelayAuthOptions | undefined {
  if (auth === false) return undefined;
  return {
    token: auth?.token ?? "",
    envKey: auth?.envKey ?? DEFAULT_AUTH_ENV_KEY,
    header: auth?.header ?? "authorization",
    queryParam: auth?.queryParam ?? "token",
    requireHealth: auth?.requireHealth ?? false,
  };
}

function relayWorkerOptions(options: RelayWorkerOptions = {}): ResolvedRelayWorkerOptions {
  return {
    binding: options.binding ?? "METACRDT_RELAY",
    healthPath: options.healthPath ?? "/health",
    roomParam: options.roomParam ?? "room",
    roomPathPrefix: options.roomPathPrefix ?? "/rooms",
    liveQueryPathPrefix: options.liveQueryPathPrefix ?? "/live-query",
    auth: relayAuthOptions(options.auth),
  };
}

function isNamespace(value: RelayWorkerEnv[string]): value is DurableObjectNamespaceLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "idFromName" in value &&
    "get" in value
  );
}

function configuredToken(
  env: RelayWorkerEnv,
  auth: ResolvedRelayAuthOptions | undefined,
): string | undefined {
  if (!auth) return undefined;
  if (auth.token !== "") return auth.token;
  const fromEnv = env[auth.envKey];
  return typeof fromEnv === "string" && fromEnv !== "" ? fromEnv : undefined;
}

function requestToken(request: Request, auth: ResolvedRelayAuthOptions): string | undefined {
  const url = new URL(request.url);
  const byQuery = url.searchParams.get(auth.queryParam);
  if (byQuery) return byQuery;

  const byHeader = request.headers.get(auth.header);
  if (!byHeader) return undefined;
  const bearer = byHeader.match(/^Bearer\s+(.+)$/i);
  return bearer?.[1] ?? byHeader;
}

function tokenEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function isAuthorized(
  request: Request,
  env: RelayWorkerEnv,
  auth: ResolvedRelayAuthOptions | undefined,
): boolean {
  const expected = configuredToken(env, auth);
  if (!expected) return true;
  const presented = auth ? requestToken(request, auth) : undefined;
  return presented !== undefined && tokenEquals(presented, expected);
}

function unauthorized(): Response {
  return json(
    { error: "unauthorized relay request" },
    {
      status: 401,
      headers: { "www-authenticate": 'Bearer realm="metacrdt-relay"' },
    },
  );
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

export type DurableObjectSqliteLiveQueryWebSocketOptions = {
  webSocketPair?: WebSocketPairFactory;
  webSocketResponse?: WebSocketResponseFactory;
  connectionIdParam?: string;
  connectionIdHeader?: string;
};

export function attachDurableObjectSqliteLiveQueryWebSocket(
  request: Request,
  fanout: DurableObjectSqliteLiveCurrentQueryFanout,
  options: DurableObjectSqliteLiveQueryWebSocketOptions = {},
): Response {
  if (!isUpgrade(request)) {
    return json(
      {
        error: "websocket upgrade required",
      },
      { status: 426 },
    );
  }
  const webSocketPair = options.webSocketPair ?? defaultWebSocketPair;
  const webSocketResponse =
    options.webSocketResponse ??
    ((client) =>
      new Response(null, {
        status: 101,
        webSocket: client,
      } as ResponseInitWithWebSocket));
  const pair = webSocketPair();
  const url = new URL(request.url);
  const connectionId =
    url.searchParams.get(options.connectionIdParam ?? DEFAULT_CLIENT_PARAM) ??
    request.headers.get(options.connectionIdHeader ?? DEFAULT_CLIENT_HEADER) ??
    undefined;
  fanout.connect(pair[1], connectionId);
  return webSocketResponse(pair[0]);
}

export function createRelayWorker(options: RelayWorkerOptions = {}) {
  const resolved = relayWorkerOptions(options);
  return {
    async fetch(
      request: Request,
      env: RelayWorkerEnv,
    ): Promise<Response> {
      const url = new URL(request.url);
      if (url.pathname === resolved.healthPath) {
        if (
          resolved.auth?.requireHealth &&
          !isAuthorized(request, env, resolved.auth)
        ) {
          return unauthorized();
        }
        return json({
          ok: true,
          binding: resolved.binding,
          liveQueryPathPrefix: resolved.liveQueryPathPrefix,
        });
      }

      if (!isAuthorized(request, env, resolved.auth)) {
        return unauthorized();
      }

      const namespace = env[resolved.binding];
      if (!isNamespace(namespace)) {
        return json({ error: `missing Durable Object binding ${resolved.binding}` }, { status: 500 });
      }

      const room = roomFromRequest(request, resolved, [
        resolved.roomPathPrefix,
        resolved.liveQueryPathPrefix,
      ]);
      if (!room) {
        return json(
          {
            error: `missing room; use ?${resolved.roomParam}=<name>, ${resolved.roomPathPrefix}/<name>, or ${resolved.liveQueryPathPrefix}/<name>`,
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
