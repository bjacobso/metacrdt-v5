import { describe, expect, test } from "vitest";
import {
  runCollectConformance,
  runWorkflowConformance,
} from "@metacrdt/testkit";
import {
  createDurableObjectSqliteCurrentSurface,
  createDurableObjectSqliteRuntime,
} from "./index.js";
import { FakeDurableObjectSqlStorage } from "./sqliteFake.test-support.js";

const coord = { txTime: 10_000, validTime: 10_000 };
const cardinalityOf = (a: string) => (a === "workflow.tag" ? "many" : "one");

describe("Cloudflare workflow/collect conformance", () => {
  test("runs the shared workflow semantics suite", async () => {
    const report = await runWorkflowConformance({ name: "cloudflare" });
    expect(report.checks).toContain("branch-routes-true-to-assert");
    expect(report.checks).toContain("done-step-completes");
  });

  test("runs the shared collect semantics suite", async () => {
    const report = await runCollectConformance({ name: "cloudflare" });
    expect(report.checks).toContain("form-definition-facts");
    expect(report.checks).toContain("token-expiry-predicates");
  });

  test("runs workflow semantics through the SQLite target executor", async () => {
    const runtime = await createDurableObjectSqliteRuntime({
      sql: new FakeDurableObjectSqlStorage(),
      replicaId: "do-sqlite:workflow-conformance",
      wall: () => 1_000,
    });
    const surface = createDurableObjectSqliteCurrentSurface(runtime, {
      cardinalityOf,
      currentCoord: () => coord,
    });

    await surface.appendAssert({
      e: "worker:workflow-conformance",
      a: "type",
      v: "Worker",
      actor: "test",
    });

    const asserted = await surface.executeFlow({
      runId: "dag:workflow-conformance:assert",
      flowDefName: "workflow_conformance_assert",
      subject: "worker:workflow-conformance",
      subjectType: "Worker",
      eventIdPrefix: "dag:event:workflow-conformance:assert",
      actor: "system:workflow",
      now: 11_000,
      context: { status: "active" },
      steps: [
        {
          id: "mark",
          type: "assert",
          config: { a: "workflow.status", v: "$ctx.status" },
          next: "branch",
        },
        {
          id: "branch",
          type: "branch",
          config: {
            where: [["?s", "workflow.status", "active"]],
            ifTrue: "done",
            ifFalse: "unsupported",
          },
        },
        { id: "done", type: "done" },
      ],
    });
    expect(asserted.run).toMatchObject({
      status: "completed",
      currentStepId: "done",
    });
    expect(asserted.steps.map((step) => step.kind)).toEqual([
      "asserted",
      "branch",
      "completed",
    ]);

    const collected = await surface.executeFlow({
      runId: "dag:workflow-conformance:collect",
      flowDefName: "workflow_conformance_collect",
      subject: "worker:workflow-conformance",
      subjectType: "Worker",
      eventIdPrefix: "dag:event:workflow-conformance:collect",
      actor: "system:workflow",
      now: 12_000,
      context: { employer: "employer:acme" },
      steps: [
        {
          id: "collect",
          type: "collect",
          config: {
            form: "i9",
            scopeFrom: "employer",
            collectionToken: "collection:workflow-conformance:i9",
          },
          next: "done",
        },
        { id: "done", type: "done" },
      ],
    });
    expect(collected.run).toMatchObject({
      status: "waiting",
      currentStepId: "collect",
    });
    expect(collected.collections[0]).toMatchObject({
      token: "collection:workflow-conformance:i9",
      form: "i9",
      scope: "employer:acme",
    });

    const waiting = await surface.executeFlow({
      runId: "dag:workflow-conformance:wait",
      flowDefName: "workflow_conformance_wait",
      subject: "worker:workflow-conformance",
      subjectType: "Worker",
      eventIdPrefix: "dag:event:workflow-conformance:wait",
      actor: "system:workflow",
      now: 13_000,
      steps: [
        {
          id: "pause",
          type: "wait",
          config: {
            id: "flow-wait:workflow-conformance:pause",
            fireAt: 15_000,
          },
          next: "done",
        },
        { id: "done", type: "done" },
      ],
    });
    expect(waiting.run).toMatchObject({
      status: "waiting",
      currentStepId: "pause",
    });
    expect(waiting.waitTicks[0]).toMatchObject({
      id: "flow-wait:workflow-conformance:pause",
      fireAt: 15_000,
    });

    await surface.upsertFlowDefinition({
      name: "workflow_conformance_registered",
      subjectType: "Worker",
      steps: [
        {
          id: "mark",
          type: "assert",
          config: { a: "workflow.registered", v: true },
          next: "done",
        },
        { id: "done", type: "done" },
      ],
    });
    const registered = await surface.executeRegisteredFlow({
      name: "workflow_conformance_registered",
      subject: "worker:workflow-conformance",
      runId: "dag:workflow-conformance:registered",
      eventIdPrefix: "dag:event:workflow-conformance:registered",
      actor: "system:workflow",
      now: 14_000,
    });
    expect(registered.run).toMatchObject({
      status: "completed",
      currentStepId: "done",
    });
  });
});
