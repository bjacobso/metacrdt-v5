import type { Value } from "@metacrdt/core";
import type { EmitSpec } from "@metacrdt/query";
import type { ScheduledOperation } from "@metacrdt/runtime";

export const FLOW_RUN_STATUS_ATTR = "flow.run.status";
export const FLOW_STEP_TYPES = [
  "assert",
  "collect",
  "notify",
  "branch",
  "action",
  "wait",
  "done",
] as const;

export type StepType = (typeof FLOW_STEP_TYPES)[number];
export type StepConfig = Record<string, unknown>;

export type FlowStep = {
  readonly id: string;
  readonly type: StepType;
  readonly config?: StepConfig;
  readonly next?: string;
};

export type FlowDef = {
  readonly name: string;
  readonly title?: string;
  readonly subjectType?: string;
  readonly startStepId: string;
  readonly steps: readonly FlowStep[];
  readonly origin?: "configured" | "component" | "system";
};

export type FlowRunStatus =
  | "running"
  | "waiting"
  | "completed"
  | "expired"
  | "cancelled"
  | "failed";

export type FlowRun = {
  readonly id?: string;
  readonly flowName?: string;
  readonly flowDefName?: string;
  readonly subject: string;
  readonly status: FlowRunStatus;
  readonly step?: string;
  readonly currentStepId?: string;
  readonly context?: Record<string, unknown>;
  readonly form?: string;
  readonly scope?: string;
};

export type WaitKey = {
  readonly subject: string;
  readonly form: string;
  readonly scope: string;
};

export type TimerSpec =
  | { readonly kind: "collect-reminder"; readonly afterMs: number }
  | { readonly kind: "collect-escalate"; readonly afterMs: number }
  | { readonly kind: "collect-expire"; readonly afterMs: number }
  | { readonly kind: "wait"; readonly afterMs: number }
  | { readonly kind: "action"; readonly afterMs: number };

export type StepIntent =
  | { readonly kind: "assert"; readonly stepId: string; readonly e: string; readonly a: string; readonly v: Value }
  | { readonly kind: "log"; readonly stepId: string; readonly event: string; readonly message?: string }
  | {
      readonly kind: "park";
      readonly stepId: string;
      readonly reason: "collect" | "wait" | "action";
      readonly waitKey?: WaitKey;
      readonly timers?: readonly TimerSpec[];
    }
  | {
      readonly kind: "branch";
      readonly stepId: string;
      readonly where: readonly unknown[];
      readonly subjectVar: string;
    }
  | { readonly kind: "schedule"; readonly op: ScheduledOperation; readonly afterMs: number }
  | { readonly kind: "jump"; readonly stepId: string }
  | { readonly kind: "complete"; readonly stepId: string }
  | { readonly kind: "expire" | "cancel" };

export type StepEnv = {
  readonly now?: number;
  readonly maxSteps?: number;
  readonly branchResults?: Readonly<Record<string, boolean>>;
  readonly runId?: string;
  readonly valueResolver?: (raw: unknown, run: Pick<FlowRun, "subject" | "context">) => unknown;
  readonly stopAfterStep?: boolean;
};

export type StepFlowResult = {
  readonly run: FlowRun;
  readonly intents: readonly StepIntent[];
};

export type FlowValidationDiagnostic = {
  readonly code:
    | "missing-start"
    | "duplicate-step"
    | "dangling-target"
    | "unreachable-step"
    | "cycle";
  readonly stepId?: string;
  readonly target?: string;
  readonly message: string;
};

export type FlowValidationResult =
  | { readonly ok: true; readonly diagnostics: readonly [] }
  | { readonly ok: false; readonly diagnostics: readonly FlowValidationDiagnostic[] };

export type FlowFact = {
  readonly e: string;
  readonly a: string;
  readonly value: Value;
};

export type FlowDefRow = {
  readonly name: string;
  readonly title?: string;
  readonly subjectType?: string;
  readonly origin: "configured" | "component" | "system";
  readonly startStepId: string;
  readonly steps: readonly FlowStep[];
};

export function flowEntity(name: string): string {
  return `flow:${name}`;
}

export function flowRunEntity(runId: string): string {
  return `flowRun:${runId}`;
}

export function resolveVal(raw: unknown, run: Pick<FlowRun, "subject" | "context">): unknown {
  if (typeof raw !== "string") return raw;
  if (raw === "$subject") return run.subject;
  if (raw.startsWith("$ctx.")) {
    const ctxObj = run.context ?? {};
    return ctxObj[raw.slice("$ctx.".length)];
  }
  return raw;
}

function isValue(value: unknown): value is Value {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isValue);
  if (typeof value !== "object" || value === undefined) return false;
  return Object.values(value as Record<string, unknown>).every(isValue);
}

function requireValue(value: unknown, label: string): Value {
  if (!isValue(value)) throw new Error(`${label} must be a JSON-compatible value`);
  return value;
}

function stepTargets(step: FlowStep): readonly string[] {
  const targets: string[] = [];
  if (step.next) targets.push(step.next);
  if (step.type === "branch") {
    const cfg = step.config ?? {};
    if (typeof cfg.ifTrue === "string" && cfg.ifTrue.length > 0) {
      targets.push(cfg.ifTrue);
    }
    if (typeof cfg.ifFalse === "string" && cfg.ifFalse.length > 0) {
      targets.push(cfg.ifFalse);
    }
  }
  return targets;
}

export function validateFlowDef(def: FlowDef): FlowValidationResult {
  const diagnostics: FlowValidationDiagnostic[] = [];
  const stepsById = new Map<string, FlowStep>();
  const duplicateIds = new Set<string>();

  for (const step of def.steps) {
    if (stepsById.has(step.id)) duplicateIds.add(step.id);
    stepsById.set(step.id, step);
  }
  for (const stepId of duplicateIds) {
    diagnostics.push({
      code: "duplicate-step",
      stepId,
      message: `duplicate step id: ${stepId}`,
    });
  }
  if (!stepsById.has(def.startStepId)) {
    diagnostics.push({
      code: "missing-start",
      target: def.startStepId,
      message: `start step does not exist: ${def.startStepId}`,
    });
  }

  for (const step of def.steps) {
    for (const target of stepTargets(step)) {
      if (!stepsById.has(target)) {
        diagnostics.push({
          code: "dangling-target",
          stepId: step.id,
          target,
          message: `step ${step.id} targets missing step ${target}`,
        });
      }
    }
  }

  const reachable = new Set<string>();
  const visitReachable = (stepId: string) => {
    if (reachable.has(stepId)) return;
    const step = stepsById.get(stepId);
    if (!step) return;
    reachable.add(stepId);
    for (const target of stepTargets(step)) visitReachable(target);
  };
  visitReachable(def.startStepId);
  for (const step of def.steps) {
    if (!reachable.has(step.id)) {
      diagnostics.push({
        code: "unreachable-step",
        stepId: step.id,
        message: `step is unreachable from start: ${step.id}`,
      });
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const findCycle = (stepId: string, path: readonly string[]): void => {
    if (visiting.has(stepId)) {
      diagnostics.push({
        code: "cycle",
        stepId,
        message: `cycle detected: ${[...path, stepId].join(" -> ")}`,
      });
      return;
    }
    if (visited.has(stepId)) return;
    const step = stepsById.get(stepId);
    if (!step) return;
    visiting.add(stepId);
    for (const target of stepTargets(step)) findCycle(target, [...path, stepId]);
    visiting.delete(stepId);
    visited.add(stepId);
  };
  findCycle(def.startStepId, []);

  return diagnostics.length === 0
    ? { ok: true, diagnostics: [] }
    : { ok: false, diagnostics };
}

export function waitKey(subject: string, form: string, scope: string): WaitKey {
  return { subject, form, scope };
}

export function submittedAttr(form: string): string {
  return `submitted.${form}`;
}

export function waitKeyFromSubmission(
  subject: string,
  attr: string,
  scope: string,
): WaitKey | null {
  if (!attr.startsWith("submitted.")) return null;
  const form = attr.slice("submitted.".length);
  if (form.length === 0) return null;
  return waitKey(subject, form, scope);
}

export function submissionFromWaitKey(key: WaitKey): {
  readonly e: string;
  readonly a: string;
  readonly value: string;
} {
  return { e: key.subject, a: submittedAttr(key.form), value: key.scope };
}

export function serializeWaitKey(key: WaitKey): string {
  return JSON.stringify([key.subject, key.form, key.scope]);
}

export function parseWaitKey(serialized: string): WaitKey {
  const parsed = JSON.parse(serialized) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.length !== 3 ||
    parsed.some((part) => typeof part !== "string")
  ) {
    throw new Error("invalid wait key");
  }
  return waitKey(parsed[0], parsed[1], parsed[2]);
}

export function flowDefRow(def: FlowDef): FlowDefRow {
  return {
    name: def.name,
    ...(def.title === undefined ? {} : { title: def.title }),
    ...(def.subjectType === undefined ? {} : { subjectType: def.subjectType }),
    origin: def.origin ?? "configured",
    startStepId: def.startStepId,
    steps: def.steps.map((step) => ({
      id: step.id,
      type: step.type,
      ...(step.config === undefined ? {} : { config: { ...step.config } }),
      ...(step.next === undefined ? {} : { next: step.next }),
    })),
  };
}

export function flowDefFacts(def: FlowDef): readonly FlowFact[] {
  const row = flowDefRow(def);
  return [
    { e: flowEntity(def.name), a: "type", value: "FlowDef" },
    {
      e: flowEntity(def.name),
      a: "flowDef",
      value: {
        name: row.name,
        ...(row.title === undefined ? {} : { title: row.title }),
        ...(row.subjectType === undefined ? {} : { subjectType: row.subjectType }),
        origin: row.origin,
        startStepId: row.startStepId,
        steps: row.steps.map((step) => ({
          id: step.id,
          type: step.type,
          ...(step.config === undefined ? {} : { config: step.config as Value }),
          ...(step.next === undefined ? {} : { next: step.next }),
        })),
      },
    },
  ];
}

export function requirementEmitForFlow(form: string): EmitSpec {
  return { e: "?w", a: `requires.${form}`, v: "?s" };
}

function patchRun(
  run: FlowRun,
  fields: Partial<FlowRun>,
): FlowRun {
  return { ...run, ...fields };
}

function completeRun(run: FlowRun, stepId: string, intents: StepIntent[]): StepFlowResult {
  return {
    run: patchRun(run, { status: "completed", step: stepId, currentStepId: stepId }),
    intents: [...intents, { kind: "complete", stepId }, { kind: "log", stepId, event: "completed" }],
  };
}

function resolveStepValue(raw: unknown, run: FlowRun, env: StepEnv): unknown {
  return env.valueResolver ? env.valueResolver(raw, run) : resolveVal(raw, run);
}

export function stepFlow(def: FlowDef, run: FlowRun, env: StepEnv = {}): StepFlowResult {
  const stepsById = new Map(def.steps.map((step) => [step.id, step]));
  const maxSteps = env.maxSteps ?? 50;
  let currentRun = run;
  let stepId = currentRun.currentStepId ?? def.startStepId;
  const intents: StepIntent[] = [];

  for (let i = 0; i < maxSteps; i++) {
    const step = stepsById.get(stepId);
    if (!step || step.type === "done") {
      return completeRun(currentRun, stepId || "done", intents);
    }
    const cfg = step.config ?? {};

    if (step.type === "assert") {
      const e = String(resolveStepValue(cfg.e ?? "$subject", currentRun, env));
      const a = String(cfg.a);
      const v = requireValue(resolveStepValue(cfg.v, currentRun, env), `step ${step.id} assert value`);
      intents.push({ kind: "assert", stepId: step.id, e, a, v });
      intents.push({ kind: "log", stepId: step.id, event: "assert", message: `${a} = ${JSON.stringify(v)}` });
    } else if (step.type === "notify") {
      intents.push({ kind: "log", stepId: step.id, event: "notify", message: String(cfg.message ?? "") });
    } else if (step.type === "branch") {
      if (!Object.prototype.hasOwnProperty.call(env.branchResults ?? {}, step.id)) {
        intents.push({
          kind: "branch",
          stepId: step.id,
          where: Array.isArray(cfg.where) ? cfg.where : [],
          subjectVar: String(cfg.subjectVar ?? "s"),
        });
        return { run: currentRun, intents };
      }
      const taken = env.branchResults?.[step.id] ?? false;
      stepId = String((taken ? cfg.ifTrue : cfg.ifFalse) ?? "");
      intents.push({
        kind: "log",
        stepId: step.id,
        event: "branch",
        message: taken ? `true -> ${stepId}` : `false -> ${stepId}`,
      });
      if (!stepId) return completeRun(currentRun, "done", intents);
      currentRun = patchRun(currentRun, { currentStepId: stepId, step: stepId });
      intents.push({ kind: "jump", stepId });
      if (env.stopAfterStep) return { run: currentRun, intents };
      continue;
    } else if (step.type === "collect") {
      const form = String(cfg.form);
      const scope = String(resolveStepValue(cfg.scope ?? `$ctx.${String(cfg.scopeFrom)}`, currentRun, env) ?? "");
      const timers: TimerSpec[] = [];
      if (typeof cfg.reminderSeconds === "number") {
        timers.push({ kind: "collect-reminder", afterMs: cfg.reminderSeconds * 1000 });
      }
      if (typeof cfg.escalateSeconds === "number") {
        timers.push({ kind: "collect-escalate", afterMs: cfg.escalateSeconds * 1000 });
      }
      if (typeof cfg.expireSeconds === "number") {
        timers.push({ kind: "collect-expire", afterMs: cfg.expireSeconds * 1000 });
      }
      currentRun = patchRun(currentRun, {
        status: "waiting",
        step: step.id,
        currentStepId: step.id,
        form,
        scope,
      });
      intents.push({ kind: "log", stepId: step.id, event: "issued", message: `collect ${form} for ${scope}` });
      intents.push({
        kind: "park",
        stepId: step.id,
        reason: "collect",
        waitKey: waitKey(currentRun.subject, form, scope),
        timers,
      });
      return { run: currentRun, intents };
    } else if (step.type === "wait") {
      const afterMs = Number(cfg.seconds ?? 5) * 1000;
      currentRun = patchRun(currentRun, {
        status: "waiting",
        step: step.id,
        currentStepId: step.id,
      });
      intents.push({ kind: "log", stepId: step.id, event: "wait", message: `${cfg.seconds ?? 5}s` });
      intents.push({ kind: "park", stepId: step.id, reason: "wait", timers: [{ kind: "wait", afterMs }] });
      intents.push({
        kind: "schedule",
        afterMs,
        op: { op: "flow.resume", payload: { runId: env.runId ?? run.id, stepId: step.id } },
      });
      return { run: currentRun, intents };
    } else if (step.type === "action") {
      const afterMs = Number(cfg.delaySeconds ?? 1) * 1000;
      currentRun = patchRun(currentRun, {
        status: "waiting",
        step: step.id,
        currentStepId: step.id,
      });
      intents.push({
        kind: "log",
        stepId: step.id,
        event: "action",
        message: String(cfg.label ?? "external action"),
      });
      intents.push({ kind: "park", stepId: step.id, reason: "action", timers: [{ kind: "action", afterMs }] });
      intents.push({
        kind: "schedule",
        afterMs,
        op: { op: "flow.action", payload: { runId: env.runId ?? run.id, stepId: step.id } },
      });
      return { run: currentRun, intents };
    }

    stepId = step.next ?? "";
    if (!stepId) return completeRun(currentRun, "done", intents);
    currentRun = patchRun(currentRun, { currentStepId: stepId, step: stepId });
    if (env.stopAfterStep) return { run: currentRun, intents };
  }

  throw new Error(`flow exceeded ${maxSteps} steps`);
}
