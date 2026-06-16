/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const TENANT = "acme-staffing";

async function flush(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function bootstrap(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.mutation(api.tenants.ensureDemoTenants, {});
  await t.mutation(api.flows.setupDemoFlow, { tenantSlug: TENANT });
  await t.mutation(api.forms.defineForm, {
    tenantSlug: TENANT,
    form: "i9",
    title: "Form I-9",
    fields: [
      { name: "ssn", label: "SSN", type: "string", required: true },
      {
        name: "citizenship",
        label: "Citizenship",
        type: "select",
        options: ["citizen", "authorized_alien"],
        required: true,
      },
    ],
  });
}

async function runOnboarding(
  t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  subject: string,
  citizenship: string,
) {
  await t.mutation(api.flows.startFlow, {
    tenantSlug: TENANT,
    flowDefName: "onboarding",
    subject,
    context: { employer: "employer:acme" },
  });
  await flush(t); // parks at the collect step
  const token = (await t.query(api.flows.listFlows, {
    tenantSlug: TENANT,
    subject,
  }))[0].token!;
  await t.mutation(api.forms.submitCollection, {
    token,
    values: { ssn: "1", citizenship },
  });
  await flush(t); // resumes → branch → ... → done
  return (await t.query(api.flows.listFlows, {
    tenantSlug: TENANT,
    subject,
  }))[0];
}

describe("general flow DAG", () => {
  test("collect parks the run until submission", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await bootstrap(t);
      await t.mutation(api.flows.startFlow, {
        tenantSlug: TENANT,
        flowDefName: "onboarding",
        subject: "w:park",
        context: { employer: "employer:acme" },
      });
      await flush(t);
      const run = (await t.query(api.flows.listFlows, {
        tenantSlug: TENANT,
        subject: "w:park",
      }))[0];
      expect(run.status).toBe("waiting");
      expect(run.currentStepId).toBe("i9");
      expect(run.token).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  test("branch TRUE path runs the E-Verify action step", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await bootstrap(t);
      const run = await runOnboarding(t, "w:alien", "authorized_alien");

      expect(run.status).toBe("completed");
      const kinds = run.events.map((e) => e.kind);
      expect(kinds).toContain("branch");
      expect(kinds).toContain("action");
      expect(kinds).toContain("notify");
      // The action step recorded its result fact.
      const entity = await t.query(api.facts.getEntity, {
        tenantSlug: TENANT,
        e: "w:alien",
      });
      expect(entity.attributes["everify.status"]).toEqual(["verified"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("branch FALSE path skips the action step", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await bootstrap(t);
      const run = await runOnboarding(t, "w:citizen", "citizen");

      expect(run.status).toBe("completed");
      // No E-Verify action ran on the citizen path.
      const entity = await t.query(api.facts.getEntity, {
        tenantSlug: TENANT,
        e: "w:citizen",
      });
      expect(entity.attributes["everify.status"]).toBeUndefined();
      expect(run.events.some((e) => e.kind === "notify")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("assert + wait steps execute and complete", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await t.mutation(api.tenants.ensureDemoTenants, {});
      await t.mutation(api.flows.defineFlow, {
        tenantSlug: TENANT,
        name: "tiny",
        title: "Tiny",
        startStepId: "a",
        steps: [
          { id: "a", type: "assert", config: { a: "stage", v: "one" }, next: "w" },
          { id: "w", type: "wait", config: { seconds: 1 }, next: "b" },
          { id: "b", type: "assert", config: { a: "stage", v: "$subject" }, next: "done" },
          { id: "done", type: "done" },
        ],
      });
      await t.mutation(api.flows.startFlow, {
        tenantSlug: TENANT,
        flowDefName: "tiny",
        subject: "x:1",
      });
      await flush(t);

      const run = (await t.query(api.flows.listFlows, {
        tenantSlug: TENANT,
        subject: "x:1",
      }))[0];
      expect(run.status).toBe("completed");
      // `stage` is cardinality-many here → both asserted values present.
      const entity = await t.query(api.facts.getEntity, {
        tenantSlug: TENANT,
        e: "x:1",
      });
      expect((entity.attributes["stage"] as string[]).sort()).toEqual(["one", "x:1"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
