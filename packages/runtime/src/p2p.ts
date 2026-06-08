import type { Event } from "@metacrdt/core";
import type { RuntimeServices, Transport, VersionVector } from "./types.js";
import { deltaSince, versionVector } from "./sync.js";
import { mergeFrom } from "./operations.js";

const DEFAULT_PROTOCOL = "metacrdt.runtime.datachannel.v1";

export interface DataChannelLike {
  readonly readyState?: string;
  send(data: string): void;
  close?(): void;
  addEventListener?(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  addEventListener?(
    type: "open" | "close",
    listener: (event?: unknown) => void,
  ): void;
  removeEventListener?(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener?(
    type: "open" | "close",
    listener: (event?: unknown) => void,
  ): void;
  onmessage?: ((event: { data: unknown }) => void) | null;
  onopen?: ((event?: unknown) => void) | null;
  onclose?: ((event?: unknown) => void) | null;
}

export type PeerMessage =
  | {
      protocol: string;
      type: "hello";
      from: string;
      vv: VersionVector;
    }
  | {
      protocol: string;
      type: "events";
      from: string;
      events: readonly Event[];
    }
  | {
      protocol: string;
      type: "delta";
      from: string;
      to: string;
      since: VersionVector;
      events: readonly Event[];
    };

export type PeerDataChannelTransportOptions = {
  protocol?: string;
  announceOnStart?: boolean;
  announceOnConnect?: boolean;
  closeChannelsOnStop?: boolean;
};

type PeerEntry = {
  channel: DataChannelLike;
  peerId?: string;
  previousOnMessage?: ((event: { data: unknown }) => void) | null;
  previousOnOpen?: ((event?: unknown) => void) | null;
  previousOnClose?: ((event?: unknown) => void) | null;
  onMessage: (event: { data: unknown }) => void;
  onOpen: () => void;
  onClose: () => void;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseWire(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isMessage(value: unknown, protocol: string): value is PeerMessage {
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

function isOpen(channel: DataChannelLike): boolean {
  return channel.readyState === undefined || channel.readyState === "open";
}

/**
 * WebRTC/DataChannel-compatible anti-entropy transport. Unlike BroadcastChannel,
 * this is point-to-point: callers connect one or more peer channels, and newly
 * inserted remote events are gossiped onward to other connected peers.
 */
export class PeerDataChannelTransport implements Transport {
  readonly protocol: string;
  readonly runtime: RuntimeServices;
  readonly announceOnStart: boolean;
  readonly announceOnConnect: boolean;
  readonly closeChannelsOnStop: boolean;
  #started = false;
  #peers = new Map<DataChannelLike, PeerEntry>();

  constructor(
    runtime: RuntimeServices,
    options: PeerDataChannelTransportOptions = {},
  ) {
    this.runtime = runtime;
    this.protocol = options.protocol ?? DEFAULT_PROTOCOL;
    this.announceOnStart = options.announceOnStart ?? true;
    this.announceOnConnect = options.announceOnConnect ?? true;
    this.closeChannelsOnStop = options.closeChannelsOnStop ?? false;
  }

  get size(): number {
    return this.#peers.size;
  }

  connect(channel: DataChannelLike, peerId?: string): void {
    if (this.#peers.has(channel)) return;
    const entry: PeerEntry = {
      channel,
      peerId,
      onMessage: (event) => {
        void this.#handle(entry, event.data);
      },
      onOpen: () => {
        if (this.#started && this.announceOnConnect) void this.announce(channel);
      },
      onClose: () => {
        this.disconnect(channel);
      },
    };

    if (channel.addEventListener) {
      channel.addEventListener("message", entry.onMessage);
      channel.addEventListener("open", entry.onOpen);
      channel.addEventListener("close", entry.onClose);
    } else {
      entry.previousOnMessage = channel.onmessage;
      entry.previousOnOpen = channel.onopen;
      entry.previousOnClose = channel.onclose;
      channel.onmessage = entry.onMessage;
      channel.onopen = entry.onOpen;
      channel.onclose = entry.onClose;
    }

    this.#peers.set(channel, entry);
    if (this.#started && this.announceOnConnect && isOpen(channel)) {
      void this.announce(channel);
    }
  }

  disconnect(channel: DataChannelLike): void {
    const entry = this.#peers.get(channel);
    if (!entry) return;
    this.#peers.delete(channel);
    if (channel.removeEventListener) {
      channel.removeEventListener("message", entry.onMessage);
      channel.removeEventListener("open", entry.onOpen);
      channel.removeEventListener("close", entry.onClose);
    } else {
      channel.onmessage = entry.previousOnMessage ?? null;
      channel.onopen = entry.previousOnOpen ?? null;
      channel.onclose = entry.previousOnClose ?? null;
    }
  }

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    if (!this.announceOnStart) return;
    await Promise.all(
      [...this.#peers.keys()]
        .filter(isOpen)
        .map((channel) => this.announce(channel)),
    );
  }

  stop(): void {
    if (!this.#started && this.#peers.size === 0) return;
    this.#started = false;
    const channels = [...this.#peers.keys()];
    for (const channel of channels) {
      this.disconnect(channel);
      if (this.closeChannelsOnStop) channel.close?.();
    }
  }

  async announce(channel?: DataChannelLike): Promise<void> {
    await this.#send(
      {
        protocol: this.protocol,
        type: "hello",
        from: this.runtime.profile.replicaId,
        vv: versionVector(await this.runtime.store.scan()),
      },
      channel,
    );
  }

  async publish(events: readonly Event[]): Promise<void> {
    if (events.length === 0) return;
    await this.#send({
      protocol: this.protocol,
      type: "events",
      from: this.runtime.profile.replicaId,
      events,
    });
  }

  async #handle(source: PeerEntry, raw: unknown): Promise<void> {
    const message = parseWire(raw);
    if (!isMessage(message, this.protocol)) return;
    const self = this.runtime.profile.replicaId;
    if (message.from === self) return;

    if (message.type === "hello") {
      const local = await this.runtime.store.scan();
      const delta = deltaSince(local, message.vv);
      if (delta.events.length === 0) return;
      await this.#send(
        {
          protocol: this.protocol,
          type: "delta",
          from: self,
          to: message.from,
          since: message.vv,
          events: delta.events,
        },
        source.channel,
      );
      return;
    }

    if (message.type === "delta" && message.to !== self) return;
    const inserted = await mergeFrom(this.runtime, message.events);
    if (inserted > 0) await this.#gossip(message.events, source.channel);
  }

  async #gossip(
    events: readonly Event[],
    except: DataChannelLike,
  ): Promise<void> {
    await this.#send(
      {
        protocol: this.protocol,
        type: "events",
        from: this.runtime.profile.replicaId,
        events,
      },
      undefined,
      except,
    );
  }

  async #send(
    message: PeerMessage,
    only?: DataChannelLike,
    except?: DataChannelLike,
  ): Promise<void> {
    const payload = JSON.stringify(message);
    const channels = only ? [only] : [...this.#peers.keys()];
    for (const channel of channels) {
      if (channel === except || !isOpen(channel)) continue;
      channel.send(payload);
    }
  }
}

export function attachPeerDataChannelTransport<T extends RuntimeServices>(
  runtime: T,
  options?: PeerDataChannelTransportOptions,
): T & { transport: PeerDataChannelTransport } {
  const withTransport = runtime as T & { transport: PeerDataChannelTransport };
  withTransport.profile = {
    ...runtime.profile,
    capabilities: new Set([...runtime.profile.capabilities, "transport"]),
  };
  withTransport.transport = new PeerDataChannelTransport(runtime, options);
  return withTransport;
}
