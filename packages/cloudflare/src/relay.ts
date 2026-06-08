import type { Event } from "@metacrdt/core";
import {
  deltaSince,
  mergeFrom,
  versionVector,
  type BroadcastMessage,
  type RuntimeServices,
  type Transport,
} from "@metacrdt/runtime";

const DEFAULT_PROTOCOL = "metacrdt.cloudflare.relay.v1";

type MessageEventLike = { data: unknown };
type CloseEventLike = { code?: number; reason?: string };

export interface WebSocketLike {
  accept?(): void;
  send(message: string): void;
  close?(code?: number, reason?: string): void;
  addEventListener?(
    type: "message",
    listener: (event: MessageEventLike) => void,
  ): void;
  addEventListener?(
    type: "close" | "error",
    listener: (event: CloseEventLike) => void,
  ): void;
  removeEventListener?(
    type: "message",
    listener: (event: MessageEventLike) => void,
  ): void;
  removeEventListener?(
    type: "close" | "error",
    listener: (event: CloseEventLike) => void,
  ): void;
}

export type RelayOptions = {
  protocol?: string;
  announceOnConnect?: boolean;
};

export type RelayConnection = {
  readonly id: string;
  close(code?: number, reason?: string): void;
};

type RelayMessage = BroadcastMessage;

function parseMessage(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  return JSON.parse(raw) as unknown;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRelayMessage(value: unknown, protocol: string): value is RelayMessage {
  if (!isObject(value)) return false;
  if (value.protocol !== protocol) return false;
  if (
    value.type !== "hello" &&
    value.type !== "events" &&
    value.type !== "delta"
  ) {
    return false;
  }
  if (typeof value.from !== "string") return false;
  if (value.type === "delta" && typeof value.to !== "string") return false;
  return true;
}

function serialize(message: RelayMessage): string {
  return JSON.stringify(message);
}

/**
 * Durable Object WebSocket relay shell. It is transport-shaped for local DO
 * operations and socket-shaped for remote replicas: local events publish to all
 * connected sockets; socket messages merge into the DO runtime and fan out.
 */
export class DurableObjectWebSocketRelay implements Transport {
  readonly protocol: string;
  #nextConnection = 0;
  #connections = new Map<
    string,
    {
      socket: WebSocketLike;
      onMessage: (event: MessageEventLike) => void;
      onClose: (event: CloseEventLike) => void;
    }
  >();

  constructor(
    readonly runtime: RuntimeServices,
    options: RelayOptions = {},
  ) {
    this.protocol = options.protocol ?? DEFAULT_PROTOCOL;
    this.announceOnConnect = options.announceOnConnect ?? true;
  }

  readonly announceOnConnect: boolean;

  get size(): number {
    return this.#connections.size;
  }

  connect(socket: WebSocketLike, id = `peer:${++this.#nextConnection}`): RelayConnection {
    socket.accept?.();
    const onMessage = (event: MessageEventLike) => {
      void this.#handle(id, event.data);
    };
    const onClose = () => {
      this.disconnect(id);
    };
    socket.addEventListener?.("message", onMessage);
    socket.addEventListener?.("close", onClose);
    socket.addEventListener?.("error", onClose);
    this.#connections.set(id, { socket, onMessage, onClose });
    if (this.announceOnConnect) {
      void this.#sendHello(id);
    }
    return {
      id,
      close: (code?: number, reason?: string) => {
        this.disconnect(id);
        socket.close?.(code, reason);
      },
    };
  }

  disconnect(id: string): void {
    const connection = this.#connections.get(id);
    if (!connection) return;
    connection.socket.removeEventListener?.("message", connection.onMessage);
    connection.socket.removeEventListener?.("close", connection.onClose);
    connection.socket.removeEventListener?.("error", connection.onClose);
    this.#connections.delete(id);
  }

  async publish(events: readonly Event[]): Promise<void> {
    if (events.length === 0) return;
    this.#broadcast({
      protocol: this.protocol,
      type: "events",
      from: this.runtime.profile.replicaId,
      events,
    });
  }

  async #sendHello(id: string): Promise<void> {
    const message: RelayMessage = {
      protocol: this.protocol,
      type: "hello",
      from: this.runtime.profile.replicaId,
      vv: versionVector(await this.runtime.store.scan()),
    };
    this.#send(id, message);
  }

  async #handle(connectionId: string, raw: unknown): Promise<void> {
    let parsed: unknown;
    try {
      parsed = parseMessage(raw);
    } catch {
      this.#connections.get(connectionId)?.socket.close?.(1003, "invalid json");
      this.disconnect(connectionId);
      return;
    }
    if (!isRelayMessage(parsed, this.protocol)) return;
    if (parsed.from === this.runtime.profile.replicaId) return;

    if (parsed.type === "hello") {
      const delta = deltaSince(await this.runtime.store.scan(), parsed.vv);
      if (delta.events.length > 0) {
        this.#send(connectionId, {
          protocol: this.protocol,
          type: "delta",
          from: this.runtime.profile.replicaId,
          to: parsed.from,
          since: parsed.vv,
          events: delta.events,
        });
      }
      return;
    }

    if (parsed.type === "delta" && parsed.to !== this.runtime.profile.replicaId) {
      return;
    }

    await mergeFrom(this.runtime, parsed.events);
    this.#broadcast(
      {
        protocol: this.protocol,
        type: "events",
        from: parsed.from,
        events: parsed.events,
      },
      connectionId,
    );
  }

  #send(id: string, message: RelayMessage): void {
    this.#connections.get(id)?.socket.send(serialize(message));
  }

  #broadcast(message: RelayMessage, except?: string): void {
    const serialized = serialize(message);
    for (const [id, connection] of this.#connections) {
      if (id === except) continue;
      connection.socket.send(serialized);
    }
  }
}

export function attachDurableObjectRelay<T extends RuntimeServices>(
  runtime: T,
  options?: RelayOptions,
): T & { transport: DurableObjectWebSocketRelay } {
  const withTransport = runtime as T & { transport: DurableObjectWebSocketRelay };
  withTransport.profile = {
    ...runtime.profile,
    capabilities: new Set([...runtime.profile.capabilities, "transport"]),
  };
  withTransport.transport = new DurableObjectWebSocketRelay(runtime, options);
  return withTransport;
}
