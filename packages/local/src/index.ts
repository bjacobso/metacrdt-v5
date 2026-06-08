import {
  BroadcastChannelTransport,
  attachBroadcastTransport,
  createLocalRuntime,
  type BroadcastChannelLike,
  type BroadcastTransportOptions,
  type LocalRuntimeOptions,
  type LocalRuntimeStorage,
} from "@metacrdt/runtime";

export type BrowserStorageLike = LocalRuntimeStorage;
export type BrowserBroadcastChannelLike = BroadcastChannelLike;

export type LocalFirstRuntimeOptions = Omit<LocalRuntimeOptions, "storage"> & {
  /**
   * Storage for event log, HLC, and per-replica seq. Defaults to
   * `globalThis.localStorage` in browsers.
   */
  storage?: BrowserStorageLike;
  /**
   * BroadcastChannel-compatible channel. Defaults to
   * `new BroadcastChannel(channelName)`.
   */
  channel?: BrowserBroadcastChannelLike;
  /** Channel name used when `channel` is not supplied. */
  channelName?: string;
  /** Enable same-origin BroadcastChannel anti-entropy. Defaults to true. */
  broadcast?: boolean;
  /** Passed through to the BroadcastChannel transport. */
  transport?: BroadcastTransportOptions;
  /** Convenience override for `transport.announceOnStart`. Defaults to true. */
  announceOnStart?: boolean;
};

type LocalRuntimeBase = Omit<ReturnType<typeof createLocalRuntime>, "transport">;

export type LocalFirstRuntime = LocalRuntimeBase & {
  transport?: BroadcastChannelTransport;
  start(): Promise<void>;
  stop(): void;
};

/**
 * Resolve the browser's localStorage as the runtime's sync storage interface.
 * Tests/non-browser hosts should pass `storage` explicitly instead.
 */
export function browserStorage(): BrowserStorageLike {
  if (typeof globalThis.localStorage === "undefined") {
    throw new Error(
      "@metacrdt/local requires localStorage; pass `storage` in non-browser hosts",
    );
  }
  return globalThis.localStorage;
}

/**
 * Create a BroadcastChannel for same-origin browser anti-entropy. Tests and
 * non-browser hosts should pass `channel` explicitly.
 */
export function browserBroadcastChannel(
  name = "metacrdt:sync",
): BrowserBroadcastChannelLike {
  if (typeof globalThis.BroadcastChannel === "undefined") {
    throw new Error(
      "@metacrdt/local requires BroadcastChannel; pass `channel` or set broadcast:false",
    );
  }
  return new globalThis.BroadcastChannel(
    name,
  ) as unknown as BrowserBroadcastChannelLike;
}

/**
 * Browser/local-first target composition. This is intentionally thin: durable
 * storage and BroadcastChannel protocol logic live in `@metacrdt/runtime`; this
 * package supplies browser defaults and lifecycle ergonomics.
 */
export function createLocalFirstRuntime(
  options: LocalFirstRuntimeOptions,
): LocalFirstRuntime {
  const namespace = options.namespace ?? "metacrdt";
  const base = createLocalRuntime({
    name: options.name ?? "local",
    replicaId: options.replicaId,
    storage: options.storage ?? browserStorage(),
    namespace,
    wall: options.wall,
    capabilities: options.capabilities,
  });

  let transport: BroadcastChannelTransport | undefined;
  let runtime: LocalRuntimeBase & {
    transport?: BroadcastChannelTransport;
  } = base as LocalRuntimeBase;

  if (options.broadcast ?? true) {
    const transportOptions: BroadcastTransportOptions = {
      ...options.transport,
      announceOnStart:
        options.announceOnStart ?? options.transport?.announceOnStart ?? true,
    };
    runtime = attachBroadcastTransport(
      base,
      options.channel ?? browserBroadcastChannel(options.channelName ?? `${namespace}:sync`),
      transportOptions,
    );
    transport = runtime.transport;
  }

  return Object.assign(runtime, {
    transport,
    async start() {
      await transport?.start();
    },
    stop() {
      transport?.stop();
    },
  });
}

/** Create a local-first runtime and immediately start its transport, if enabled. */
export async function startLocalFirstRuntime(
  options: LocalFirstRuntimeOptions,
): Promise<LocalFirstRuntime> {
  const runtime = createLocalFirstRuntime(options);
  await runtime.start();
  return runtime;
}

export {
  LocalClock,
  LocalEventStore,
  LocalSequencer,
  decodeLocalEvent,
  decodeLocalValue,
  encodeLocalEvent,
  encodeLocalValue,
  localClockKey,
  localEventsKey,
  localSeqKey,
  type EncodedLocalEvent,
  type EncodedLocalValue,
  type LocalRuntimeOptions,
  type LocalRuntimeStorage,
} from "@metacrdt/runtime";
export {
  BroadcastChannelTransport,
  type BroadcastChannelLike,
  type BroadcastMessage,
  type BroadcastTransportOptions,
} from "@metacrdt/runtime";

export {
  AsyncLocalClock,
  AsyncLocalEventStore,
  AsyncLocalSequencer,
  createAsyncLocalRuntime,
  createIndexedDbLocalFirstRuntime,
  startIndexedDbLocalFirstRuntime,
  type AsyncLocalRuntime,
  type AsyncLocalRuntimeOptions,
  type AsyncLocalRuntimeStorage,
  type IndexedDbLocalFirstRuntime,
  type IndexedDbLocalFirstRuntimeOptions,
} from "./async.js";
export {
  IndexedDbRuntimeStorage,
  indexedDbStorage,
  type IndexedDbStorageOptions,
} from "./indexedDb.js";
