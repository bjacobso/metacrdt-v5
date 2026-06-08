import { describe, expect, test } from "vitest";
import {
  createMemoryRuntime,
  createMemoryRuntimeLayer,
  createLocalRuntimeLayer,
  runtimeServicesLayer,
  type LocalRuntimeStorage,
} from "@metacrdt/runtime";
import {
  runEventStoreConformance,
  runRuntimeConformance,
  runRuntimeConvergenceConformance,
  runRuntimePersistenceConformance,
  runRuntimeSchedulerConformance,
  type RuntimePersistenceConformanceTarget,
  type RuntimeSchedulerConformanceTarget,
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
    expect(report.checks).toHaveLength(8);
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

  test("conformance failures name the target and violated contract", async () => {
    await expect(runEventStoreConformance(brokenStoreTarget)).rejects.toThrow(
      /@metacrdt\/testkit\(broken-store\): duplicate append should be idempotent/,
    );
  });
});
