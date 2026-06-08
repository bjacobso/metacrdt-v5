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

  test("appends and lists component-owned protocol events through app wrappers", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("metacrdt", metacrdtSchema, metacrdtModules);

    const asserted = await t.mutation(api.metacrdtComponent.appendOwnedAssert, {
      e: "component-owned:worker",
      a: "worker.status",
      value: "active",
      validFrom: 1_000,
      reason: "component-owned wrapper test",
    });

    await t.mutation(api.metacrdtComponent.appendOwnedLifecycle, {
      kind: "retract",
      targetEventId: asserted.eventId,
      e: "component-owned:worker",
      a: "worker.status",
      value: "active",
      reason: "component-owned retract",
    });

    const events = await t.query(api.metacrdtComponent.listOwnedEvents, {
      e: "component-owned:worker",
      a: "worker.status",
      limit: 10,
    });

    expect(events).toHaveLength(2);
    expect(events.every((event) => event.validEventId)).toBe(true);
    expect(events.map((event) => event.kind).sort()).toEqual([
      "assert",
      "retract",
    ]);
    expect(events.find((event) => event.kind === "retract")).toMatchObject({
      targetEventId: asserted.eventId,
      reason: "component-owned retract",
    });

    const current = await t.query(api.metacrdtComponent.listOwnedCurrent, {
      e: "component-owned:worker",
      a: "worker.status",
      limit: 10,
    });
    expect(current).toEqual([]);
  });

  test("lists component-owned current projection through app wrapper", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("metacrdt", metacrdtSchema, metacrdtModules);

    const asserted = await t.mutation(api.metacrdtComponent.appendOwnedAssert, {
      e: "component-current:worker",
      a: "worker.status",
      value: "active",
      validFrom: 1_000,
    });

    const current = await t.query(api.metacrdtComponent.listOwnedCurrent, {
      e: "component-current:worker",
      a: "worker.status",
    });

    expect(current).toMatchObject([
      {
        factId: asserted.factId,
        e: "component-current:worker",
        a: "worker.status",
        v: "active",
        assertEventId: asserted.eventId,
      },
    ]);
  });

  test("reads component-owned current entity through app wrapper", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("metacrdt", metacrdtSchema, metacrdtModules);

    await t.mutation(api.metacrdtComponent.appendOwnedAssert, {
      e: "component-entity:worker",
      a: "worker.status",
      value: "active",
    });
    await t.mutation(api.metacrdtComponent.appendOwnedAssert, {
      e: "component-entity:worker",
      a: "worker.role",
      value: "driver",
    });

    const entity = await t.query(api.metacrdtComponent.getOwnedCurrentEntity, {
      e: "component-entity:worker",
    });
    expect(entity).toMatchObject({
      e: "component-entity:worker",
      attributes: [
        expect.objectContaining({ a: "worker.role", values: ["driver"] }),
        expect.objectContaining({ a: "worker.status", values: ["active"] }),
      ],
    });
  });

  test("creates a component-owned entity through app wrapper", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("metacrdt", metacrdtSchema, metacrdtModules);

    const created = await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-created:worker",
      type: "Worker",
      name: "Ava Reed",
      attributes: [
        { a: "worker.status", value: "active" },
        { a: "worker.role", value: "driver" },
      ],
    });
    expect(created.e).toBe("component-created:worker");
    expect(created.asserted).toHaveLength(4);

    const entity = await t.query(api.metacrdtComponent.getOwnedCurrentEntity, {
      e: "component-created:worker",
    });
    expect(entity).toMatchObject({
      e: "component-created:worker",
      attributes: [
        expect.objectContaining({ a: "name", values: ["Ava Reed"] }),
        expect.objectContaining({ a: "type", values: ["Worker"] }),
        expect.objectContaining({ a: "worker.role", values: ["driver"] }),
        expect.objectContaining({ a: "worker.status", values: ["active"] }),
      ],
    });
  });

  test("component-owned missing current entity returns null", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("metacrdt", metacrdtSchema, metacrdtModules);

    expect(
      await t.query(api.metacrdtComponent.getOwnedCurrentEntity, {
        e: "component-entity:missing",
      }),
    ).toBeNull();
  });

  test("passes component-owned cardinality-one writes through app wrapper", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("metacrdt", metacrdtSchema, metacrdtModules);

    await t.mutation(api.metacrdtComponent.appendOwnedAssert, {
      e: "component-cardinality:worker",
      a: "worker.status",
      value: "active",
      cardinality: "one",
    });
    const winner = await t.mutation(api.metacrdtComponent.appendOwnedAssert, {
      e: "component-cardinality:worker",
      a: "worker.status",
      value: "terminated",
      cardinality: "one",
    });

    const current = await t.query(api.metacrdtComponent.listOwnedCurrent, {
      e: "component-cardinality:worker",
      a: "worker.status",
    });
    expect(current).toMatchObject([
      {
        factId: winner.factId,
        v: "terminated",
        assertEventId: winner.eventId,
      },
    ]);

    const events = await t.query(api.metacrdtComponent.listOwnedEvents, {
      e: "component-cardinality:worker",
      a: "worker.status",
      limit: 10,
    });
    expect(events.map((event) => event.kind).sort()).toEqual([
      "assert",
      "assert",
      "retract",
    ]);
  });

  test("rebuilds component-owned projections through app wrapper", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("metacrdt", metacrdtSchema, metacrdtModules);

    await t.mutation(api.metacrdtComponent.appendOwnedAssert, {
      e: "component-rebuild:worker",
      a: "worker.status",
      value: "active",
      cardinality: "one",
    });
    const winner = await t.mutation(api.metacrdtComponent.appendOwnedAssert, {
      e: "component-rebuild:worker",
      a: "worker.status",
      value: "terminated",
      cardinality: "one",
    });

    expect(
      await t.mutation(api.metacrdtComponent.rebuildOwnedProjections, {}),
    ).toEqual({
      events: 3,
      facts: 2,
      currentFacts: 1,
    });

    const current = await t.query(api.metacrdtComponent.listOwnedCurrent, {
      e: "component-rebuild:worker",
      a: "worker.status",
    });
    expect(current).toMatchObject([
      {
        v: "terminated",
        assertEventId: winner.eventId,
      },
    ]);
  });
});
