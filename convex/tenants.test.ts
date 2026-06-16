/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { STAFFING_BLUEPRINT } from "./appconfig";
import schema from "./schema";
import metacrdtSchema from "../packages/convex/src/component/schema";

const modules = import.meta.glob("./**/*.ts");
const metacrdtModules = import.meta.glob("../packages/convex/src/component/**/*.ts");

vi.setConfig({ testTimeout: 20000 });

async function flush(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

const LEGAL_CONFIG = {
  attributes: [
    {
      name: "matter.status",
      valueType: "string",
      cardinality: "one",
      description: "Current matter lifecycle state.",
    },
    {
      name: "client",
      valueType: "entityRef",
      cardinality: "one",
      description: "Client associated with the matter.",
    },
  ],
  entityTypes: [
    {
      name: "Matter",
      attributes: ["name", "matter.status"],
      description: "A legal matter.",
    },
  ],
  forms: [
    {
      form: "conflict_check",
      title: "Conflict Check",
      fields: [{ name: "cleared", label: "Conflict cleared", type: "boolean" }],
    },
  ],
  flows: [
    {
      name: "matter_intake",
      title: "Matter intake",
      subjectType: "Matter",
      startStepId: "done",
      steps: [{ id: "done", type: "done" }],
    },
  ],
  requirements: [{ form: "conflict_check", scopeAttr: "client" }],
  actions: [
    {
      name: "close_matter",
      label: "Close matter",
      appliesTo: "Matter",
      asserts: { "matter.status": "closed" },
    },
  ],
};

describe("tenant skeleton and tenant-scoped config", () => {
  test("tenant list is derived from the authenticated principal", async () => {
    const anon = convexTest(schema, modules);
    expect(await anon.query(api.tenants.listMyTenants, {})).toEqual([]);
    await expect(
      anon.mutation(api.tenants.ensureDemoTenants, {}),
    ).rejects.toThrow(/Not authenticated/);

    const base = convexTest(schema, modules);
    const alice = base.withIdentity({
      tokenIdentifier: "user:alice",
    });
    await alice.mutation(api.tenants.ensureDemoTenants, {});
    const mine = await alice.query(api.tenants.listMyTenants, {});
    expect(mine.map((t) => t.slug)).toEqual([
      "acme-staffing",
      "legal-workflows",
    ]);
    expect(mine.every((t) => t.role === "owner")).toBe(true);
    const staffingManifest = await alice.query(api.configHistory.currentManifest, {
      tenantSlug: "acme-staffing",
    });
    const legalManifest = await alice.query(api.configHistory.currentManifest, {
      tenantSlug: "legal-workflows",
    });
    expect(staffingManifest.entityType).toContain("Worker");
    expect(legalManifest.entityType).toContain("Matter");
    const matter = await alice.query(api.facts.getEntity, {
      tenantSlug: "legal-workflows",
      e: "matter:globex-onboarding",
    });
    expect(matter.attributes.name).toEqual(["Globex onboarding"]);

    const bob = base.withIdentity({
      tokenIdentifier: "user:bob",
    });
    expect(await bob.query(api.tenants.listMyTenants, {})).toEqual([]);
  });

  test("demo tenants can be provisioned one account at a time", async () => {
    vi.useFakeTimers();
    try {
      const base = convexTest(schema, modules);
      const staffingUser = base.withIdentity({
        tokenIdentifier: "user:staffing",
      });
      await staffingUser.mutation(api.tenants.ensureDemoTenant, {
        kind: "staffing",
      });
      await flush(staffingUser);
      const staffingTenants = await staffingUser.query(api.tenants.listMyTenants, {});
      expect(staffingTenants.map((t) => t.slug)).toEqual(["acme-staffing"]);
      expect(staffingTenants[0]).toMatchObject({
        name: "Acme Staffing",
        kind: "staffing",
        role: "owner",
      });
      const staffingManifest = await staffingUser.query(api.configHistory.currentManifest, {
        tenantSlug: "acme-staffing",
      });
      expect(staffingManifest.entityType).toContain("Worker");
      const worker = await staffingUser.query(api.facts.getEntity, {
        tenantSlug: "acme-staffing",
        e: "worker:maria",
      });
      expect(worker.attributes.name).toEqual(["Maria"]);

      const legalUser = base.withIdentity({
        tokenIdentifier: "user:legal",
      });
      await legalUser.mutation(api.tenants.ensureDemoTenant, {
        kind: "legal",
      });
      await flush(legalUser);
      const legalTenants = await legalUser.query(api.tenants.listMyTenants, {});
      expect(legalTenants.map((t) => t.slug)).toEqual(["legal-workflows"]);
      expect(legalTenants[0]).toMatchObject({
        name: "Legal Workflows",
        kind: "legal",
        role: "owner",
      });
      const legalManifest = await legalUser.query(api.configHistory.currentManifest, {
        tenantSlug: "legal-workflows",
      });
      expect(legalManifest.entityType).toContain("Matter");
      const matter = await legalUser.query(api.facts.getEntity, {
        tenantSlug: "legal-workflows",
        e: "matter:globex-onboarding",
      });
      expect(matter.attributes.name).toEqual(["Globex onboarding"]);
      await expect(
        legalUser.query(api.configHistory.currentManifest, {
          tenantSlug: "acme-staffing",
        }),
      ).rejects.toThrow(/Tenant access denied/);
    } finally {
      vi.useRealTimers();
    }
  });

  test("tenant-scoped config manifests and history are isolated by membership", async () => {
    vi.useFakeTimers();
    try {
      const base = convexTest(schema, modules);
      const alice = base.withIdentity({
        tokenIdentifier: "user:alice",
      });
      vi.setSystemTime(1_000);
      await alice.mutation(api.tenants.createTenant, {
        slug: "acme-staffing",
        name: "Acme Staffing",
        kind: "staffing",
      });
      await alice.mutation(api.tenants.createTenant, {
        slug: "legal-workflows",
        name: "Legal Workflows",
        kind: "legal",
      });
      await alice.mutation(api.appconfig.setupStaffing, {
        tenantSlug: "acme-staffing",
      });
      await flush(alice);

      vi.setSystemTime(2_000);
      await alice.mutation(api.appconfig.applyConfig, {
        tenantSlug: "legal-workflows",
        config: LEGAL_CONFIG,
      });
      await flush(alice);

      const staffing = await alice.query(api.configHistory.currentManifest, {
        tenantSlug: "acme-staffing",
      });
      const legal = await alice.query(api.configHistory.currentManifest, {
        tenantSlug: "legal-workflows",
      });
      expect(staffing.entityType).toContain("Worker");
      expect(staffing.form).toContain("i9");
      expect(legal.entityType).toEqual(["Matter"]);
      expect(legal.form).toEqual(["conflict_check"]);
      expect(legal.action).toEqual(["close_matter"]);

      const staffingHistory = await alice.query(api.configHistory.history, {
        tenantSlug: "acme-staffing",
        limit: 5,
      });
      const legalHistory = await alice.query(api.configHistory.history, {
        tenantSlug: "legal-workflows",
        limit: 5,
      });
      expect(staffingHistory[0].added).toContainEqual({
        kind: "entityType",
        value: "Worker",
      });
      expect(legalHistory[0].added).toContainEqual({
        kind: "entityType",
        value: "Matter",
      });

      const bob = base.withIdentity({
        tokenIdentifier: "user:bob",
      });
      await expect(
        bob.query(api.configHistory.currentManifest, {
          tenantSlug: "acme-staffing",
        }),
      ).rejects.toThrow(/Tenant access denied/);
    } finally {
      vi.useRealTimers();
    }
  });

  test("setupStaffing seeds demo facts inside only the selected tenant", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({
        tokenIdentifier: "user:demo-seeder",
      });
      await t.mutation(api.tenants.createTenant, {
        slug: "acme-staffing",
        name: "Acme Staffing",
        kind: "staffing",
      });
      await t.mutation(api.tenants.createTenant, {
        slug: "legal-workflows",
        name: "Legal Workflows",
        kind: "legal",
      });

      await t.mutation(api.appconfig.setupStaffing, {
        tenantSlug: "acme-staffing",
      });
      await flush(t);

      const staffingWorker = await t.query(api.facts.getEntity, {
        tenantSlug: "acme-staffing",
        e: "worker:maria",
      });
      const legalWorker = await t.query(api.facts.getEntity, {
        tenantSlug: "legal-workflows",
        e: "worker:maria",
      });
      expect(staffingWorker.attributes.name).toEqual(["Maria"]);
      expect(staffingWorker.attributes.type).toEqual(["Worker"]);
      expect(legalWorker.attributes.name ?? []).toEqual([]);
      expect(legalWorker.attributes.type ?? []).toEqual([]);

      const staffingCompliance = await t.query(api.compliance.workerCompliance, {
        tenantSlug: "acme-staffing",
        worker: "worker:maria",
      });
      const legalCompliance = await t.query(api.compliance.workerCompliance, {
        tenantSlug: "legal-workflows",
        worker: "worker:maria",
      });
      expect(staffingCompliance.required.length).toBeGreaterThan(0);
      expect(legalCompliance.required).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("planConfig reports tenant-local ownership diff without writing", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({
        tokenIdentifier: "user:planner",
      });
      await t.mutation(api.tenants.ensureDemoTenants, {});
      await t.mutation(api.appconfig.setupStaffing, {
        tenantSlug: "acme-staffing",
      });
      await flush(t);

      const plan = await t.query(api.appconfig.planConfig, {
        tenantSlug: "acme-staffing",
        config: {
          requirements: STAFFING_BLUEPRINT.requirements.filter(
            (r) => r.form !== "forklift",
          ),
        },
      });
      expect(plan.valid).toBe(true);
      expect(plan.byKind.requirement.removed).toEqual(["forklift"]);
      expect(plan.byKind.requirement.unchanged).toEqual(
        expect.arrayContaining(["handbook", "i9", "venue_disclosure"]),
      );
      expect(plan.dangerous).toContainEqual({
        kind: "requirement",
        value: "forklift",
        reason: "Removing a requirement can close derived obligations for the tenant.",
      });

      const manifest = await t.query(api.configHistory.currentManifest, {
        tenantSlug: "acme-staffing",
      });
      expect(manifest.requirement).toContain("forklift");
    } finally {
      vi.useRealTimers();
    }
  });

  test("planConfig reports invalid config references", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:validator",
    });
    await t.mutation(api.tenants.createTenant, {
      slug: "legal-workflows",
      name: "Legal Workflows",
      kind: "legal",
    });

    const plan = await t.query(api.appconfig.planConfig, {
      tenantSlug: "legal-workflows",
      config: {
        entityTypes: [{ name: "Matter", attributes: ["missing.attr"] }],
        forms: [{ form: "intake", title: "Intake", fields: [] }],
        requirements: [{ form: "intake", scopeAttr: "client" }],
        actions: [
          {
            name: "close",
            appliesTo: "Matter",
            asserts: { "matter.status": "closed" },
          },
        ],
      },
    });
    expect(plan.valid).toBe(false);
    expect(plan.errors).toEqual(
      expect.arrayContaining([
        "entityType Matter references unknown attribute missing.attr",
        "requirement intake references unknown scopeAttr client",
        "action close asserts unknown attribute matter.status",
      ]),
    );
  });

  test("applyConfig rejects invalid config references", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:validator",
    });
    await t.mutation(api.tenants.ensureDemoTenants, {});

    await expect(
      t.mutation(api.appconfig.applyConfig, {
        tenantSlug: "legal-workflows",
        config: {
          entityTypes: [{ name: "Matter", attributes: ["missing.attr"] }],
        },
      }),
    ).rejects.toThrow(/invalid account config/);
  });

  test("applyConfigJob persists completed apply status", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:job-runner",
    });
    await t.mutation(api.tenants.ensureDemoTenants, {});

    const result = await t.action(api.appconfig.applyConfigJob, {
      tenantSlug: "legal-workflows",
      config: LEGAL_CONFIG,
    });
    expect(result.status).toBe("completed");

    const job = await t.query(api.appconfig.getApplyJob, {
      tenantSlug: "legal-workflows",
      jobId: result.jobId,
    });
    expect(job).toMatchObject({
      status: "completed",
      tenantSlug: "legal-workflows",
      requestedBy: "user:job-runner",
      attempts: 1,
    });
    expect(job?.result).toMatchObject({
      attributes: 2,
      entityTypes: 1,
      forms: 1,
      flows: 1,
      actions: 1,
    });

    const jobs = await t.query(api.appconfig.listApplyJobs, {
      tenantSlug: "legal-workflows",
    });
    expect(jobs.map((entry) => entry._id)).toContain(result.jobId);
  });

  test("retryApplyConfigJob records failed apply status", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:job-runner",
    });
    await t.mutation(api.tenants.ensureDemoTenants, {});
    const created = await t.mutation(api.appconfig.createApplyJob, {
      tenantSlug: "legal-workflows",
      config: LEGAL_CONFIG,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(created.jobId, {
        status: "failed",
        config: {
          entityTypes: [{ name: "Matter", attributes: ["missing.attr"] }],
        },
        error: "seeded failure",
      });
    });

    await expect(
      t.action(api.appconfig.retryApplyConfigJob, {
        jobId: created.jobId,
      } as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.action(api.appconfig.retryApplyConfigJob, {
        tenantSlug: "acme-staffing",
        jobId: created.jobId,
      }),
    ).rejects.toThrow(/Tenant access denied/);

    const result = await t.action(api.appconfig.retryApplyConfigJob, {
      tenantSlug: "legal-workflows",
      jobId: created.jobId,
    });
    expect(result.status).toBe("failed");
    const job = await t.query(api.appconfig.getApplyJob, {
      tenantSlug: "legal-workflows",
      jobId: created.jobId,
    });
    expect(job).toMatchObject({
      status: "failed",
      attempts: 1,
    });
    expect(job?.error).toMatch(/invalid account config/);
  });

  test("exportConfig round-trips the selected tenant manifest only", async () => {
    const base = convexTest(schema, modules);
    const t = base.withIdentity({
      tokenIdentifier: "user:exporter",
    });
    await t.mutation(api.tenants.ensureDemoTenants, {});
    await t.mutation(api.appconfig.applyConfig, {
      tenantSlug: "legal-workflows",
      config: LEGAL_CONFIG,
    });

    const staffing = await t.query(api.appconfig.exportConfig, {
      tenantSlug: "acme-staffing",
    });
    const legal = await t.query(api.appconfig.exportConfig, {
      tenantSlug: "legal-workflows",
    });

    expect(staffing.account).toMatchObject({
      slug: "acme-staffing",
      name: "Acme Staffing",
      kind: "staffing",
    });
    expect(staffing.entityTypes.map((entry) => entry.name)).toContain("Worker");
    expect(
      staffing.entityTypes.find((entry) => entry.name === "Worker")?.attributes,
    ).toContain("everify.status");
    expect(staffing.forms.map((entry) => entry.form)).toContain("i9");
    expect(staffing.actions.map((entry) => entry.name)).toContain("terminate");
    expect(staffing.entityTypes.map((entry) => entry.name)).not.toContain("Matter");

    expect(legal.account).toMatchObject({
      slug: "legal-workflows",
      name: "Legal Workflows",
      kind: "legal",
    });
    expect(legal.entityTypes.map((entry) => entry.name)).toEqual(["Matter"]);
    expect(legal.forms.map((entry) => entry.form)).toEqual(["conflict_check"]);
    expect(legal.actions.map((entry) => entry.name)).toEqual(["close_matter"]);

    const roundTrip = await t.query(api.appconfig.planConfig, {
      tenantSlug: "legal-workflows",
      config: legal,
    });
    expect(roundTrip.errors).toEqual([]);
    expect(roundTrip.valid).toBe(true);
    for (const diff of Object.values(roundTrip.byKind)) {
      expect(diff.added).toEqual([]);
      expect(diff.removed).toEqual([]);
    }

    await expect(
      base.withIdentity({ tokenIdentifier: "user:outsider" }).query(
        api.appconfig.exportConfig,
        {
          tenantSlug: "acme-staffing",
        },
      ),
    ).rejects.toThrow(/Tenant access denied/);
  });

  test("core fact and entity reads isolate duplicate logical ids by tenant", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:writer",
    });
    await t.mutation(api.tenants.ensureDemoTenants, {});

    for (const tenantSlug of ["acme-staffing", "legal-workflows"]) {
      await t.mutation(api.facts.assertFact, {
        tenantSlug,
        e: "shared:case",
        a: "type",
        value: "Record",
      });
    }
    await t.mutation(api.facts.assertFact, {
      tenantSlug: "acme-staffing",
      e: "shared:case",
      a: "name",
      value: "Staffing record",
    });
    await t.mutation(api.facts.assertFact, {
      tenantSlug: "legal-workflows",
      e: "shared:case",
      a: "name",
      value: "Legal record",
    });

    const staffing = await t.query(api.facts.getEntity, {
      tenantSlug: "acme-staffing",
      e: "shared:case",
    });
    const legal = await t.query(api.facts.getEntity, {
      tenantSlug: "legal-workflows",
      e: "shared:case",
    });
    expect(staffing.attributes.name).toEqual(["Staffing record"]);
    expect(legal.attributes.name).toEqual(["Legal record"]);

    const staffingFacts = await t.query(api.facts.queryFacts, {
      tenantSlug: "acme-staffing",
      e: "shared:case",
      a: "name",
    });
    const legalFacts = await t.query(api.facts.queryFacts, {
      tenantSlug: "legal-workflows",
      e: "shared:case",
      a: "name",
    });
    expect(staffingFacts.map((f) => f.v)).toEqual(["Staffing record"]);
    expect(legalFacts.map((f) => f.v)).toEqual(["Legal record"]);

    const staffingRows = await t.query(api.entities.queryEntities, {
      tenantSlug: "acme-staffing",
      type: "Record",
      pageSize: 10,
    });
    const legalRows = await t.query(api.entities.queryEntities, {
      tenantSlug: "legal-workflows",
      type: "Record",
      pageSize: 10,
    });
    expect(staffingRows.page.find((row) => row.id === "shared:case")?.attributes.name).toEqual([
      "Staffing record",
    ]);
    expect(legalRows.page.find((row) => row.id === "shared:case")?.attributes.name).toEqual([
      "Legal record",
    ]);
  });

  test("fresh demo provisioning writes tenant-owned runtime rows from the start", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:fresh-instance",
    });

    await t.mutation(api.tenants.ensureDemoTenant, { kind: "staffing" });

    const runtimeRows = await t.run(async (ctx) => {
      const tenant = await ctx.db
        .query("tenants")
        .withIndex("by_slug", (q) => q.eq("slug", "acme-staffing"))
        .unique();
      if (tenant === null) throw new Error("missing staffing tenant");
      const facts = await ctx.db.query("facts").collect();
      const currentFacts = await ctx.db.query("currentFacts").collect();
      const factEvents = await ctx.db.query("factEvents").collect();
      const transactions = await ctx.db.query("transactions").collect();
      const flowDefs = await ctx.db.query("flowDefs").collect();
      const rules = await ctx.db.query("rules").collect();
      return {
        tenantId: tenant._id,
        counts: {
          facts: facts.length,
          currentFacts: currentFacts.length,
          factEvents: factEvents.length,
          transactions: transactions.length,
          flowDefs: flowDefs.length,
          rules: rules.length,
        },
        allTenantScoped: [
          ...facts,
          ...currentFacts,
          ...factEvents,
          ...transactions,
          ...flowDefs,
          ...rules,
        ].every((row) => row.tenantId === tenant._id),
      };
    });

    expect(runtimeRows.counts).toMatchObject({
      facts: expect.any(Number),
      currentFacts: expect.any(Number),
      factEvents: expect.any(Number),
      transactions: expect.any(Number),
      flowDefs: expect.any(Number),
      rules: expect.any(Number),
    });
    expect(runtimeRows.counts.facts).toBeGreaterThan(0);
    expect(runtimeRows.counts.currentFacts).toBeGreaterThan(0);
    expect(runtimeRows.counts.factEvents).toBeGreaterThan(0);
    expect(runtimeRows.counts.transactions).toBeGreaterThan(0);
    expect(runtimeRows.counts.flowDefs).toBeGreaterThan(0);
    expect(runtimeRows.counts.rules).toBeGreaterThan(0);
    expect(runtimeRows.allTenantScoped).toBe(true);
  });

  test("tenant-owned public write APIs require explicit tenant context", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:writer",
    });
    await t.mutation(api.tenants.ensureDemoTenants, {});

    await expect(
      t.mutation(api.attributes.defineAttribute, {
        name: "tenant.context.attr",
        valueType: "string",
        cardinality: "one",
      } as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.attributes.defineType, {
        name: "TenantContextEntity",
        attributes: ["tenant.context.attr"],
      } as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.attributes.retireAttribute, {
        name: "tenant.context.attr",
      } as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.attributes.bootstrapSchema, {} as never),
    ).rejects.toThrow(/tenantSlug/);

    await expect(
      t.mutation(api.forms.defineForm, {
        form: "tenant_context_form",
        title: "Tenant Context Form",
        fields: [{ name: "accepted", label: "Accepted", type: "boolean" }],
      } as never),
    ).rejects.toThrow(/tenantSlug/);

    await expect(
      t.mutation(api.actions.defineAction, {
        name: "tenant_context_action",
        label: "Tenant Context Action",
        appliesTo: "Worker",
        asserts: { "worker.status": "active" },
      } as never),
    ).rejects.toThrow(/tenantSlug/);

    await expect(
      t.mutation(api.rules.defineRule, {
        name: "tenant_context_missing_rule",
        where: [["?e", "type", "Worker"]],
        emit: { e: "?e", a: "needs.context", v: true },
        dependsOnAttributes: ["type"],
      } as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.rules.defineTransitiveRule, {
        name: "tenant_context_missing_closure",
        baseAttribute: "reportsTo",
        closureAttribute: "reportsTo+",
      } as never),
    ).rejects.toThrow(/tenantSlug/);

    await expect(
      t.mutation(api.flows.defineFlow, {
        name: "tenant_context_flow",
        startStepId: "done",
        steps: [{ id: "done", type: "done" }],
      } as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.flows.setupDemoFlow, {} as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.flows.startCollect, {
        subject: "worker:maria",
        form: "i9",
        scope: "employer:acme",
      } as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.flows.issueAllOpen, {
        subject: "worker:maria",
      } as never),
    ).rejects.toThrow(/tenantSlug/);

    await expect(
      t.mutation(api.compliance.setupComplianceRules, {} as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.compliance.seedStaffingDemo, {} as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.compliance.recomputeNow, {} as never),
    ).rejects.toThrow(/tenantSlug/);

    await expect(
      t.mutation(api.appconfig.applyConfig, {
        config: {},
      } as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.appconfig.createApplyJob, {
        config: {},
      } as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.action(api.appconfig.applyConfigJob, {
        config: {},
      } as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.appconfig.setupStaffing, {} as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.appconfig.setupLegal, {} as never),
    ).rejects.toThrow(/tenantSlug/);

    await expect(
      t.mutation(api.facts.assertFact, {
        e: "global:worker",
        a: "type",
        value: "Worker",
      }),
    ).rejects.toThrow(/tenantSlug/);

    const { factId } = await t.mutation(api.facts.assertFact, {
      tenantSlug: "acme-staffing",
      e: "worker:lifecycle",
      a: "type",
      value: "Worker",
    });
    await expect(
      t.mutation(api.facts.retractFact, {
        factId,
        reason: "missing tenant",
      }),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.facts.tombstoneFact, {
        factId,
        reason: "missing tenant",
      }),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.facts.correctFact, {
        factId,
        newValue: "Candidate",
        reason: "missing tenant",
      }),
    ).rejects.toThrow(/tenantSlug/);

    await expect(
      t.mutation(api.actions.runAction, {
        action: "terminate",
        entity: "worker:maria",
      }),
    ).rejects.toThrow(/tenantSlug/);

    await expect(
      t.mutation(api.flows.startFlow, {
        flowDefName: "onboarding",
        subject: "worker:maria",
      }),
    ).rejects.toThrow(/tenantSlug/);

    await expect(
      t.mutation(api.compliance.submitForm, {
        worker: "worker:maria",
        form: "i9",
        scope: "employer:acme",
      }),
    ).rejects.toThrow(/tenantSlug/);

    const { ruleId } = await t.mutation(api.rules.defineRule, {
      tenantSlug: "acme-staffing",
      name: "tenant_context_rule",
      where: [["?e", "type", "Worker"]],
      emit: { e: "?e", a: "needs.review", v: true },
      dependsOnAttributes: ["type"],
      materialization: "manual",
    });
    await expect(
      t.mutation(api.rules.recomputeRule, {
        ruleId,
      } as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.rules.recomputeRule, {
        tenantSlug: "legal-workflows",
        ruleId,
      }),
    ).rejects.toThrow(/Tenant access denied/);
    await t.mutation(api.rules.recomputeRule, {
      tenantSlug: "acme-staffing",
      ruleId,
    });

    await expect(
      t.mutation(api.metacrdtComponent.runOwnedAction, {
        action: "terminate",
        entity: "component-worker:maria",
      }),
    ).rejects.toThrow(/tenantSlug/);

    await expect(
      t.mutation(api.metacrdtComponent.startOwnedFlow, {
        flowDefName: "onboarding",
        subject: "component-worker:maria",
      }),
    ).rejects.toThrow(/tenantSlug/);
  });

  test("legacy global fact and entity reads are blocked after tenants exist", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:reader",
    });
    await t.mutation(api.tenants.ensureDemoTenants, {});

    await expect(
      t.query(api.facts.getEntity, {
        e: "worker:any",
      }),
    ).rejects.toThrow(/Tenant context required/);

    await expect(
      t.query(api.entities.queryEntities, {
        type: "Worker",
      }),
    ).rejects.toThrow(/Tenant context required/);
  });

  test("legacy global config and engine reads are blocked after tenants exist", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:reader",
    });
    await t.mutation(api.tenants.ensureDemoTenants, {});

    await expect(t.query(api.attributes.listAttributes, {})).rejects.toThrow(
      /Tenant context required/,
    );
    await expect(t.query(api.actions.listActions, {})).rejects.toThrow(
      /Tenant context required/,
    );
    await expect(
      t.query(api.forms.formFields, { form: "i9" }),
    ).rejects.toThrow(/Tenant context required/);
    await expect(t.query(api.flows.listFlowDefs, {})).rejects.toThrow(
      /Tenant context required/,
    );
    await expect(t.query(api.rules.listRules, {})).rejects.toThrow(
      /Tenant context required/,
    );
    await expect(t.query(api.overview.summary, {})).rejects.toThrow(
      /Tenant context required/,
    );
    await expect(t.query(api.configHistory.currentManifest, {})).rejects.toThrow(
      /Tenant context required/,
    );
    await expect(
      t.query(api.appconfig.planConfig, { config: {} }),
    ).rejects.toThrow(/Tenant context required/);
    await expect(
      t.query(api.datalog.datalog, { where: [], select: [] }),
    ).rejects.toThrow(/Tenant context required/);
  });

  test("tenantless legacy read adapters are blocked after tenants exist", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:reader",
    });
    await t.mutation(api.tenants.ensureDemoTenants, {});

    await expect(
      t.query(api.overview.recentActivity, {}),
    ).rejects.toThrow(/Tenant context required/);
    await expect(t.query(api.configHistory.history, {})).rejects.toThrow(
      /Tenant context required/,
    );
    await expect(
      t.query(api.facts.queryFacts, { e: "worker:any" }),
    ).rejects.toThrow(/Tenant context required/);
    await expect(
      t.query(api.facts.entityTimeline, { e: "worker:any" }),
    ).rejects.toThrow(/Tenant context required/);
    await expect(t.query(api.flows.listFlows, {})).rejects.toThrow(
      /Tenant context required/,
    );
    await expect(
      t.query(api.flows.getFlowDef, { name: "onboarding" }),
    ).rejects.toThrow(/Tenant context required/);
    await expect(
      t.query(api.flows.flowsForType, { type: "Worker" }),
    ).rejects.toThrow(/Tenant context required/);
    await expect(
      t.query(api.actions.actionsForType, { type: "Worker" }),
    ).rejects.toThrow(/Tenant context required/);
    await expect(
      t.query(api.attributes.getAttribute, { name: "worker.status" }),
    ).rejects.toThrow(/Tenant context required/);
    await expect(
      t.query(api.compliance.workerCompliance, { worker: "worker:any" }),
    ).rejects.toThrow(/Tenant context required/);
    await expect(
      t.query(api.rules.explainDerived, { e: "worker:any" }),
    ).rejects.toThrow(/Tenant context required/);
    await expect(
      t.query(api.rules.derivedForEntity, { e: "worker:any" }),
    ).rejects.toThrow(/Tenant context required/);
  });

  test("tenant facts cannot be modified by fact id without tenant membership", async () => {
    const base = convexTest(schema, modules);
    const alice = base.withIdentity({
      tokenIdentifier: "user:alice",
    });
    await alice.mutation(api.tenants.ensureDemoTenants, {});
    const { factId } = await alice.mutation(api.facts.assertFact, {
      tenantSlug: "acme-staffing",
      e: "worker:secure",
      a: "type",
      value: "Worker",
    });

    const bob = base.withIdentity({
      tokenIdentifier: "user:bob",
    });
    await expect(
      bob.mutation(api.facts.retractFact, {
        tenantSlug: "acme-staffing",
        factId,
        reason: "not my tenant",
      }),
    ).rejects.toThrow(/Tenant access denied/);

    await expect(
      alice.mutation(api.facts.retractFact, {
        tenantSlug: "legal-workflows",
        factId,
        reason: "wrong tenant",
      }),
    ).rejects.toThrow(/Tenant access denied/);
    await expect(
      alice.mutation(api.facts.tombstoneFact, {
        tenantSlug: "legal-workflows",
        factId,
        reason: "wrong tenant",
      }),
    ).rejects.toThrow(/Tenant access denied/);
    await expect(
      alice.mutation(api.facts.correctFact, {
        tenantSlug: "legal-workflows",
        factId,
        newValue: "Candidate",
        reason: "wrong tenant",
      }),
    ).rejects.toThrow(/Tenant access denied/);

    await alice.mutation(api.facts.retractFact, {
      tenantSlug: "acme-staffing",
      factId,
      reason: "owner cleanup",
    });
    const row = await alice.query(api.facts.entityFactsAsOf, {
      tenantSlug: "acme-staffing",
      e: "worker:secure",
    });
    expect(row.facts).toEqual([]);
  });

  test("component-owned actions resolve definitions from the selected tenant config", async () => {
    const base = convexTest(schema, modules);
    base.registerComponent("metacrdt", metacrdtSchema, metacrdtModules);
    const t = base.withIdentity({
      tokenIdentifier: "user:component-operator",
    });
    await t.mutation(api.tenants.createTenant, {
      slug: "acme-staffing",
      name: "Acme Staffing",
      kind: "staffing",
    });
    await t.mutation(api.tenants.createTenant, {
      slug: "legal-workflows",
      name: "Legal Workflows",
      kind: "legal",
    });
    await t.mutation(api.appconfig.setupStaffing, {
      tenantSlug: "acme-staffing",
    });
    await t.mutation(api.appconfig.applyConfig, {
      tenantSlug: "legal-workflows",
      config: LEGAL_CONFIG,
    });

    await t.mutation(api.metacrdtComponent.createOwnedEntity, {
      e: "component-worker:maria",
      type: "Worker",
      name: "Component Maria",
    });
    await expect(
      t.mutation(api.metacrdtComponent.runOwnedAction, {
        tenantSlug: "legal-workflows",
        action: "terminate",
        entity: "component-worker:maria",
      }),
    ).rejects.toThrow(/unknown action: terminate/);

    await t.mutation(api.metacrdtComponent.runOwnedAction, {
      tenantSlug: "acme-staffing",
      action: "terminate",
      entity: "component-worker:maria",
    });
    const entity = await t.query(api.metacrdtComponent.getOwnedCurrentEntity, {
      e: "component-worker:maria",
    });
    const status = entity?.attributes.find((attr) => attr.a === "worker.status");
    expect(status?.values).toEqual(["terminated"]);
  });

  test("lowered config resources with the same names are tenant-local", async () => {
    const base = convexTest(schema, modules);
    const t = base.withIdentity({
      tokenIdentifier: "user:configurator",
    });
    await t.mutation(api.tenants.ensureDemoTenants, {});

    const baseConfig = (label: string, subjectType: string) => ({
      attributes: [
        {
          name: "shared.status",
          valueType: "string",
          cardinality: "one",
        },
      ],
      entityTypes: [{ name: subjectType, attributes: ["shared.status"] }],
      forms: [
        {
          form: "shared_intake",
          title: `${label} intake`,
          fields: [{ name: "ok", label, type: "boolean" }],
        },
      ],
      flows: [
        {
          name: "shared_flow",
          title: `${label} flow`,
          subjectType,
          startStepId: "done",
          steps: [{ id: "done", type: "done" }],
        },
      ],
      actions: [
        {
          name: "shared_action",
          label: `${label} action`,
          appliesTo: subjectType,
          asserts: { "shared.status": label },
        },
      ],
    });

    await t.mutation(api.appconfig.applyConfig, {
      tenantSlug: "acme-staffing",
      config: baseConfig("staffing", "Worker"),
    });
    await t.mutation(api.appconfig.applyConfig, {
      tenantSlug: "legal-workflows",
      config: baseConfig("legal", "Matter"),
    });

    await expect(
      base.withIdentity({ tokenIdentifier: "user:outsider" }).query(api.forms.formFields, {
        tenantSlug: "acme-staffing",
        form: "shared_intake",
      }),
    ).rejects.toThrow(/Tenant access denied/);

    const staffingForm = await t.query(api.forms.formFields, {
      tenantSlug: "acme-staffing",
      form: "shared_intake",
    });
    const legalForm = await t.query(api.forms.formFields, {
      tenantSlug: "legal-workflows",
      form: "shared_intake",
    });
    expect(staffingForm?.title).toBe("staffing intake");
    expect(legalForm?.title).toBe("legal intake");

    const staffingActions = await t.query(api.actions.listActions, {
      tenantSlug: "acme-staffing",
    });
    const legalActions = await t.query(api.actions.listActions, {
      tenantSlug: "legal-workflows",
    });
    expect(staffingActions.find((a) => a.name === "shared_action")).toMatchObject({
      label: "staffing action",
      appliesTo: "Worker",
    });
    expect(legalActions.find((a) => a.name === "shared_action")).toMatchObject({
      label: "legal action",
      appliesTo: "Matter",
    });

    const staffingFlows = await t.query(api.flows.listFlowDefs, {
      tenantSlug: "acme-staffing",
    });
    const legalFlows = await t.query(api.flows.listFlowDefs, {
      tenantSlug: "legal-workflows",
    });
    expect(staffingFlows.find((f) => f.name === "shared_flow")).toMatchObject({
      title: "staffing flow",
      subjectType: "Worker",
    });
    expect(legalFlows.find((f) => f.name === "shared_flow")).toMatchObject({
      title: "legal flow",
      subjectType: "Matter",
    });
  });
});
