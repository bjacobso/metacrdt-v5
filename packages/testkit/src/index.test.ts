import { describe, expect, test } from "vitest";
import {
  createMemoryRuntime,
  createMemoryRuntimeLayer,
  runtimeServicesLayer,
} from "@metacrdt/runtime";
import {
  runEventStoreConformance,
  runRuntimeConformance,
  runRuntimeConvergenceConformance,
  type RuntimeLayerConformanceTarget,
  type RuntimeFactoryOptions,
} from "./index.js";

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

  test("conformance failures name the target and violated contract", async () => {
    await expect(runEventStoreConformance(brokenStoreTarget)).rejects.toThrow(
      /@metacrdt\/testkit\(broken-store\): duplicate append should be idempotent/,
    );
  });
});
