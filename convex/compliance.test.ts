/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function flush(t: ReturnType<typeof convexTest>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function bootstrap(t: ReturnType<typeof convexTest>) {
  await t.mutation(api.compliance.setupComplianceRules, {});
  await t.mutation(api.compliance.seedStaffingDemo, {});
  await flush(t);
}

function keys(rows: { form: string; scope: string }[]) {
  return rows.map((r) => `${r.form}@${r.scope}`).sort();
}

describe("compliance engine", () => {
  test("requirements dedupe by scope; guards and scopes shape the obligations", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await bootstrap(t);
      const c = await t.query(api.compliance.workerCompliance, {
        worker: "worker:maria",
      });

      // I-9 required once for Acme despite TWO placements at Acme (reuse via
      // scope key). Handbook for both clients. Forklift only for the forklift
      // job (guard excludes the cashier job). Venue disclosure for stadium7.
      expect(keys(c.required)).toEqual([
        "forklift@job:forklift1",
        "handbook@client:globex",
        "handbook@client:initech",
        "i9@employer:acme",
        "venue_disclosure@venue:stadium7",
      ]);
      // Nothing submitted yet → every requirement is an open task.
      expect(keys(c.open)).toEqual(keys(c.required));
    } finally {
      vi.useRealTimers();
    }
  });

  test("submitting a form clears its task and reuses across placements", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await bootstrap(t);

      await t.mutation(api.compliance.submitForm, {
        worker: "worker:maria",
        form: "i9",
        scope: "employer:acme",
      });
      await flush(t);

      const c = await t.query(api.compliance.workerCompliance, {
        worker: "worker:maria",
      });
      // One I-9 submission for Acme satisfies the obligation across BOTH
      // placements — i9 is no longer open, and it was only ever one task.
      expect(c.open.some((o) => o.form === "i9")).toBe(false);
      expect(keys(c.open)).toEqual([
        "forklift@job:forklift1",
        "handbook@client:globex",
        "handbook@client:initech",
        "venue_disclosure@venue:stadium7",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("open tasks carry provenance (the placement facts that justify them)", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await bootstrap(t);
      const c = await t.query(api.compliance.workerCompliance, {
        worker: "worker:maria",
      });
      const forklift = c.open.find((o) => o.form === "forklift");
      expect(forklift).toBeDefined();
      // Justified by the placement whose job is the forklift job.
      expect(forklift!.because.some((b) => b.a === "job")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("an expired submission does not satisfy the obligation", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      await bootstrap(t);

      // A submission whose validity already lapsed (validTo in the past).
      await t.mutation(api.facts.assertFact, {
        e: "worker:maria",
        a: "submitted.handbook",
        value: "client:globex",
        validTo: Date.now() - 1000,
      });
      await flush(t);

      let c = await t.query(api.compliance.workerCompliance, {
        worker: "worker:maria",
      });
      // Expired → not visible → handbook@globex is still open.
      expect(c.open.some((o) => o.form === "handbook" && o.scope === "client:globex")).toBe(true);

      // A live submission clears it.
      await t.mutation(api.compliance.submitForm, {
        worker: "worker:maria",
        form: "handbook",
        scope: "client:globex",
        validForDays: 365,
      });
      await flush(t);

      c = await t.query(api.compliance.workerCompliance, {
        worker: "worker:maria",
      });
      expect(c.open.some((o) => o.form === "handbook" && o.scope === "client:globex")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
