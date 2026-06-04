/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("collect-step flow runner", () => {
  test("a submission resumes the waiting run to completed", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const { runId } = await t.mutation(api.flows.startCollect, {
        subject: "worker:maria",
        form: "i9",
        scope: "employer:acme",
      });

      let flows = await t.query(api.flows.listFlows, { subject: "worker:maria" });
      expect(flows[0].status).toBe("waiting");
      expect(flows[0].events.some((e) => e.kind === "issued")).toBe(true);

      // Submitting the form asserts the fact; the event path resumes the run.
      // (Reminder/escalate ticks also fire here but no-op once completed.)
      await t.mutation(api.compliance.submitForm, {
        worker: "worker:maria",
        form: "i9",
        scope: "employer:acme",
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      flows = await t.query(api.flows.listFlows, { subject: "worker:maria" });
      const run = flows.find((f) => f._id === runId)!;
      expect(run.status).toBe("completed");
      expect(run.events.some((e) => e.kind === "completed")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("startCollect does not double-issue for the same target", async () => {
    const t = convexTest(schema, modules);
    const a = await t.mutation(api.flows.startCollect, {
      subject: "w:1",
      form: "i9",
      scope: "e:1",
    });
    const b = await t.mutation(api.flows.startCollect, {
      subject: "w:1",
      form: "i9",
      scope: "e:1",
    });
    expect(b.reused).toBe(true);
    expect(b.runId).toBe(a.runId);
  });

  test("timer ticks fire reminder then escalation while waiting", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await t.mutation(api.flows.startCollect, {
        subject: "w:2",
        form: "handbook",
        scope: "c:1",
        reminderSeconds: 1,
        escalateSeconds: 2,
      });
      // Advance through all timers (no submission → run stays waiting).
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const flows = await t.query(api.flows.listFlows, { subject: "w:2" });
      const kinds = flows[0].events.map((e) => e.kind);
      expect(kinds).toContain("reminder");
      expect(kinds).toContain("escalated");
      expect(flows[0].status).toBe("waiting");
    } finally {
      vi.useRealTimers();
    }
  });

  test("expiry tick moves an unattended run to expired", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const { runId } = await t.mutation(api.flows.startCollect, {
        subject: "w:3",
        form: "i9",
        scope: "e:9",
        reminderSeconds: 1,
        escalateSeconds: 2,
        expireSeconds: 3,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const flows = await t.query(api.flows.listFlows, { subject: "w:3" });
      expect(flows.find((f) => f._id === runId)!.status).toBe("expired");
    } finally {
      vi.useRealTimers();
    }
  });

  test("issueAllOpen creates a run per open obligation", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await t.mutation(api.compliance.setupComplianceRules, {});
      await t.mutation(api.compliance.seedStaffingDemo, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const { issued } = await t.mutation(api.flows.issueAllOpen, {
        subject: "worker:maria",
      });
      expect(issued).toBe(5); // i9, handbook×2, forklift, venue_disclosure
      const flows = await t.query(api.flows.listFlows, { subject: "worker:maria" });
      expect(flows.filter((f) => f.status === "waiting").length).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });
});
