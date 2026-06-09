import { describe, expect, test } from "vitest";
import {
  attachBroadcastTransport,
  attachPeerDataChannelTransport,
  createMemoryRuntime,
  createMemoryRuntimeLayer,
  createLocalRuntimeLayer,
  runtimeServicesLayer,
  type BroadcastChannelLike,
  type DataChannelLike,
  type LocalRuntimeStorage,
} from "@metacrdt/runtime";
import {
  runEventStoreConformance,
  runRuntimeConformance,
  runRuntimeConvergenceConformance,
  runRuntimeNetworkTransportConformance,
  runRuntimePersistenceConformance,
  runRuntimeProjectionConformance,
  runRuntimeProjectionQueryConformance,
  runRuntimeProjectionStoreConformance,
  runRuntimeQueryConformance,
  runRuntimeSchedulerConformance,
  runRuntimeTransportConformance,
  type RuntimeNetworkTransportConformanceTarget,
  type RuntimePersistenceConformanceTarget,
  type RuntimeProjectionStoreConformanceTarget,
  type RuntimeSchedulerConformanceTarget,
  type RuntimeTransportConformanceTarget,
  type RuntimeLayerConformanceTarget,
  type RuntimeFactoryOptions,
} from "./index.js";

class MemoryStorage implements LocalRuntimeStorage {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const memoryTarget: RuntimeLayerConformanceTarget = {
  name: "memory",
  createLayer(options: RuntimeFactoryOptions) {
    return createMemoryRuntimeLayer({
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const memoryProjectionStoreTarget: RuntimeProjectionStoreConformanceTarget = {
  name: "memory-projection-store",
  createLayer(options: RuntimeFactoryOptions) {
    return createMemoryRuntimeLayer({
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const brokenStoreTarget: RuntimeLayerConformanceTarget = {
  name: "broken-store",
  createLayer(options: RuntimeFactoryOptions) {
    const runtime = createMemoryRuntime({
      replicaId: options.replicaId,
      wall: options.wall,
    });
    return runtimeServicesLayer({
      ...runtime,
      store: {
        ...runtime.store,
        async append(event) {
          return { event, inserted: true };
        },
        async get() {
          return undefined;
        },
        async scan() {
          return [];
        },
        async merge(events) {
          return { seen: [...events].length, inserted: 0 };
        },
      },
      sequencer: runtime.sequencer,
    });
  },
};

const storageTarget = (): RuntimePersistenceConformanceTarget => {
  const storage = new MemoryStorage();
  return {
    name: "local-storage",
    resetPersistence() {
      storage.data.clear();
    },
    createLayer(options: RuntimeFactoryOptions) {
      return createLocalRuntimeLayer({
        storage,
        namespace: "testkit-persistence",
        replicaId: options.replicaId,
        wall: options.wall,
      });
    },
  };
};

const localProjectionStoreTarget = (): RuntimeProjectionStoreConformanceTarget => {
  const storage = new MemoryStorage();
  return {
    name: "local-storage-projection-store",
    createLayer(options: RuntimeFactoryOptions) {
      return createLocalRuntimeLayer({
        storage,
        namespace: "testkit-projection-store",
        replicaId: options.replicaId,
        wall: options.wall,
      });
    },
  };
};

const schedulerTarget = (): RuntimeSchedulerConformanceTarget => {
  let runtime: ReturnType<typeof createMemoryRuntime> | undefined;
  return {
    name: "memory-scheduler",
    resetScheduler() {
      runtime = undefined;
    },
    createLayer(options: RuntimeFactoryOptions) {
      runtime = createMemoryRuntime({
        replicaId: options.replicaId,
        wall: options.wall,
      });
      return runtimeServicesLayer(runtime);
    },
    readScheduled() {
      return runtime?.scheduler.scheduled ?? [];
    },
  };
};

const transportTarget = (): RuntimeTransportConformanceTarget => {
  let runtime: ReturnType<typeof createMemoryRuntime> | undefined;
  return {
    name: "memory-transport",
    resetTransport() {
      runtime = undefined;
    },
    createLayer(options: RuntimeFactoryOptions) {
      runtime = createMemoryRuntime({
        replicaId: options.replicaId,
        wall: options.wall,
      });
      return runtimeServicesLayer(runtime);
    },
    readPublished() {
      return runtime?.transport.published ?? [];
    },
  };
};

class BroadcastBus {
  readonly channels = new Set<FakeBroadcastChannel>();
}

class FakeBroadcastChannel implements BroadcastChannelLike {
  readonly listeners = new Set<(event: { data: unknown }) => void>();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  closed = false;

  constructor(private readonly bus: BroadcastBus) {
    bus.channels.add(this);
  }

  postMessage(message: unknown): void {
    for (const channel of this.bus.channels) {
      if (channel === this || channel.closed) continue;
      void Promise.resolve().then(() => channel.deliver(message));
    }
  }

  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void {
    if (type === "message") this.listeners.add(listener);
  }

  removeEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void {
    if (type === "message") this.listeners.delete(listener);
  }

  close(): void {
    this.closed = true;
    this.bus.channels.delete(this);
  }

  deliver(data: unknown): void {
    const event = { data };
    this.onmessage?.(event);
    for (const listener of this.listeners) listener(event);
  }
}

class FakeDataChannel implements DataChannelLike {
  readyState = "open";
  peer?: FakeDataChannel;
  readonly listeners = {
    message: new Set<(event: { data: unknown }) => void>(),
    open: new Set<(event?: unknown) => void>(),
    close: new Set<(event?: unknown) => void>(),
  };
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onopen: ((event?: unknown) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;

  send(data: string): void {
    if (this.readyState !== "open") throw new Error("channel is not open");
    void Promise.resolve().then(() => this.peer?.deliver(data));
  }

  addEventListener(
    type: "message" | "open" | "close",
    listener:
      | ((event: { data: unknown }) => void)
      | ((event?: unknown) => void),
  ): void {
    if (type === "message") {
      this.listeners.message.add(listener as (event: { data: unknown }) => void);
    } else {
      this.listeners[type].add(listener as (event?: unknown) => void);
    }
  }

  removeEventListener(
    type: "message" | "open" | "close",
    listener:
      | ((event: { data: unknown }) => void)
      | ((event?: unknown) => void),
  ): void {
    if (type === "message") {
      this.listeners.message.delete(listener as (event: { data: unknown }) => void);
    } else {
      this.listeners[type].delete(listener as (event?: unknown) => void);
    }
  }

  deliver(data: unknown): void {
    const event = { data };
    this.onmessage?.(event);
    for (const listener of this.listeners.message) listener(event);
  }

  close(): void {
    this.readyState = "closed";
    this.onclose?.();
    for (const listener of this.listeners.close) listener();
  }
}

function dataChannelPair(): [FakeDataChannel, FakeDataChannel] {
  const left = new FakeDataChannel();
  const right = new FakeDataChannel();
  left.peer = right;
  right.peer = left;
  return [left, right];
}

async function flushNetwork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

const broadcastNetworkTarget = (): RuntimeNetworkTransportConformanceTarget => ({
  name: "broadcast-network",
  createPair(options) {
    const bus = new BroadcastBus();
    const left = attachBroadcastTransport(
      createMemoryRuntime({
        replicaId: options.leftReplicaId,
        wall: options.wall,
      }),
      new FakeBroadcastChannel(bus),
      { announceOnStart: false },
    );
    const right = attachBroadcastTransport(
      createMemoryRuntime({
        replicaId: options.rightReplicaId,
        wall: options.wall,
      }),
      new FakeBroadcastChannel(bus),
      { announceOnStart: false },
    );
    return {
      left,
      right,
      startLeft: () => left.transport.start(),
      startRight: () => right.transport.start(),
      announceRight: () => right.transport.announce(),
      flush: flushNetwork,
      stop() {
        left.transport.stop();
        right.transport.stop();
      },
    };
  },
});

const p2pNetworkTarget = (): RuntimeNetworkTransportConformanceTarget => ({
  name: "p2p-network",
  createPair(options) {
    const [leftChannel, rightChannel] = dataChannelPair();
    const left = attachPeerDataChannelTransport(
      createMemoryRuntime({
        replicaId: options.leftReplicaId,
        wall: options.wall,
      }),
      { announceOnStart: false },
    );
    const right = attachPeerDataChannelTransport(
      createMemoryRuntime({
        replicaId: options.rightReplicaId,
        wall: options.wall,
      }),
      { announceOnStart: false },
    );
    let rightConnected = false;
    const connectRight = () => {
      if (rightConnected) return;
      rightConnected = true;
      right.transport.connect(rightChannel, options.leftReplicaId);
    };
    left.transport.connect(leftChannel, options.rightReplicaId);
    return {
      left,
      right,
      startLeft: () => left.transport.start(),
      startRight: async () => {
        connectRight();
        await right.transport.start();
      },
      connectRight,
      announceRight: () => right.transport.announce(),
      flush: flushNetwork,
      stop() {
        left.transport.stop();
        right.transport.stop();
      },
    };
  },
});

describe("@metacrdt/testkit", () => {
  test("event-store conformance passes for the in-memory target", async () => {
    await expect(runEventStoreConformance(memoryTarget)).resolves.toEqual({
      target: "memory",
      checks: [
        "append-idempotent",
        "scan-filters",
        "gset-merge-idempotent",
        "content-id-verification",
      ],
    });
  });

  test("runtime convergence conformance passes for the in-memory target", async () => {
    const report = await runRuntimeConvergenceConformance(memoryTarget);
    expect(report.target).toBe("memory");
    expect(report.checks).toEqual([
      "bidirectional-delta-exchange",
      "version-vector-convergence",
      "deterministic-fold-convergence",
      "idempotent-second-sync",
    ]);
  });

  test("combined conformance returns all checks", async () => {
    const report = await runRuntimeConformance(memoryTarget);
    expect(report.target).toBe("memory");
    expect(report.checks).toHaveLength(19);
  });

  test("runtime projection conformance passes for the in-memory target", async () => {
    const report = await runRuntimeProjectionConformance(memoryTarget);
    expect(report.target).toBe("memory");
    expect(report.checks).toEqual([
      "projection-cardinality-one-winner",
      "projection-cardinality-many-set",
      "projection-entity-map",
      "projection-bitemporal-coordinate",
      "projection-audit-flags",
      "projection-filtered-source-query",
    ]);
  });

  test("runtime query conformance passes for the in-memory target", async () => {
    const report = await runRuntimeQueryConformance(memoryTarget);
    expect(report.target).toBe("memory");
    expect(report.checks).toEqual([
      "query-join-or-negation-provenance",
      "query-compare-compute-project",
      "query-or-dedupe",
      "query-pagination-aggregation",
      "query-derived-rows",
    ]);
  });

  test("runtime projection-store conformance passes for the in-memory target", async () => {
    const report = await runRuntimeProjectionStoreConformance(
      memoryProjectionStoreTarget,
    );
    expect(report.target).toBe("memory-projection-store");
    expect(report.checks).toEqual([
      "projection-store-replace-from-fold",
      "projection-store-scan-filters",
      "projection-store-replace-matching-is-scoped",
      "projection-store-clear",
    ]);
  });

  test("runtime projection-query conformance passes for the in-memory target", async () => {
    const report = await runRuntimeProjectionQueryConformance(
      memoryProjectionStoreTarget,
    );
    expect(report.target).toBe("memory-projection-store");
    expect(report.checks).toEqual([
      "projection-query-join-negation-provenance",
      "projection-query-pagination-aggregation",
      "projection-query-derived-rows",
    ]);
  });

  test("runtime projection-store conformance passes for the localStorage target", async () => {
    await expect(
      runRuntimeProjectionStoreConformance(localProjectionStoreTarget()),
    ).resolves.toEqual({
      target: "local-storage-projection-store",
      checks: [
        "projection-store-replace-from-fold",
        "projection-store-scan-filters",
        "projection-store-replace-matching-is-scoped",
        "projection-store-clear",
      ],
    });
  });

  test("runtime projection-query conformance passes for the localStorage target", async () => {
    await expect(
      runRuntimeProjectionQueryConformance(localProjectionStoreTarget()),
    ).resolves.toEqual({
      target: "local-storage-projection-store",
      checks: [
        "projection-query-join-negation-provenance",
        "projection-query-pagination-aggregation",
        "projection-query-derived-rows",
      ],
    });
  });

  test("persistence conformance passes for the localStorage target", async () => {
    await expect(runRuntimePersistenceConformance(storageTarget())).resolves.toEqual({
      target: "local-storage",
      checks: [
        "event-log-survives-recreate",
        "version-vector-survives-recreate",
        "sequencer-survives-recreate",
        "hlc-survives-recreate",
        "post-restart-append-advances-vv",
      ],
    });
  });

  test("scheduler conformance passes for the memory scheduler target", async () => {
    await expect(runRuntimeSchedulerConformance(schedulerTarget())).resolves.toEqual({
      target: "memory-scheduler",
      checks: [
        "scheduler-accepts-operations",
        "scheduler-preserves-delay-order",
        "scheduler-preserves-payloads",
      ],
    });
  });

  test("transport conformance passes for the memory transport target", async () => {
    await expect(runRuntimeTransportConformance(transportTarget())).resolves.toEqual({
      target: "memory-transport",
      checks: [
        "transport-accepts-batches",
        "transport-preserves-batches",
        "transport-preserves-event-order",
      ],
    });
  });

  test("network transport conformance passes for BroadcastChannel transport", async () => {
    await expect(
      runRuntimeNetworkTransportConformance(broadcastNetworkTarget()),
    ).resolves.toEqual({
      target: "broadcast-network",
      checks: [
        "network-delivers-local-events",
        "network-catches-up-late-peer",
        "network-sync-is-idempotent",
      ],
    });
  });

  test("network transport conformance passes for p2p DataChannel transport", async () => {
    await expect(
      runRuntimeNetworkTransportConformance(p2pNetworkTarget()),
    ).resolves.toEqual({
      target: "p2p-network",
      checks: [
        "network-delivers-local-events",
        "network-catches-up-late-peer",
        "network-sync-is-idempotent",
      ],
    });
  });

  test("conformance failures name the target and violated contract", async () => {
    await expect(runEventStoreConformance(brokenStoreTarget)).rejects.toThrow(
      /@metacrdt\/testkit\(broken-store\): duplicate append should be idempotent/,
    );
  });
});
