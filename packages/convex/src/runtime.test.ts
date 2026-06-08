/// <reference types="vite/client" />
import { describe, expect, test } from "vitest";
import {
  runRuntimeConformance,
  runRuntimeProjectionStoreConformance,
  type RuntimeFactoryOptions,
  type RuntimeLayerConformanceTarget,
  type RuntimeProjectionStoreConformanceTarget,
} from "@metacrdt/testkit";
import { internal } from "./component/_generated/api.js";
import { initComponentTest } from "./component/setup.test.js";
import { createConvexComponentRuntimeLayer } from "./index.js";

const componentInternal = internal as unknown as {
  log: {
    appendRaw: unknown;
    getRawEvent: unknown;
    listRawEvents: unknown;
    replaceProjectionRows: unknown;
    clearMaterializedProjection: unknown;
    scanProjectionRows: unknown;
  };
};

const convexComponentTarget: RuntimeLayerConformanceTarget &
  RuntimeProjectionStoreConformanceTarget = {
  name: "convex-component",
  createLayer(options: RuntimeFactoryOptions) {
    const t = initComponentTest();
    return createConvexComponentRuntimeLayer({
      replicaId: options.replicaId,
      wall: options.wall,
      refs: {
        appendRaw: componentInternal.log.appendRaw,
        getRawEvent: componentInternal.log.getRawEvent,
        listRawEvents: componentInternal.log.listRawEvents,
        replaceProjectionRows: componentInternal.log.replaceProjectionRows,
        clearMaterializedProjection:
          componentInternal.log.clearMaterializedProjection,
        scanProjectionRows: componentInternal.log.scanProjectionRows,
      },
      runner: {
        mutation: (ref, args) => (t as any).mutation(ref, args),
        query: (ref, args) => (t as any).query(ref, args),
      },
    });
  },
};

describe("@metacrdt/convex runtime Layer", () => {
  test("component-owned protocol log passes shared runtime conformance", async () => {
    await expect(runRuntimeConformance(convexComponentTarget)).resolves.toEqual({
      target: "convex-component",
      checks: [
        "append-idempotent",
        "scan-filters",
        "gset-merge-idempotent",
        "content-id-verification",
        "bidirectional-delta-exchange",
        "version-vector-convergence",
        "deterministic-fold-convergence",
        "idempotent-second-sync",
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

  test("component-owned projection rows pass shared projection-store conformance", async () => {
    await expect(
      runRuntimeProjectionStoreConformance(convexComponentTarget),
    ).resolves.toEqual({
      target: "convex-component",
      checks: [
        "projection-store-replace-from-fold",
        "projection-store-scan-filters",
        "projection-store-replace-is-atomic",
        "projection-store-clear",
      ],
    });
  });
});
