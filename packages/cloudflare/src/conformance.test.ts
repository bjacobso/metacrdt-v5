import { describe, expect, test } from "vitest";
import {
  runRuntimeConformance,
  type RuntimeLayerConformanceTarget,
  type RuntimeFactoryOptions,
} from "@metacrdt/testkit";
import {
  createDurableObjectRuntimeLayer,
  type DurableObjectStorageLike,
} from "./index.js";

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
      ],
    });
  });
});
