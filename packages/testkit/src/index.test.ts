import { describe, expect, test } from "vitest";
import { createMemoryRuntime, type RuntimeServices } from "@metacrdt/runtime";
import {
  runEventStoreConformance,
  runRuntimeConformance,
  runRuntimeConvergenceConformance,
  type RuntimeConformanceTarget,
  type RuntimeFactoryOptions,
} from "./index.js";

const memoryTarget: RuntimeConformanceTarget = {
  name: "memory",
  createRuntime(options: RuntimeFactoryOptions): RuntimeServices {
    return createMemoryRuntime({
      replicaId: options.replicaId,
      wall: options.wall,
    });
  },
};

const brokenStoreTarget: RuntimeConformanceTarget = {
  name: "broken-store",
  createRuntime(options: RuntimeFactoryOptions): RuntimeServices {
    const runtime = createMemoryRuntime({
      replicaId: options.replicaId,
      wall: options.wall,
    });
    return {
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
    };
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
