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

  test("runs a component-owned assert flow without host flowRuns", async () => {
    const t = mountedTest();

    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "owned-flow:worker",
      type: "Worker",
      name: "Owned Flow Worker",
    });
    await t.mutation(api.flows.defineFlow, {
      name: "owned_tiny",
      title: "Owned tiny",
      subjectType: "Worker",
      startStepId: "stage",
      steps: [
        {
          id: "stage",
          type: "assert",
          config: { a: "workflow.stage", v: "started" },
          next: "done",
        },
        { id: "done", type: "done" },
      ],
    });

    const result = await t.mutation(api.metacrdtComponent.startOwnedFlow, {
      flowDefName: "owned_tiny",
      subject: "owned-flow:worker",
    });

    expect(result.status).toBe("completed");
    expect(result.runId).toBeTruthy();
    expect(result.asserted).toHaveLength(1);
    expect(result.events.map((event) => event.kind)).toEqual([
      "asserted",
      "completed",
    ]);
    const entity = await t.query(api.metacrdtComponent.getOwnedCurrentEntity, {
      e: "owned-flow:worker",
    });
    expect(entity?.attributes).toContainEqual(
      expect.objectContaining({
        a: "workflow.stage",
        values: ["started"],
      }),
    );

    const hostRuns = await t.query(api.flows.listFlows, {
      subject: "owned-flow:worker",
    });
    expect(hostRuns).toEqual([]);

    const ownedRuns = await t.query(api.metacrdtComponent.listOwnedFlowRuns, {
      subject: "owned-flow:worker",
    });
    expect(ownedRuns).toHaveLength(1);
    expect(ownedRuns[0]).toMatchObject({
      runId: result.runId,
      flowDefName: "owned_tiny",
      subject: "owned-flow:worker",
      status: "completed",
      currentStepId: "done",
    });
    expect(ownedRuns[0].events.map((event) => event.kind).sort()).toEqual([
      "asserted",
      "completed",
    ]);
  });

  test("parks a component-owned collect flow, then resumes from submitted facts", async () => {
    const t = mountedTest();

    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "owned-flow:alien",
      type: "Worker",
      name: "Owned Flow Alien",
    });
    await t.mutation(api.metacrdtComponent.defineOwnedForm, {
      form: "owned_i9",
      title: "Owned I-9",
      fields: [
        {
          name: "citizenship",
          label: "Citizenship",
          type: "select",
          options: ["citizen", "authorized_alien"],
          required: true,
        },
      ],
    });
    await t.mutation(api.flows.defineFlow, {
      name: "owned_collect_branch",
      title: "Owned collect branch",
      subjectType: "Worker",
      startStepId: "i9",
      steps: [
        {
          id: "i9",
          type: "collect",
          config: { form: "owned_i9", scope: "$ctx.employer" },
          next: "branch",
        },
        {
          id: "branch",
          type: "branch",
          config: {
            where: [["?s", "owned_i9/citizenship", "authorized_alien"]],
            ifTrue: "everify",
            ifFalse: "done",
          },
        },
        {
          id: "everify",
          type: "action",
          config: {
            resultAttr: "everify.status",
            resultValue: "verified",
          },
          next: "done",
        },
        { id: "done", type: "done" },
      ],
    });

    const first = await t.mutation(api.metacrdtComponent.startOwnedFlow, {
      flowDefName: "owned_collect_branch",
      subject: "owned-flow:alien",
      context: { employer: "employer:acme" },
    });

    expect(first).toMatchObject({
      status: "waiting",
      currentStepId: "i9",
      collect: {
        collectUrl: expect.stringContaining("/collect?token="),
        reused: false,
      },
    });
    expect(first.runId).toBeTruthy();
    expect(first.asserted).toEqual([]);

    const submitted = await t.mutation(api.forms.submitCollection, {
      token: first.collect!.token,
      values: { citizenship: "authorized_alien" },
    });
    expect(submitted).toEqual({ ok: true });

    const resumed = await t.mutation(api.metacrdtComponent.startOwnedFlow, {
      flowDefName: "owned_collect_branch",
      subject: "owned-flow:alien",
      context: { employer: "employer:acme" },
    });

    expect(resumed.status).toBe("completed");
    expect(resumed.runId).toBe(first.runId);
    expect(resumed.events.map((event) => event.kind)).toEqual([
      "collect-satisfied",
      "branch",
      "action",
      "completed",
    ]);
    expect(resumed.asserted).toHaveLength(1);

    const entity = await t.query(api.metacrdtComponent.getOwnedCurrentEntity, {
      e: "owned-flow:alien",
    });
    expect(entity?.attributes).toContainEqual(
      expect.objectContaining({
        a: "submitted.owned_i9",
        values: ["employer:acme"],
      }),
    );
    expect(entity?.attributes).toContainEqual(
      expect.objectContaining({
        a: "owned_i9/citizenship",
        values: ["authorized_alien"],
      }),
    );
    expect(entity?.attributes).toContainEqual(
      expect.objectContaining({
        a: "everify.status",
        values: ["verified"],
      }),
    );

    const hostRuns = await t.query(api.flows.listFlows, {
      subject: "owned-flow:alien",
    });
    expect(hostRuns).toEqual([]);

    const ownedRuns = await t.query(api.metacrdtComponent.listOwnedFlowRuns, {
      subject: "owned-flow:alien",
    });
    expect(ownedRuns).toHaveLength(1);
    expect(ownedRuns[0]).toMatchObject({
      runId: first.runId,
      flowDefName: "owned_collect_branch",
      status: "completed",
      currentStepId: "done",
    });
    expect(ownedRuns[0].events.map((event) => event.kind).sort()).toEqual([
      "action",
      "branch",
      "collect-issued",
      "collect-satisfied",
      "completed",
    ]);
  });

  test("parks a component-owned wait flow and scheduled wake resumes the same run", async () => {
    vi.useFakeTimers();
    try {
      const t = mountedTest();

      await t.mutation(api.metacrdtComponent.createOwnedEntity, {
        e: "owned-flow:waiter",
        type: "Worker",
        name: "Owned Flow Waiter",
      });
      await t.mutation(api.flows.defineFlow, {
        name: "owned_wait_then_assert",
        title: "Owned wait then assert",
        subjectType: "Worker",
        startStepId: "pause",
        steps: [
          {
            id: "pause",
            type: "wait",
            config: { seconds: 1 },
            next: "mark",
          },
          {
            id: "mark",
            type: "assert",
            config: { a: "workflow.stage", v: "after-wait" },
            next: "done",
          },
          { id: "done", type: "done" },
        ],
      });

      const first = await t.mutation(api.metacrdtComponent.startOwnedFlow, {
        flowDefName: "owned_wait_then_assert",
        subject: "owned-flow:waiter",
      });

      expect(first).toMatchObject({
        status: "waiting",
        currentStepId: "pause",
      });
      expect(first.events.map((event) => event.kind)).toEqual(["wait"]);

      await flush(t);

      const runs = await t.query(api.metacrdtComponent.listOwnedFlowRuns, {
        subject: "owned-flow:waiter",
      });
      expect(runs).toHaveLength(1);
      expect(runs[0]).toMatchObject({
        runId: first.runId,
        status: "completed",
        currentStepId: "done",
      });
      expect(runs[0].events.map((event) => event.kind).sort()).toEqual([
        "asserted",
        "completed",
        "wait",
      ]);

      const entity = await t.query(api.metacrdtComponent.getOwnedCurrentEntity, {
        e: "owned-flow:waiter",
      });
      expect(entity?.attributes).toContainEqual(
        expect.objectContaining({
          a: "workflow.stage",
          values: ["after-wait"],
        }),
      );

      const hostRuns = await t.query(api.flows.listFlows, {
        subject: "owned-flow:waiter",
      });
      expect(hostRuns).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
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

  test("component-owned actions can open component-owned collection forms", async () => {
    const t = mountedTest();

    await t.mutation(api.metacrdtComponent.defineOwnedForm, {
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

    const host = await t.mutation(api.actions.runAction, {
      action: "owned_collect_i9",
      entity: "component-collect:worker",
    });
    expect(host.collect?.reused).toBe(false);

    const first = await t.mutation(api.metacrdtComponent.runOwnedAction, {
      action: "owned_collect_i9",
      entity: "component-collect:worker",
    });
    expect(first.asserted).toHaveLength(0);
    expect(first.collect?.collectUrl).toMatch(/^\/collect\?token=/);
    expect(first.collect?.reused).toBe(false);
    expect(first.collect?.token).not.toBe(host.collect?.token);

    const token = first.collect!.token;
    const hostRunForComponentToken = await t.run(async (ctx) => {
      return await ctx.db
        .query("flowRuns")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();
    });
    expect(hostRunForComponentToken).toBeNull();

    expect(await t.query(api.forms.collectionByToken, { token })).toMatchObject({
      title: "Owned I-9",
      fields: [
        expect.objectContaining({
          name: "worker.legalName",
          label: "Legal name",
        }),
      ],
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
    expect(await t.query(api.forms.collectionByToken, { token })).toEqual({
      found: false,
      reason: "used",
    });
    expect(
      await t.mutation(api.forms.submitCollection, {
        token,
        values: { "worker.legalName": "Second Submit" },
      }),
    ).toEqual({ ok: false, reason: "already submitted" });

    const componentEntity = await t.query(
      api.metacrdtComponent.getOwnedCurrentEntity,
      { e: "component-collect:worker" },
    );
    expect(componentEntity?.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          a: "submitted.owned_i9",
          values: ["component-collect:worker"],
        }),
        expect.objectContaining({
          a: "owned_i9/worker.legalName",
          values: ["Component Worker"],
        }),
      ]),
    );

    const hostEntity = await t.query(api.facts.getEntity, {
      e: "component-collect:worker",
    });
    expect(hostEntity.attributes["submitted.owned_i9"]).toBeUndefined();
    expect(hostEntity.attributes["owned_i9/worker.legalName"]).toBeUndefined();
  });

  test("component-owned collection tokens can expire before submission", async () => {
    vi.useFakeTimers();
    try {
      const t = mountedTest();

      await t.mutation(api.metacrdtComponent.defineOwnedForm, {
        form: "owned_expiring",
        title: "Owned Expiring Form",
        fields: [{ name: "field", label: "Field", type: "string" }],
      });
      await t.mutation(api.actions.defineAction, {
        name: "owned_expiring_collect",
        appliesTo: "Worker",
        asserts: {},
        opensForm: { form: "owned_expiring", scope: "$entity" },
      });
      await t.mutation(api.metacrdtComponent.createOwnedEntity, {
        e: "component-expire:worker",
        type: "Worker",
        name: "Expiring Worker",
      });

      const result = await t.mutation(api.metacrdtComponent.runOwnedAction, {
        action: "owned_expiring_collect",
        entity: "component-expire:worker",
      });
      const token = result.collect!.token;
      vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000);

      expect(await t.query(api.forms.collectionByToken, { token })).toEqual({
        found: false,
        reason: "expired",
      });
      expect(
        await t.mutation(api.forms.submitCollection, {
          token,
          values: { field: "late" },
        }),
      ).toEqual({ ok: false, reason: "expired token" });
    } finally {
      vi.useRealTimers();
    }
  });

  test("starts and lists standalone component-owned collect runs", async () => {
    const t = mountedTest();

    await t.mutation(api.metacrdtComponent.defineOwnedForm, {
      form: "owned_badge",
      title: "Owned Badge",
      fields: [{ name: "badgeId", label: "Badge ID", type: "string" }],
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-standalone:worker",
      type: "Worker",
      name: "Standalone Worker",
    });

    const first = await t.mutation(api.metacrdtComponent.startOwnedCollect, {
      subject: "component-standalone:worker",
      form: "owned_badge",
      scope: "client:acme",
    });
    expect(first.collectUrl).toMatch(/^\/collect\?token=/);
    expect(first.reused).toBe(false);

    const hostRunForComponentToken = await t.run(async (ctx) => {
      return await ctx.db
        .query("flowRuns")
        .withIndex("by_token", (q) => q.eq("token", first.token))
        .first();
    });
    expect(hostRunForComponentToken).toBeNull();

    const second = await t.mutation(api.metacrdtComponent.startOwnedCollect, {
      subject: "component-standalone:worker",
      form: "owned_badge",
      scope: "client:acme",
    });
    expect(second.token).toBe(first.token);
    expect(second.reused).toBe(true);

    const runs = await t.query(api.metacrdtComponent.listOwnedCollections, {
      subject: "component-standalone:worker",
    });
    expect(runs).toMatchObject([
      {
        runId: first.runId,
        subject: "component-standalone:worker",
        form: "owned_badge",
        scope: "client:acme",
        status: "waiting",
        token: first.token,
      },
    ]);
    expect(await t.query(api.forms.collectionByToken, { token: first.token })).toMatchObject({
      found: true,
      title: "Owned Badge",
      subject: "component-standalone:worker",
      form: "owned_badge",
      scope: "client:acme",
    });

    expect(
      await t.mutation(api.forms.submitCollection, {
        token: first.token,
        values: { badgeId: "B-123" },
      }),
    ).toEqual({ ok: true });

    const after = await t.query(api.metacrdtComponent.listOwnedCollections, {
      subject: "component-standalone:worker",
    });
    expect(after[0]).toMatchObject({
      runId: first.runId,
      status: "completed",
      context: { badgeId: "B-123" },
    });

    const entity = await t.query(api.metacrdtComponent.getOwnedCurrentEntity, {
      e: "component-standalone:worker",
    });
    expect(entity?.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          a: "owned_badge/badgeId",
          values: ["B-123"],
        }),
        expect.objectContaining({
          a: "submitted.owned_badge",
          values: ["client:acme"],
        }),
      ]),
    );
  });

  test("component-owned collection timers remind, escalate, expire, and no-op after submit", async () => {
    vi.useFakeTimers();
    try {
      const t = mountedTest();

      await t.mutation(api.metacrdtComponent.defineOwnedForm, {
        form: "owned_timer",
        title: "Owned Timer",
        fields: [{ name: "value", label: "Value", type: "string" }],
      });
      await t.mutation(api.metacrdtComponent.createOwnedEntity, {
        e: "component-timer:worker",
        type: "Worker",
        name: "Timer Worker",
      });

      const waiting = await t.mutation(api.metacrdtComponent.startOwnedCollect, {
        subject: "component-timer:worker",
        form: "owned_timer",
        scope: "client:acme",
        reminderSeconds: 1,
        escalateSeconds: 2,
      });
      await flush(t);

      const escalated = await t.query(api.metacrdtComponent.listOwnedCollections, {
        subject: "component-timer:worker",
      });
      expect(escalated).toContainEqual(
        expect.objectContaining({
          runId: waiting.runId,
          status: "waiting",
          step: "escalated",
          reminderSeconds: 1,
          escalateSeconds: 2,
          remindedAt: expect.any(Number),
          escalatedAt: expect.any(Number),
        }),
      );

      const expiring = await t.mutation(api.metacrdtComponent.startOwnedCollect, {
        subject: "component-timer:worker",
        form: "owned_timer",
        scope: "client:globex",
        reminderSeconds: 1,
        escalateSeconds: 2,
        expireSeconds: 3,
      });
      expect(
        await t.mutation(api.forms.submitCollection, {
          token: expiring.token,
          values: { value: "submitted before timers" },
        }),
      ).toEqual({ ok: true });
      await flush(t);

      const afterSubmit = await t.query(api.metacrdtComponent.listOwnedCollections, {
        subject: "component-timer:worker",
      });
      const completed = afterSubmit.find((run) => run.runId === expiring.runId);
      expect(completed).toMatchObject({
        status: "completed",
        context: { value: "submitted before timers" },
      });
      expect(completed?.remindedAt).toBeUndefined();
      expect(completed?.escalatedAt).toBeUndefined();
      expect(completed?.expiredAt).toBeUndefined();

      const expiringOpen = await t.mutation(api.metacrdtComponent.startOwnedCollect, {
        subject: "component-timer:worker",
        form: "owned_timer",
        scope: "client:initech",
        reminderSeconds: 1,
        escalateSeconds: 2,
        expireSeconds: 3,
      });
      await flush(t);

      const expired = await t.query(api.metacrdtComponent.listOwnedCollections, {
        subject: "component-timer:worker",
      });
      expect(expired).toContainEqual(
        expect.objectContaining({
          runId: expiringOpen.runId,
          status: "expired",
          step: "expired",
          expiredAt: expect.any(Number),
        }),
      );
      expect(
        await t.query(api.forms.collectionByToken, { token: expiringOpen.token }),
      ).toEqual({ found: false, reason: "expired" });
    } finally {
      vi.useRealTimers();
    }
  });

  test("plans component-owned compliance and issues missing collection runs", async () => {
    const t = mountedTest();

    await t.mutation(api.rules.defineRule, {
      name: "require.owned_i9",
      where: [
        ["?p", "type", "Placement"],
        ["?p", "worker", "?w"],
        ["?p", "employer", "?s"],
      ],
      emit: { e: "?w", a: "requires.owned_i9", v: "?s" },
      dependsOnAttributes: ["type", "worker", "employer"],
      materialization: "manual",
    });
    await t.mutation(api.rules.defineRule, {
      name: "require.owned_handbook",
      where: [
        ["?p", "type", "Placement"],
        ["?p", "worker", "?w"],
        ["?p", "client", "?s"],
      ],
      emit: { e: "?w", a: "requires.owned_handbook", v: "?s" },
      dependsOnAttributes: ["type", "worker", "client"],
      materialization: "manual",
    });
    await t.mutation(api.metacrdtComponent.defineOwnedForm, {
      form: "owned_i9",
      title: "Owned I-9",
      fields: [{ name: "legalName", label: "Legal name", type: "string" }],
    });
    await t.mutation(api.metacrdtComponent.defineOwnedForm, {
      form: "owned_handbook",
      title: "Owned Handbook",
      fields: [{ name: "ack", label: "Acknowledged", type: "boolean" }],
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-compliance:worker",
      type: "Worker",
      name: "Compliance Worker",
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-compliance:employer",
      type: "Employer",
      name: "Compliance Employer",
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-compliance:client",
      type: "Client",
      name: "Compliance Client",
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-compliance:placement",
      type: "Placement",
      attributes: [
        { a: "worker", value: "component-compliance:worker" },
        { a: "employer", value: "component-compliance:employer" },
        { a: "client", value: "component-compliance:client" },
      ],
    });

    const initial = await t.query(api.metacrdtComponent.ownedCompliancePlan, {
      worker: "component-compliance:worker",
    });
    expect(initial.summary).toEqual({
      reuse: 0,
      collect: 2,
      total: 2,
      unsupported: 0,
    });
    expect(initial.items.map((item) => `${item.form}@${item.scope}`).sort()).toEqual([
      "owned_handbook@component-compliance:client",
      "owned_i9@component-compliance:employer",
    ]);
    expect(initial.items.every((item) => item.decision === "collect")).toBe(true);

    const issued = await t.mutation(
      api.metacrdtComponent.issueOwnedOpenCollections,
      { worker: "component-compliance:worker" },
    );
    expect(issued.issued).toBe(2);
    expect(issued.reused).toBe(0);
    const i9 = issued.items.find((item) => item.form === "owned_i9")!;
    const handbook = issued.items.find((item) => item.form === "owned_handbook")!;
    expect(i9.collectUrl).toMatch(/^\/collect\?token=/);
    expect(handbook.collectUrl).toMatch(/^\/collect\?token=/);

    const hostRunsForComponentTokens = await t.run(async (ctx) => {
      const rows = [];
      for (const token of issued.items.map((item) => item.token)) {
        rows.push(
          await ctx.db
            .query("flowRuns")
            .withIndex("by_token", (q) => q.eq("token", token))
            .first(),
        );
      }
      return rows;
    });
    expect(hostRunsForComponentTokens).toEqual([null, null]);

    const secondIssue = await t.mutation(
      api.metacrdtComponent.issueOwnedOpenCollections,
      { worker: "component-compliance:worker" },
    );
    expect(secondIssue.issued).toBe(0);
    expect(secondIssue.reused).toBe(2);
    expect(secondIssue.items.map((item) => item.token).sort()).toEqual(
      issued.items.map((item) => item.token).sort(),
    );

    await t.mutation(api.forms.submitCollection, {
      token: i9.token,
      values: { legalName: "Compliance Worker" },
    });

    const afterSubmission = await t.query(
      api.metacrdtComponent.ownedCompliancePlan,
      { worker: "component-compliance:worker" },
    );
    expect(afterSubmission.summary).toEqual({
      reuse: 1,
      collect: 1,
      total: 2,
      unsupported: 0,
    });
    expect(
      afterSubmission.items.find((item) => item.form === "owned_i9"),
    ).toMatchObject({
      decision: "reuse",
      scope: "component-compliance:employer",
      placements: ["component-compliance:placement"],
    });
    expect(
      afterSubmission.items.find((item) => item.form === "owned_handbook"),
    ).toMatchObject({
      decision: "collect",
      scope: "component-compliance:client",
    });

    const componentEntity = await t.query(
      api.metacrdtComponent.getOwnedCurrentEntity,
      { e: "component-compliance:worker" },
    );
    expect(componentEntity?.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          a: "submitted.owned_i9",
          values: ["component-compliance:employer"],
        }),
      ]),
    );
  });

  test("component-owned compliance reports unsupported requirement shapes", async () => {
    const t = mountedTest();

    await t.mutation(api.rules.defineRule, {
      name: "require.bad_component_shape",
      where: [["?x", "type", "Worker"]],
      emit: { e: "?w", a: "requires.bad_component_shape", v: "?s" },
      dependsOnAttributes: ["type"],
      materialization: "manual",
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-compliance-unsupported:worker",
      type: "Worker",
      name: "Unsupported Worker",
    });

    const plan = await t.query(api.metacrdtComponent.ownedCompliancePlan, {
      worker: "component-compliance-unsupported:worker",
    });
    expect(plan.items).toEqual([]);
    expect(plan.summary).toEqual({
      reuse: 0,
      collect: 0,
      total: 0,
      unsupported: 1,
    });
    expect(plan.unsupported).toMatchObject([
      {
        rule: "require.bad_component_shape",
        reason: "missing Placement type or worker clause",
      },
    ]);
  });

  test("materializes component-owned compliance requirements and retracts stale tasks", async () => {
    const t = mountedTest();

    await t.mutation(api.rules.defineRule, {
      name: "require.materialized_i9",
      where: [
        ["?p", "type", "Placement"],
        ["?p", "worker", "?w"],
        ["?p", "employer", "?s"],
      ],
      emit: { e: "?w", a: "requires.materialized_i9", v: "?s" },
      dependsOnAttributes: ["type", "worker", "employer"],
      materialization: "manual",
    });
    await t.mutation(api.rules.defineRule, {
      name: "require.materialized_handbook",
      where: [
        ["?p", "type", "Placement"],
        ["?p", "worker", "?w"],
        ["?p", "client", "?s"],
      ],
      emit: { e: "?w", a: "requires.materialized_handbook", v: "?s" },
      dependsOnAttributes: ["type", "worker", "client"],
      materialization: "manual",
    });
    await t.mutation(api.metacrdtComponent.defineOwnedForm, {
      form: "materialized_i9",
      title: "Materialized I-9",
      fields: [{ name: "legalName", label: "Legal name", type: "string" }],
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-materialize:worker",
      type: "Worker",
      name: "Materialize Worker",
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-materialize:employer",
      type: "Employer",
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-materialize:client",
      type: "Client",
    });
    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-materialize:placement",
      type: "Placement",
      attributes: [
        { a: "worker", value: "component-materialize:worker" },
        { a: "employer", value: "component-materialize:employer" },
        { a: "client", value: "component-materialize:client" },
      ],
    });

    const initial = await t.mutation(
      api.metacrdtComponent.materializeOwnedCompliance,
      { worker: "component-materialize:worker" },
    );
    expect(initial.summary).toEqual({
      requires: 2,
      tasks: 2,
      asserted: 4,
      retracted: 0,
      kept: 0,
    });

    let entity = await t.query(api.metacrdtComponent.getOwnedCurrentEntity, {
      e: "component-materialize:worker",
    });
    expect(entity?.attributes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          a: "requires.materialized_i9",
          values: ["component-materialize:employer"],
        }),
        expect.objectContaining({
          a: "task.materialized_i9",
          values: ["component-materialize:employer"],
        }),
        expect.objectContaining({
          a: "requires.materialized_handbook",
          values: ["component-materialize:client"],
        }),
        expect.objectContaining({
          a: "task.materialized_handbook",
          values: ["component-materialize:client"],
        }),
      ]),
    );

    const issued = await t.mutation(
      api.metacrdtComponent.issueOwnedOpenCollections,
      { worker: "component-materialize:worker" },
    );
    const i9 = issued.items.find((item) => item.form === "materialized_i9")!;
    await t.mutation(api.forms.submitCollection, {
      token: i9.token,
      values: { legalName: "Materialize Worker" },
    });

    const afterReuse = await t.mutation(
      api.metacrdtComponent.materializeOwnedCompliance,
      { worker: "component-materialize:worker" },
    );
    expect(afterReuse.summary).toEqual({
      requires: 2,
      tasks: 1,
      asserted: 0,
      retracted: 1,
      kept: 3,
    });

    entity = await t.query(api.metacrdtComponent.getOwnedCurrentEntity, {
      e: "component-materialize:worker",
    });
    const attrs = entity?.attributes ?? [];
    expect(attrs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          a: "submitted.materialized_i9",
          values: ["component-materialize:employer"],
        }),
        expect.objectContaining({
          a: "requires.materialized_i9",
          values: ["component-materialize:employer"],
        }),
        expect.objectContaining({
          a: "requires.materialized_handbook",
          values: ["component-materialize:client"],
        }),
        expect.objectContaining({
          a: "task.materialized_handbook",
          values: ["component-materialize:client"],
        }),
      ]),
    );
    expect(attrs.find((attr) => attr.a === "task.materialized_i9")).toBeUndefined();

    const events = await t.query(api.metacrdtComponent.listOwnedEvents, {
      e: "component-materialize:worker",
      a: "task.materialized_i9",
      limit: 10,
    });
    expect(events.map((event) => event.kind).sort()).toEqual([
      "assert",
      "retract",
    ]);
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
