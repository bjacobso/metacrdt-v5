/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import metacrdtSchema from "../packages/convex/src/component/schema";

const modules = import.meta.glob("./**/*.ts");
const metacrdtModules = import.meta.glob("../packages/convex/src/component/**/*.ts");

async function flush(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

function mountedTest() {
  const t = convexTest(schema, modules);
  t.registerComponent("metacrdt", metacrdtSchema, metacrdtModules);
  return t.withIdentity({ tokenIdentifier: "system" });
}

describe("@metacrdt/convex mounted component wrapper", () => {
  test("summarizes host factEvents through the installed component", async () => {
    vi.useFakeTimers();
    try {
      const t = mountedTest();
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
    const t = mountedTest();

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
    const t = mountedTest();

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
    const t = mountedTest();

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
    const t = mountedTest();

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

  test("lists component-owned current entities through app wrapper", async () => {
    const t = mountedTest();

    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-list:worker-a",
      type: "Worker",
      name: "List Worker A",
      attributes: [{ a: "worker.status", value: "active" }],
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-list:worker-b",
      type: "Worker",
      name: "List Worker B",
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-list:client-a",
      type: "Client",
      name: "List Client A",
    });

    const workers = await t.query(api.metacrdtComponent.listOwnedCurrentEntities, {
      type: "Worker",
    });
    expect(workers.map((e) => e.e).sort()).toEqual([
      "component-list:worker-a",
      "component-list:worker-b",
    ]);
    expect(workers).toContainEqual(
      expect.objectContaining({
        e: "component-list:worker-a",
        type: "Worker",
        name: "List Worker A",
        typeFact: expect.objectContaining({ a: "type", v: "Worker" }),
      }),
    );

    const all = await t.query(api.metacrdtComponent.listOwnedCurrentEntities, {});
    expect(all.map((e) => e.e).sort()).toEqual([
      "component-list:client-a",
      "component-list:worker-a",
      "component-list:worker-b",
    ]);
  });

  test("sets component-owned worker status through app wrapper", async () => {
    const t = mountedTest();

    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-status:worker",
      type: "Worker",
      name: "Status Worker",
      attributes: [{ a: "worker.status", value: "active" }],
    });
    const updated = await t.mutation(api.metacrdtComponent.setOwnedWorkerStatus, {
      e: "component-status:worker",
      status: "terminated",
    });

    const entity = await t.query(api.metacrdtComponent.getOwnedCurrentEntity, {
      e: "component-status:worker",
    });
    expect(entity?.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          a: "worker.status",
          values: ["terminated"],
          facts: [expect.objectContaining({ assertEventId: updated.eventId })],
        }),
      ]),
    );

    const events = await t.query(api.metacrdtComponent.listOwnedEvents, {
      e: "component-status:worker",
      a: "worker.status",
      limit: 10,
    });
    expect(events.map((event) => event.kind).sort()).toEqual([
      "assert",
      "assert",
      "retract",
    ]);
  });

  test("runs configured actions against component-owned entities", async () => {
    const t = mountedTest();

    await t.mutation(api.attributes.defineAttribute, {
      name: "worker.status",
      valueType: "string",
      cardinality: "one",
    });
    await t.mutation(api.actions.defineAction, {
      name: "owned_set_status",
      label: "Set owned worker status",
      appliesTo: "Worker",
      fields: [
        {
          name: "status",
          label: "Status",
          type: "select",
          options: ["active", "terminated"],
        },
      ],
      asserts: { "worker.status": "$arg.status" },
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-action:worker",
      type: "Worker",
      name: "Action Worker",
      attributes: [{ a: "worker.status", value: "active" }],
    });

    const result = await t.mutation(api.metacrdtComponent.runOwnedAction, {
      action: "owned_set_status",
      entity: "component-action:worker",
      args: { status: "terminated" },
    });
    expect(result.action).toBe("owned_set_status");
    expect(result.asserted).toHaveLength(1);

    const entity = await t.query(api.metacrdtComponent.getOwnedCurrentEntity, {
      e: "component-action:worker",
    });
    expect(entity?.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          a: "worker.status",
          values: ["terminated"],
          facts: [
            expect.objectContaining({
              assertEventId: result.asserted[0].eventId,
            }),
          ],
        }),
      ]),
    );

    const events = await t.query(api.metacrdtComponent.listOwnedEvents, {
      e: "component-action:worker",
      a: "worker.status",
      limit: 10,
    });
    expect(events.map((event) => event.kind).sort()).toEqual([
      "assert",
      "assert",
      "retract",
    ]);
  });

  test("component-owned actions enforce appliesTo", async () => {
    const t = mountedTest();

    await t.mutation(api.actions.defineAction, {
      name: "owned_worker_only",
      appliesTo: "Worker",
      asserts: { "worker.status": "terminated" },
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-action:client",
      type: "Client",
      name: "Action Client",
    });

    await expect(
      t.mutation(api.metacrdtComponent.runOwnedAction, {
        action: "owned_worker_only",
        entity: "component-action:client",
      }),
    ).rejects.toThrow(/applies to Worker/);
  });

  test("component-owned actions can open host collection forms", async () => {
    const t = mountedTest();

    await t.mutation(api.forms.defineForm, {
      form: "owned_i9",
      title: "Owned I-9",
      fields: [
        {
          name: "worker.legalName",
          label: "Legal name",
          type: "string",
          required: true,
        },
      ],
    });
    await t.mutation(api.actions.defineAction, {
      name: "owned_collect_i9",
      label: "Collect owned I-9",
      appliesTo: "Worker",
      asserts: {},
      opensForm: { form: "owned_i9", scope: "$entity" },
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-collect:worker",
      type: "Worker",
      name: "Collect Worker",
    });

    const first = await t.mutation(api.metacrdtComponent.runOwnedAction, {
      action: "owned_collect_i9",
      entity: "component-collect:worker",
    });
    expect(first.asserted).toHaveLength(0);
    expect(first.collect?.collectUrl).toMatch(/^\/collect\?token=/);
    expect(first.collect?.reused).toBe(false);

    const token = first.collect!.token;
    expect(await t.query(api.forms.collectionByToken, { token })).toMatchObject({
      form: "owned_i9",
      scope: "component-collect:worker",
      subject: "component-collect:worker",
    });

    const second = await t.mutation(api.metacrdtComponent.runOwnedAction, {
      action: "owned_collect_i9",
      entity: "component-collect:worker",
    });
    expect(second.collect?.token).toBe(token);
    expect(second.collect?.reused).toBe(true);

    await t.mutation(api.forms.submitCollection, {
      token,
      values: { "worker.legalName": "Component Worker" },
    });

    const hostEntity = await t.query(api.facts.getEntity, {
      e: "component-collect:worker",
    });
    expect(hostEntity.attributes["submitted.owned_i9"]).toEqual([
      "component-collect:worker",
    ]);
    expect(hostEntity.attributes["owned_i9/worker.legalName"]).toEqual([
      "Component Worker",
    ]);

    const componentEntity = await t.query(
      api.metacrdtComponent.getOwnedCurrentEntity,
      { e: "component-collect:worker" },
    );
    expect(
      componentEntity?.attributes.find((attr) => attr.a === "worker.legalName"),
    ).toBeUndefined();
  });

  test("component-owned missing current entity returns null", async () => {
    const t = mountedTest();

    expect(
      await t.query(api.metacrdtComponent.getOwnedCurrentEntity, {
        e: "component-entity:missing",
      }),
    ).toBeNull();
  });

  test("passes component-owned cardinality-one writes through app wrapper", async () => {
    const t = mountedTest();

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
    const t = mountedTest();

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
