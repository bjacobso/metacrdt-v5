import { describe, expect, test } from "vitest";
import {
  runRuntimeNetworkTransportConformance,
  runRuntimeConformance,
  runRuntimePersistenceConformance,
  runRuntimeProjectionQueryConformance,
  runRuntimeProjectionStoreConformance,
  type RuntimeNetworkTransportConformanceTarget,
  type RuntimeLayerConformanceTarget,
  type RuntimePersistenceConformanceTarget,
  type RuntimeProjectionStoreConformanceTarget,
  type RuntimeFactoryOptions,
} from "@metacrdt/testkit";
import {
  mergeFrom,
  versionVector,
  type BroadcastMessage,
  type RuntimeServices,
} from "@metacrdt/runtime";
import {
  createDurableObjectRuntimeLayer,
  createDurableObjectRuntime,
  createDurableObjectSqliteRuntimeLayer,
  attachDurableObjectRelay,
  type DurableObjectStorageLike,
  type WebSocketLike,
} from "./index.js";
import { FakeDurableObjectSqlStorage } from "./sqliteFake.test-support.js";

class FakeDurableObjectStorage implements DurableObjectStorageLike {
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

const cloudflareTarget: RuntimeLayerConformanceTarget = {
  name: "cloudflare-do",
  createLayer(options: RuntimeFactoryOptions) {
    return createDurableObjectRuntimeLayer({
      storage: new FakeDurableObjectStorage(),
      namespace: "conformance",
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const cloudflareProjectionStoreTarget: RuntimeProjectionStoreConformanceTarget = {
  name: "cloudflare-do-projection-store",
  createLayer(options: RuntimeFactoryOptions) {
    return createDurableObjectRuntimeLayer({
      storage: new FakeDurableObjectStorage(),
      namespace: "projection-store",
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const cloudflareSqliteTarget: RuntimeLayerConformanceTarget = {
  name: "cloudflare-do-sqlite",
  createLayer(options: RuntimeFactoryOptions) {
    return createDurableObjectSqliteRuntimeLayer({
      sql: new FakeDurableObjectSqlStorage(),
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const cloudflareSqliteProjectionStoreTarget: RuntimeProjectionStoreConformanceTarget = {
  name: "cloudflare-do-sqlite-projection-store",
  createLayer(options: RuntimeFactoryOptions) {
    return createDurableObjectSqliteRuntimeLayer({
      sql: new FakeDurableObjectSqlStorage(),
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const cloudflareSqlitePersistenceTarget = (): RuntimePersistenceConformanceTarget => {
  const sql = new FakeDurableObjectSqlStorage();
  return {
    name: "cloudflare-do-sqlite-persistence",
    resetPersistence() {
      sql.events.clear();
      sql.projection.clear();
      sql.meta.clear();
    },
    createLayer(options: RuntimeFactoryOptions) {
      return createDurableObjectSqliteRuntimeLayer({
        sql,
        replicaId: options.replicaId,
        wall: options.wall,
      });
    },
  };
};

class FakeRelaySocket implements WebSocketLike {
  accepted = false;
  closed: { code?: number; reason?: string } | undefined;
  readonly pending: Promise<void>[] = [];
  readonly messageListeners = new Set<(event: { data: unknown }) => void>();
  readonly closeListeners = new Set<(event: { code?: number; reason?: string }) => void>();
  readonly errorListeners = new Set<(event: { code?: number; reason?: string }) => void>();

  constructor(private readonly client: RuntimeServices) {}

  accept(): void {
    this.accepted = true;
  }

  send(message: string): void {
    this.pending.push(this.receiveFromRelay(message));
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

  receiveFromClient(message: BroadcastMessage): void {
    const raw = JSON.stringify(message);
    for (const listener of this.messageListeners) listener({ data: raw });
  }

  private async receiveFromRelay(raw: string): Promise<void> {
    const message = JSON.parse(raw) as BroadcastMessage;
    if (message.type === "events" || message.type === "delta") {
      await mergeFrom(this.client, message.events);
    }
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

const relayNetworkTarget: RuntimeNetworkTransportConformanceTarget = {
  name: "cloudflare-relay",
  async createPair(options) {
    const left = attachDurableObjectRelay(
      await createDurableObjectRuntime({
        storage: new FakeDurableObjectStorage(),
        namespace: "relay-left",
        replicaId: options.leftReplicaId,
        wall: options.wall,
      }),
      { announceOnConnect: false },
    );
    const right = await createDurableObjectRuntime({
      storage: new FakeDurableObjectStorage(),
      namespace: "relay-right",
      replicaId: options.rightReplicaId,
      wall: options.wall,
    });
    const socket = new FakeRelaySocket(right);
    let connected = false;

    const connectRight = () => {
      if (connected) return;
      connected = true;
      left.transport.connect(socket, options.rightReplicaId);
    };

    return {
      left,
      right,
      startLeft() {},
      startRight: connectRight,
      connectRight,
      async announceRight() {
        socket.receiveFromClient({
          protocol: left.transport.protocol,
          type: "hello",
          from: options.rightReplicaId,
          vv: versionVector(await right.store.scan()),
        });
      },
      async flush() {
        await flush();
        await Promise.all(socket.pending.splice(0));
        await flush();
      },
      stop() {
        if (connected) left.transport.disconnect(options.rightReplicaId);
      },
    };
  },
};

describe("@metacrdt/cloudflare conformance", () => {
  test("passes the shared runtime conformance suite", async () => {
    await expect(runRuntimeConformance(cloudflareTarget)).resolves.toEqual({
      target: "cloudflare-do",
      checks: [
        "append-idempotent",
        "scan-filters",
        "gset-merge-idempotent",
        "content-id-verification",
        "bidirectional-delta-exchange",
        "version-vector-convergence",
        "deterministic-fold-convergence",
        "idempotent-second-sync",
        "anti-entropy-flood-convergence",
        "content-id-integrity",
        "fold-permutation-invariance",
        "fold-oracle-agreement",
        "deterministic-fault-simulation",
        "partitioned-replica-catch-up",
        "duplicate-delivery-idempotence",
        "projection-cardinality-one-winner",
        "projection-cardinality-many-set",
        "projection-entity-map",
        "projection-bitemporal-coordinate",
        "projection-audit-flags",
        "projection-filtered-source-query",
        "query-join-or-negation-provenance",
        "query-compare-compute-project",
        "query-or-dedupe",
        "query-pagination-aggregation",
        "query-derived-rows",
      ],
    });
  });

  test("passes the shared projection-store conformance suite", async () => {
    await expect(
      runRuntimeProjectionStoreConformance(cloudflareProjectionStoreTarget),
    ).resolves.toEqual({
      target: "cloudflare-do-projection-store",
      checks: [
        "projection-store-replace-from-fold",
        "projection-store-scan-filters",
        "projection-store-replace-matching-is-scoped",
        "projection-store-clear",
      ],
    });
  });

  test("passes the shared projection-query conformance suite", async () => {
    await expect(
      runRuntimeProjectionQueryConformance(cloudflareProjectionStoreTarget),
    ).resolves.toEqual({
      target: "cloudflare-do-projection-store",
      checks: [
        "projection-query-join-negation-provenance",
        "projection-query-pagination-aggregation",
        "projection-query-derived-rows",
      ],
    });
  });

  test("SQLite target passes the shared runtime conformance suite", async () => {
    await expect(runRuntimeConformance(cloudflareSqliteTarget)).resolves.toEqual({
      target: "cloudflare-do-sqlite",
      checks: [
        "append-idempotent",
        "scan-filters",
        "gset-merge-idempotent",
        "content-id-verification",
        "bidirectional-delta-exchange",
        "version-vector-convergence",
        "deterministic-fold-convergence",
        "idempotent-second-sync",
        "anti-entropy-flood-convergence",
        "content-id-integrity",
        "fold-permutation-invariance",
        "fold-oracle-agreement",
        "deterministic-fault-simulation",
        "partitioned-replica-catch-up",
        "duplicate-delivery-idempotence",
        "projection-cardinality-one-winner",
        "projection-cardinality-many-set",
        "projection-entity-map",
        "projection-bitemporal-coordinate",
        "projection-audit-flags",
        "projection-filtered-source-query",
        "query-join-or-negation-provenance",
        "query-compare-compute-project",
        "query-or-dedupe",
        "query-pagination-aggregation",
        "query-derived-rows",
      ],
    });
  });

  test("SQLite target passes the shared projection-store conformance suite", async () => {
    await expect(
      runRuntimeProjectionStoreConformance(cloudflareSqliteProjectionStoreTarget),
    ).resolves.toEqual({
      target: "cloudflare-do-sqlite-projection-store",
      checks: [
        "projection-store-replace-from-fold",
        "projection-store-scan-filters",
        "projection-store-replace-matching-is-scoped",
        "projection-store-clear",
      ],
    });
  });

  test("SQLite target passes the shared projection-query conformance suite", async () => {
    await expect(
      runRuntimeProjectionQueryConformance(cloudflareSqliteProjectionStoreTarget),
    ).resolves.toEqual({
      target: "cloudflare-do-sqlite-projection-store",
      checks: [
        "projection-query-join-negation-provenance",
        "projection-query-pagination-aggregation",
        "projection-query-derived-rows",
      ],
    });
  });

  test("SQLite target passes the shared persistence conformance suite", async () => {
    await expect(
      runRuntimePersistenceConformance(cloudflareSqlitePersistenceTarget()),
    ).resolves.toEqual({
      target: "cloudflare-do-sqlite-persistence",
      checks: [
        "event-log-survives-recreate",
        "version-vector-survives-recreate",
        "sequencer-survives-recreate",
        "hlc-survives-recreate",
        "post-restart-append-advances-vv",
      ],
    });
  });

  test("passes the shared relay network transport conformance suite", async () => {
    await expect(
      runRuntimeNetworkTransportConformance(relayNetworkTarget),
    ).resolves.toEqual({
      target: "cloudflare-relay",
      checks: [
        "network-delivers-local-events",
        "network-catches-up-late-peer",
        "network-sync-is-idempotent",
      ],
    });
  });
});
