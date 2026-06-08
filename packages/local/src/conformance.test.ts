import { describe, expect, test } from "vitest";
import {
  runRuntimePersistenceConformance,
  runRuntimeConformance,
  type RuntimePersistenceConformanceTarget,
  type RuntimeLayerConformanceTarget,
  type RuntimeFactoryOptions,
} from "@metacrdt/testkit";
import {
  createAsyncLocalRuntimeLayer,
  type AsyncLocalRuntimeStorage,
} from "./index.js";

class AsyncMemoryStorage implements AsyncLocalRuntimeStorage {
  readonly data = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.data.delete(key);
  }
}

const localTarget: RuntimeLayerConformanceTarget = {
  name: "local-async",
  createLayer(options: RuntimeFactoryOptions) {
    return createAsyncLocalRuntimeLayer({
      storage: new AsyncMemoryStorage(),
      namespace: "conformance",
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const localPersistenceTarget = (): RuntimePersistenceConformanceTarget => {
  const storage = new AsyncMemoryStorage();
  return {
    name: "local-async-persistence",
    resetPersistence() {
      storage.data.clear();
    },
    createLayer(options: RuntimeFactoryOptions) {
      return createAsyncLocalRuntimeLayer({
        storage,
        namespace: "persistence",
        replicaId: options.replicaId,
        wall: options.wall,
      });
    },
  };
};

describe("@metacrdt/local conformance", () => {
  test("passes the shared runtime conformance suite", async () => {
    await expect(runRuntimeConformance(localTarget)).resolves.toEqual({
      target: "local-async",
      checks: [
        "append-idempotent",
        "scan-filters",
        "gset-merge-idempotent",
        "content-id-verification",
        "bidirectional-delta-exchange",
        "version-vector-convergence",
        "deterministic-fold-convergence",
        "idempotent-second-sync",
      ],
    });
  });

  test("passes the shared persistence conformance suite", async () => {
    await expect(
      runRuntimePersistenceConformance(localPersistenceTarget()),
    ).resolves.toEqual({
      target: "local-async-persistence",
      checks: [
        "event-log-survives-recreate",
        "version-vector-survives-recreate",
        "sequencer-survives-recreate",
        "hlc-survives-recreate",
        "post-restart-append-advances-vv",
      ],
    });
  });
});
