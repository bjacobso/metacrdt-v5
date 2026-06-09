import { describe, expect, test } from "vitest";
import {
  FLOW_RUN_STATUS_ATTR,
  flowDefFacts,
  flowDefRow,
  flowEntity,
  flowRunEntity,
  parseWaitKey,
  requirementEmitForFlow,
  resolveVal,
  serializeWaitKey,
  stepFlow,
  submissionFromWaitKey,
  submittedAttr,
  validateFlowDef,
  waitKey,
  waitKeyFromSubmission,
  type FlowDef,
  type FlowRun,
} from "./index.js";

const def: FlowDef = {
  name: "onboarding",
  title: "Worker onboarding",
  subjectType: "Worker",
  startStepId: "start",
  steps: [
    { id: "start", type: "assert", config: { a: "stage", v: "started" }, next: "branch" },
    {
      id: "branch",
      type: "branch",
      config: { ifTrue: "collect", ifFalse: "notify" },
    },
    {
      id: "collect",
      type: "collect",
      config: { form: "i9", scopeFrom: "employer", reminderSeconds: 10 },
      next: "done",
    },
    { id: "notify", type: "notify", config: { message: "Welcome" }, next: "done" },
    { id: "done", type: "done" },
  ],
};

const run: FlowRun = {
  id: "run:1",
  subject: "worker:maria",
  status: "running",
  currentStepId: "start",
  context: { employer: "employer:acme", nested: ["a", "b"] },
};

describe("@metacrdt/workflow", () => {
  test("entity helpers expose canonical ids and status attr", () => {
    expect(FLOW_RUN_STATUS_ATTR).toBe("flow.run.status");
    expect(flowEntity("onboarding")).toBe("flow:onboarding");
    expect(flowRunEntity("abc")).toBe("flowRun:abc");
  });

  test("resolveVal resolves subject, context keys, and literals", () => {
    expect(resolveVal("$subject", run)).toBe("worker:maria");
    expect(resolveVal("$ctx.employer", run)).toBe("employer:acme");
    expect(resolveVal("$ctx.nested", run)).toEqual(["a", "b"]);
    expect(resolveVal("literal", run)).toBe("literal");
    expect(resolveVal(42, run)).toBe(42);
  });

  test("validateFlowDef accepts a reachable acyclic DAG", () => {
    expect(validateFlowDef(def)).toEqual({ ok: true, diagnostics: [] });
  });

  test("validateFlowDef reports missing starts, duplicate ids, dangling targets, and unreachable nodes", () => {
    const invalid: FlowDef = {
      name: "bad",
      startStepId: "missing",
      steps: [
        { id: "a", type: "notify", next: "b" },
        { id: "a", type: "notify" },
        { id: "b", type: "notify", next: "a" },
        { id: "orphan", type: "done" },
        { id: "dangling", type: "notify", next: "nope" },
      ],
    };
    const result = validateFlowDef(invalid);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diag) => diag.code)).toEqual([
      "duplicate-step",
      "missing-start",
      "dangling-target",
      "unreachable-step",
      "unreachable-step",
      "unreachable-step",
      "unreachable-step",
      "unreachable-step",
    ]);
  });

  test("validateFlowDef reports reachable cycles", () => {
    const cyclic: FlowDef = {
      name: "cycle",
      startStepId: "a",
      steps: [
        { id: "a", type: "notify", next: "b" },
        { id: "b", type: "notify", next: "a" },
      ],
    };
    const result = validateFlowDef(cyclic);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((diag) => diag.code)).toEqual(["cycle"]);
  });

  test("wait-key helpers round-trip submitted markers", () => {
    const key = waitKey("worker:maria", "i9", "employer:acme");
    expect(submittedAttr("i9")).toBe("submitted.i9");
    expect(waitKeyFromSubmission("worker:maria", "submitted.i9", "employer:acme"))
      .toEqual(key);
    expect(waitKeyFromSubmission("worker:maria", "other.i9", "employer:acme"))
      .toBeNull();
    expect(submissionFromWaitKey(key)).toEqual({
      e: "worker:maria",
      a: "submitted.i9",
      value: "employer:acme",
    });
    expect(parseWaitKey(serializeWaitKey(key))).toEqual(key);
  });

  test("flow-definition lowering returns row and manifest facts", () => {
    expect(flowDefRow(def)).toMatchObject({
      name: "onboarding",
      title: "Worker onboarding",
      subjectType: "Worker",
      origin: "configured",
      startStepId: "start",
    });
    expect(flowDefFacts(def)[0]).toEqual({
      e: "flow:onboarding",
      a: "type",
      value: "FlowDef",
    });
    expect(flowDefFacts(def)[1]).toMatchObject({
      e: "flow:onboarding",
      a: "flowDef",
      value: { name: "onboarding", startStepId: "start" },
    });
    expect(requirementEmitForFlow("i9")).toEqual({
      e: "?w",
      a: "requires.i9",
      v: "?s",
    });
  });

  test("stepFlow emits assert, branch, and collect intents", () => {
    const result = stepFlow(def, run, { branchResults: { branch: true }, runId: "run:1" });
    expect(result.run).toMatchObject({
      status: "waiting",
      step: "collect",
      currentStepId: "collect",
      form: "i9",
      scope: "employer:acme",
    });
    expect(result.intents).toEqual([
      { kind: "assert", stepId: "start", e: "worker:maria", a: "stage", v: "started" },
      { kind: "log", stepId: "start", event: "assert", message: "stage = \"started\"" },
      { kind: "log", stepId: "branch", event: "branch", message: "true -> collect" },
      { kind: "jump", stepId: "collect" },
      { kind: "log", stepId: "collect", event: "issued", message: "collect i9 for employer:acme" },
      {
        kind: "park",
        stepId: "collect",
        reason: "collect",
        waitKey: { subject: "worker:maria", form: "i9", scope: "employer:acme" },
        timers: [{ kind: "collect-reminder", afterMs: 10_000 }],
      },
    ]);
  });

  test("stepFlow asks the host to evaluate an unresolved branch", () => {
    const result = stepFlow(def, run);
    expect(result.run).toMatchObject({
      status: "running",
      step: "branch",
      currentStepId: "branch",
    });
    expect(result.intents).toEqual([
      { kind: "assert", stepId: "start", e: "worker:maria", a: "stage", v: "started" },
      { kind: "log", stepId: "start", event: "assert", message: "stage = \"started\"" },
      { kind: "branch", stepId: "branch", where: [], subjectVar: "s" },
    ]);
  });

  test("stepFlow branches false, notifies, and completes", () => {
    const result = stepFlow(def, run, { branchResults: { branch: false } });
    expect(result.run).toMatchObject({
      status: "completed",
      step: "done",
      currentStepId: "done",
    });
    expect(result.intents.map((intent) => intent.kind)).toEqual([
      "assert",
      "log",
      "log",
      "jump",
      "log",
      "complete",
      "log",
    ]);
  });

  test("stepFlow can stop after one non-parking step for target event writers", () => {
    const result = stepFlow(def, run, { stopAfterStep: true });
    expect(result.run).toMatchObject({
      status: "running",
      step: "branch",
      currentStepId: "branch",
    });
    expect(result.intents.map((intent) => intent.kind)).toEqual(["assert", "log"]);
  });

  test("stepFlow parks wait and action steps with schedule intents", () => {
    const waitDef: FlowDef = {
      name: "wait-flow",
      startStepId: "wait",
      steps: [
        { id: "wait", type: "wait", config: { seconds: 3 }, next: "action" },
        { id: "action", type: "action", config: { label: "Check", delaySeconds: 2 }, next: "done" },
        { id: "done", type: "done" },
      ],
    };
    const waiting = stepFlow(waitDef, { ...run, currentStepId: "wait" });
    expect(waiting.run.status).toBe("waiting");
    expect(waiting.intents[waiting.intents.length - 1]).toEqual({
      kind: "schedule",
      afterMs: 3_000,
      op: { op: "flow.resume", payload: { runId: "run:1", stepId: "wait" } },
    });

    const acting = stepFlow(waitDef, { ...run, currentStepId: "action" });
    expect(acting.run.status).toBe("waiting");
    expect(acting.intents[acting.intents.length - 1]).toEqual({
      kind: "schedule",
      afterMs: 2_000,
      op: { op: "flow.action", payload: { runId: "run:1", stepId: "action" } },
    });
  });

  test("stepFlow accepts a host value resolver", () => {
    const result = stepFlow(
      {
        name: "aliases",
        startStepId: "a",
        steps: [
          { id: "a", type: "assert", config: { a: "owner", v: "$entity" }, next: "done" },
          { id: "done", type: "done" },
        ],
      },
      { ...run, currentStepId: "a" },
      {
        valueResolver: (raw, currentRun) => raw === "$entity" ? currentRun.subject : resolveVal(raw, currentRun),
      },
    );
    expect(result.intents[0]).toEqual({
      kind: "assert",
      stepId: "a",
      e: "worker:maria",
      a: "owner",
      v: "worker:maria",
    });
  });
});
