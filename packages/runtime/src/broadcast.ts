import type { Event } from "@metacrdt/core";
import type { RuntimeServices, Transport, VersionVector } from "./types.js";
import { deltaSince, versionVector } from "./sync.js";
import { mergeFrom } from "./operations.js";

const DEFAULT_PROTOCOL = "metacrdt.runtime.broadcast.v1";

export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  close?(): void;
  addEventListener?(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  removeEventListener?(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  onmessage?: ((event: { data: unknown }) => void) | null;
}

export type BroadcastMessage =
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

export type BroadcastTransportOptions = {
  protocol?: string;
  announceOnStart?: boolean;
  closeChannelOnStop?: boolean;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMessage(value: unknown, protocol: string): value is BroadcastMessage {
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

/**
 * BroadcastChannel anti-entropy transport for browser-like targets. It publishes
 * new local events, announces version vectors, answers peer hellos with deltas,
 * and merges incoming events through the existing G-Set/HLC runtime path.
 */
export class BroadcastChannelTransport implements Transport {
  readonly protocol: string;
  readonly runtime: RuntimeServices;
  #started = false;
  #previousOnMessage: ((event: { data: unknown }) => void) | null | undefined;
  #listener = (event: { data: unknown }) => {
    void this.#handle(event.data);
  };

  constructor(
    runtime: RuntimeServices,
    private readonly channel: BroadcastChannelLike,
    options: BroadcastTransportOptions = {},
  ) {
    this.runtime = runtime;
    this.protocol = options.protocol ?? DEFAULT_PROTOCOL;
    this.announceOnStart = options.announceOnStart ?? true;
    this.closeChannelOnStop = options.closeChannelOnStop ?? false;
  }

  readonly announceOnStart: boolean;
  readonly closeChannelOnStop: boolean;

  async start(): Promise<void> {
    if (this.#started) return;
    this.#started = true;
    if (this.channel.addEventListener) {
      this.channel.addEventListener("message", this.#listener);
    } else {
      this.#previousOnMessage = this.channel.onmessage;
      this.channel.onmessage = this.#listener;
    }
    if (this.announceOnStart) await this.announce();
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;
    if (this.channel.removeEventListener) {
      this.channel.removeEventListener("message", this.#listener);
    } else {
      this.channel.onmessage = this.#previousOnMessage ?? null;
      this.#previousOnMessage = undefined;
    }
    if (this.closeChannelOnStop) this.channel.close?.();
  }

  async announce(): Promise<void> {
    this.channel.postMessage({
      protocol: this.protocol,
      type: "hello",
      from: this.runtime.profile.replicaId,
      vv: versionVector(await this.runtime.store.scan()),
    } satisfies BroadcastMessage);
  }

  async publish(events: readonly Event[]): Promise<void> {
    if (events.length === 0) return;
    this.channel.postMessage({
      protocol: this.protocol,
      type: "events",
      from: this.runtime.profile.replicaId,
      events,
    } satisfies BroadcastMessage);
  }

  async #handle(raw: unknown): Promise<void> {
    if (!isMessage(raw, this.protocol)) return;
    const self = this.runtime.profile.replicaId;
    if (raw.from === self) return;

    if (raw.type === "hello") {
      const local = await this.runtime.store.scan();
      const delta = deltaSince(local, raw.vv);
      if (delta.events.length === 0) return;
      this.channel.postMessage({
        protocol: this.protocol,
        type: "delta",
        from: self,
        to: raw.from,
        since: raw.vv,
        events: delta.events,
      } satisfies BroadcastMessage);
      return;
    }

    if (raw.type === "delta" && raw.to !== self) return;
    await mergeFrom(this.runtime, raw.events);
  }
}

export function attachBroadcastTransport<T extends RuntimeServices>(
  runtime: T,
  channel: BroadcastChannelLike,
  options?: BroadcastTransportOptions,
): T & { transport: BroadcastChannelTransport } {
  const withTransport = runtime as T & { transport: BroadcastChannelTransport };
  withTransport.profile = {
    ...runtime.profile,
    capabilities: new Set([...runtime.profile.capabilities, "transport"]),
  };
  withTransport.transport = new BroadcastChannelTransport(runtime, channel, options);
  return withTransport;
}
