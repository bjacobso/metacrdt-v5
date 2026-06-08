/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import metacrdtSchema from "../packages/convex/src/component/schema";

const modules = import.meta.glob("./**/*.ts");
const metacrdtModules = import.meta.glob("../packages/convex/src/component/**/*.ts");

async function flush(t: ReturnType<typeof convexTest>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("@metacrdt/convex mounted component wrapper", () => {
  test("summarizes host factEvents through the installed component", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      t.registerComponent("metacrdt", metacrdtSchema, metacrdtModules);
      await t.mutation(api.facts.assertFact, {
        e: "component:worker",
        a: "worker.status",
        value: "active",
        reason: "component wrapper test",
      });
      await flush(t);

      const summaries = await t.query(api.metacrdtComponent.verifyEvents, {
        e: "component:worker",
        requireValid: true,
      });

      expect(summaries).toHaveLength(1);
      expect(summaries[0]).toMatchObject({
        kind: "assert",
        e: "component:worker",
        a: "worker.status",
        v: "active",
        hasProtocolMetadata: true,
        validEventId: true,
        verifiable: true,
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
