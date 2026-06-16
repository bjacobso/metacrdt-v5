/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import {
  accountConfigFromFormaSource,
  accountConfigToFormaSource,
  dumpAccountDeploy,
} from "@metacrdt/account-config";
import CHECKED_IN_LEGAL_FORMA_SOURCE from "../configs/accounts/legal-workflows.forma?raw";
import CHECKED_IN_STAFFING_FORMA_SOURCE from "../configs/accounts/staffing.forma?raw";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
type TestConvex = ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function digest(value: unknown): string {
  const source = stableJson(value);
  let h1 = 0xdeadbeef ^ source.length;
  let h2 = 0x41c6ce57 ^ source.length;
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const out = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return `cyrb53:${out.toString(16).padStart(14, "0")}`;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function section(config: unknown, key: string): Record<string, unknown>[] {
  const value = record(config)[key];
  return Array.isArray(value) ? value.map(record) : [];
}

function names(entries: Record<string, unknown>[], key: string): string[] {
  return entries
    .map((entry) => entry[key])
    .filter((value): value is string => typeof value === "string")
    .sort();
}

function deployArtifact(config: { account: unknown }) {
  const attributes = section(config, "attributes");
  const entityTypes = section(config, "entityTypes");
  const forms = section(config, "forms");
  const flows = section(config, "flows");
  const requirements = section(config, "requirements");
  const actions = section(config, "actions");
  return {
    kind: "metacrdt.account.deploy",
    version: 1,
    account: config.account,
    manifest: {
      attributes: names(attributes, "name"),
      entityTypes: names(entityTypes, "name"),
      forms: names(forms, "form"),
      flows: names(flows, "name"),
      requirements: names(requirements, "form"),
      actions: names(actions, "name"),
    },
    resources: {
      attributes: Object.fromEntries(
        attributes.map((row) => [
          row.name,
          {
            value_type: row.valueType,
            cardinality: row.cardinality,
            description: row.description ?? null,
          },
        ]),
      ),
      entity_types: Object.fromEntries(
        entityTypes.map((row) => [
          row.name,
          {
            attributes: [...((row.attributes as string[] | undefined) ?? [])].sort(),
            description: row.description ?? null,
          },
        ]),
      ),
      forms: Object.fromEntries(
        forms.map((row) => [
          row.form,
          {
            title: row.title,
            description: row.description,
            fields: row.fields ?? [],
          },
        ]),
      ),
      flows: Object.fromEntries(
        flows.map((row) => [
          row.name,
          {
            title: row.title ?? null,
            description: row.description,
            subject_type: row.subjectType ?? null,
            start_step_id: row.startStepId,
            steps: row.steps ?? [],
          },
        ]),
      ),
      requirements: Object.fromEntries(
        requirements.map((row) => [
          row.form,
          {
            scope_attr: row.scopeAttr,
            description: row.description,
            guard: row.guard ?? null,
            validity_days: row.validityDays ?? null,
          },
        ]),
      ),
      actions: Object.fromEntries(
        actions.map((row) => [
          row.name,
          {
            label: row.label ?? null,
            description: row.description,
            applies_to: row.appliesTo,
            fields: row.fields ?? [],
            opens_form: row.opensForm ?? null,
            asserts: row.asserts ?? {},
          },
        ]),
      ),
    },
  };
}

const LEGAL_CONFIG = {
  account: { slug: "legal-workflows", name: "Legal Workflows", kind: "legal" },
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

const STAFFING_FORMA_SOURCE = `(tenant acme-staffing "Acme Staffing" staffing)
(attr "worker.status" string "Worker employment status.")
(attr employer entityRef "Employer of record.")
(entity Worker ["worker.status" employer] "A staffed worker.")
(form i9 "Form I-9" "Collect employment eligibility evidence."
  (field ssn string "SSN" (required))
  (requires employer "Employer-scoped I-9 evidence."))
(flow onboarding Worker "Worker onboarding" "Collect I-9 evidence." collect_i9
  (collect collect_i9 i9 employer (next done))
  (done))
(action terminate Worker "Terminate worker"
  (assert "worker.status" terminated))
`;

const LEGAL_FORMA_SOURCE = `(tenant legal-workflows "Legal Workflows" legal)
(attr "matter.status" string "Current matter lifecycle state.")
(attr client entityRef "Represented client.")
(entity Matter ["matter.status" client] "A legal matter.")
(form conflict_check "Conflict Check" "Collect conflict clearance evidence."
  (field cleared boolean "Conflict cleared" (required))
  (requires client "Client-scoped conflict check."))
(flow matter_intake Matter "Matter intake" "Collect conflict evidence." collect_conflict
  (collect collect_conflict conflict_check client (next done))
  (done))
(action close_matter Matter "Close matter"
  (assert "matter.status" closed))
`;

function formaDeployInput(source: string) {
  const config = accountConfigFromFormaSource(source);
  const dump = dumpAccountDeploy(config);
  return {
    config,
    artifact: dump.prepared.artifact,
    sourceDigest: dump.source.digest,
    artifactDigest: dump.prepared.digest,
  };
}

async function approveDeploymentPlan(
  t: TestConvex,
  tenantSlug: string,
  planId: Id<"accountDeploymentPlans">,
) {
  return await t.mutation(api.accountDeploy.approvePlan, { tenantSlug, planId });
}

async function applyDeploymentPlan(
  t: TestConvex,
  tenantSlug: string,
  planId: Id<"accountDeploymentPlans">,
) {
  return await t.mutation(api.accountDeploy.applyPlan, { tenantSlug, planId });
}

async function planDeploymentRollback(
  t: TestConvex,
  tenantSlug: string,
  planId: Id<"accountDeploymentPlans">,
) {
  return await t.mutation(api.accountDeploy.planRollback, { tenantSlug, planId });
}

async function planApproveApplyForma(
  t: TestConvex,
  tenantSlug: string,
  source: string,
) {
  const input = formaDeployInput(source);
  const planned = await t.mutation(api.accountDeploy.planFromArtifact, {
    tenantSlug,
    config: input.config,
    artifact: input.artifact,
    sourceDigest: input.sourceDigest,
    artifactDigest: input.artifactDigest,
    sourceFormat: "forma",
  });
  expect(planned).toMatchObject({
    status: "planned",
    empty: false,
    destructive: false,
    sourceDigest: input.sourceDigest,
    artifactDigest: input.artifactDigest,
  });
  const approved = await approveDeploymentPlan(t, tenantSlug, planned.planId);
  expect(approved.status).toBe("approved");
  const applied = await applyDeploymentPlan(t, tenantSlug, planned.planId);
  expect(applied).toMatchObject({
    status: "applied",
    empty: false,
    destructive: false,
  });
  return { input, planned, applied };
}

describe("account deployment plan/apply", () => {
  test("deploys two fresh tenants from Forma sources with isolated active state and history", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({
        tokenIdentifier: "user:forma-deployer",
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

      vi.setSystemTime(1_000);
      const staffing = await planApproveApplyForma(
        t,
        "acme-staffing",
        STAFFING_FORMA_SOURCE,
      );
      vi.setSystemTime(2_000);
      const legal = await planApproveApplyForma(
        t,
        "legal-workflows",
        LEGAL_FORMA_SOURCE,
      );

      const staffingActive = await t.query(api.accountDeploy.currentDeployment, {
        tenantSlug: "acme-staffing",
      });
      const legalActive = await t.query(api.accountDeploy.currentDeployment, {
        tenantSlug: "legal-workflows",
      });
      expect(staffingActive).toMatchObject({
        activePlanId: staffing.planned.planId,
        sourceDigest: staffing.input.sourceDigest,
        artifactDigest: staffing.input.artifactDigest,
        appliedBy: "user:forma-deployer",
      });
      expect(staffingActive?.plan).toMatchObject({
        status: "applied",
        sourceFormat: "forma",
        review: {
          source: { format: "forma" },
          artifact: {
            account: {
              slug: "acme-staffing",
              kind: "staffing",
            },
          },
        },
      });
      expect(legalActive).toMatchObject({
        activePlanId: legal.planned.planId,
        sourceDigest: legal.input.sourceDigest,
        artifactDigest: legal.input.artifactDigest,
        appliedBy: "user:forma-deployer",
      });
      expect(legalActive?.plan).toMatchObject({
        status: "applied",
        sourceFormat: "forma",
        review: {
          source: { format: "forma" },
          artifact: {
            account: {
              slug: "legal-workflows",
              kind: "legal",
            },
          },
        },
      });
      expect(staffingActive?.artifactDigest).not.toBe(legalActive?.artifactDigest);

      const staffingManifest = await t.query(api.configHistory.currentManifest, {
        tenantSlug: "acme-staffing",
      });
      const legalManifest = await t.query(api.configHistory.currentManifest, {
        tenantSlug: "legal-workflows",
      });
      expect(staffingManifest).toMatchObject({
        entityType: ["Worker"],
        form: ["i9"],
        flow: ["onboarding"],
        requirement: ["i9"],
        action: ["terminate"],
      });
      expect(legalManifest).toMatchObject({
        entityType: ["Matter"],
        form: ["conflict_check"],
        flow: ["matter_intake"],
        requirement: ["conflict_check"],
        action: ["close_matter"],
      });

      const staffingHistory = await t.query(api.configHistory.history, {
        tenantSlug: "acme-staffing",
        limit: 5,
      });
      const legalHistory = await t.query(api.configHistory.history, {
        tenantSlug: "legal-workflows",
        limit: 5,
      });
      expect(staffingHistory[0].added).toContainEqual({
        kind: "entityType",
        value: "Worker",
      });
      expect(staffingHistory[0].added).not.toContainEqual({
        kind: "entityType",
        value: "Matter",
      });
      expect(legalHistory[0].added).toContainEqual({
        kind: "entityType",
        value: "Matter",
      });
      expect(legalHistory[0].added).not.toContainEqual({
        kind: "entityType",
        value: "Worker",
      });

      const legalFlowHistory = await t.query(api.configHistory.history, {
        tenantSlug: "legal-workflows",
        limit: 5,
        changedKind: "flow",
      });
      expect(legalFlowHistory.length).toBeGreaterThan(0);
      expect(
        legalFlowHistory.every((entry) => entry.changedKinds.includes("flow")),
      ).toBe(true);

      vi.setSystemTime(3_000);
      await t.mutation(api.appconfig.applyConfig, {
        tenantSlug: "legal-workflows",
        config: accountConfigFromFormaSource(LEGAL_FORMA_SOURCE),
      });
      const noisyLegalHistory = await t.query(api.configHistory.history, {
        tenantSlug: "legal-workflows",
        limit: 1,
      });
      expect(noisyLegalHistory[0].totalManifestChanges).toBe(0);
      const legalChangesOnlyHistory = await t.query(api.configHistory.history, {
        tenantSlug: "legal-workflows",
        limit: 5,
        changesOnly: true,
      });
      expect(legalChangesOnlyHistory.length).toBeGreaterThan(0);
      expect(
        legalChangesOnlyHistory.every((entry) => entry.totalManifestChanges > 0),
      ).toBe(true);

      const staffingPlans = await t.query(api.accountDeploy.listPlans, {
        tenantSlug: "acme-staffing",
        limit: 5,
      });
      const legalPlans = await t.query(api.accountDeploy.listPlans, {
        tenantSlug: "legal-workflows",
        limit: 5,
      });
      expect(staffingPlans.map((plan) => plan._id)).toEqual([staffing.planned.planId]);
      expect(legalPlans.map((plan) => plan._id)).toEqual([legal.planned.planId]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("runs the greenfield checked-in Forma draft to deploy and export loop", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({
        tokenIdentifier: "user:author",
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

      const staffingInput = formaDeployInput(CHECKED_IN_STAFFING_FORMA_SOURCE);
      const legalInput = formaDeployInput(CHECKED_IN_LEGAL_FORMA_SOURCE);
      const staffingNormalizedSource = accountConfigToFormaSource(staffingInput.config);
      const legalNormalizedSource = accountConfigToFormaSource(legalInput.config);
      expect(accountConfigFromFormaSource(staffingNormalizedSource)).toMatchObject({
        account: { slug: "acme-staffing" },
      });
      expect(accountConfigFromFormaSource(legalNormalizedSource)).toMatchObject({
        account: { slug: "legal-workflows" },
      });

      const staffingDraft = await t.mutation(api.accountConfigDrafts.saveDraft, {
        tenantSlug: "acme-staffing",
        name: "main",
        source: CHECKED_IN_STAFFING_FORMA_SOURCE,
        sourceFormat: "forma",
        config: staffingInput.config,
        artifactDigest: staffingInput.artifactDigest,
        checkedInPath: "configs/accounts/staffing.forma",
        checkedInDigest: "cyrb53:checked-in-staffing",
        reviewNote: "Checked-in staffing Forma ready for deploy.",
        diagnostics: [],
      });
      expect(staffingDraft.validation).toMatchObject({ valid: true, errors: [] });
      const exportedStaffingDraft = await t.query(api.accountConfigDrafts.latestDraft, {
        tenantSlug: "acme-staffing",
        name: "main",
      });
      expect(exportedStaffingDraft).toMatchObject({
        _id: staffingDraft.draftId,
        source: CHECKED_IN_STAFFING_FORMA_SOURCE,
        sourceFormat: "forma",
        sourceDigest: staffingDraft.sourceDigest,
        artifactDigest: staffingInput.artifactDigest,
        checkedInPath: "configs/accounts/staffing.forma",
        checkedInDigest: "cyrb53:checked-in-staffing",
      });

      vi.setSystemTime(10_000);
      const staffingPlan = await t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "acme-staffing",
        config: staffingInput.config,
        artifact: staffingInput.artifact,
        sourceDigest: staffingInput.sourceDigest,
        artifactDigest: staffingInput.artifactDigest,
        sourceFormat: "forma",
        draftId: staffingDraft.draftId,
        draftSourceDigest: staffingDraft.sourceDigest,
      });
      expect(staffingPlan).toMatchObject({
        status: "planned",
        draftId: staffingDraft.draftId,
        review: {
          source: {
            format: "forma",
            draft: {
              id: staffingDraft.draftId,
              checkedInPath: "configs/accounts/staffing.forma",
              reviewNote: "Checked-in staffing Forma ready for deploy.",
            },
          },
        },
      });
      const staffingReview = await t.query(api.accountDeploy.reviewPlan, {
        tenantSlug: "acme-staffing",
        planId: staffingPlan.planId,
      });
      expect(staffingReview).toMatchObject({
        planId: staffingPlan.planId,
        tenantSlug: "acme-staffing",
        status: "planned",
        sourceDigest: staffingInput.sourceDigest,
        artifactDigest: staffingInput.artifactDigest,
        draftId: staffingDraft.draftId,
        staleness: {
          stale: false,
          baseline: {},
          current: {},
        },
        review: {
          source: {
            format: "forma",
            preview: expect.stringContaining("worker.status"),
            draft: {
              id: staffingDraft.draftId,
              checkedInPath: "configs/accounts/staffing.forma",
              checkedInDigest: "cyrb53:checked-in-staffing",
            },
          },
          artifact: {
            digest: staffingInput.artifactDigest,
            preview: expect.stringContaining("metacrdt.account.deploy"),
          },
          resourceGraph: {
            edgeCount: 29,
            edges: expect.arrayContaining([
              expect.objectContaining({
                fromKind: "flow",
                fromName: "onboarding",
                relation: "collect",
                toKind: "form",
                toName: "i9",
              }),
            ]),
          },
        },
      });
      await approveDeploymentPlan(t, "acme-staffing", staffingPlan.planId);
      await applyDeploymentPlan(t, "acme-staffing", staffingPlan.planId);

      const legalDraft = await t.mutation(api.accountConfigDrafts.saveDraft, {
        tenantSlug: "legal-workflows",
        name: "main",
        source: CHECKED_IN_LEGAL_FORMA_SOURCE,
        sourceFormat: "forma",
        config: legalInput.config,
        artifactDigest: legalInput.artifactDigest,
        checkedInPath: "configs/accounts/legal-workflows.forma",
        checkedInDigest: "cyrb53:checked-in-legal",
        reviewNote: "Checked-in legal Forma ready for deploy.",
        diagnostics: [],
      });
      const exportedLegalDraft = await t.query(api.accountConfigDrafts.latestDraft, {
        tenantSlug: "legal-workflows",
        name: "main",
      });
      expect(exportedLegalDraft).toMatchObject({
        _id: legalDraft.draftId,
        source: CHECKED_IN_LEGAL_FORMA_SOURCE,
        sourceFormat: "forma",
        sourceDigest: legalDraft.sourceDigest,
        artifactDigest: legalInput.artifactDigest,
        checkedInPath: "configs/accounts/legal-workflows.forma",
        checkedInDigest: "cyrb53:checked-in-legal",
      });

      vi.setSystemTime(20_000);
      const legalPlan = await t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "legal-workflows",
        config: legalInput.config,
        artifact: legalInput.artifact,
        sourceDigest: legalInput.sourceDigest,
        artifactDigest: legalInput.artifactDigest,
        sourceFormat: "forma",
        draftId: legalDraft.draftId,
        draftSourceDigest: legalDraft.sourceDigest,
      });
      const legalReview = await t.query(api.accountDeploy.reviewPlan, {
        tenantSlug: "legal-workflows",
        planId: legalPlan.planId,
      });
      expect(legalReview).toMatchObject({
        tenantSlug: "legal-workflows",
        draftId: legalDraft.draftId,
        review: {
          source: {
            preview: expect.stringContaining("matter.status"),
            draft: {
              id: legalDraft.draftId,
              checkedInPath: "configs/accounts/legal-workflows.forma",
            },
          },
          resourceGraph: {
            edgeCount: 17,
            edges: expect.arrayContaining([
              expect.objectContaining({
                fromKind: "flow",
                fromName: "matter_intake",
                relation: "collect",
                toKind: "form",
                toName: "conflict_check",
              }),
            ]),
          },
        },
      });
      await approveDeploymentPlan(t, "legal-workflows", legalPlan.planId);
      await applyDeploymentPlan(t, "legal-workflows", legalPlan.planId);

      const staffingActive = await t.query(api.accountDeploy.currentDeployment, {
        tenantSlug: "acme-staffing",
      });
      const legalActive = await t.query(api.accountDeploy.currentDeployment, {
        tenantSlug: "legal-workflows",
      });
      expect(staffingActive).toMatchObject({
        activePlanId: staffingPlan.planId,
        artifactDigest: staffingInput.artifactDigest,
        plan: {
          draftId: staffingDraft.draftId,
          review: {
            source: {
              draft: {
                checkedInPath: "configs/accounts/staffing.forma",
              },
            },
          },
        },
      });
      expect(legalActive).toMatchObject({
        activePlanId: legalPlan.planId,
        artifactDigest: legalInput.artifactDigest,
        plan: {
          draftId: legalDraft.draftId,
          review: {
            source: {
              draft: {
                checkedInPath: "configs/accounts/legal-workflows.forma",
              },
            },
          },
        },
      });
      expect(staffingActive?.artifactDigest).not.toBe(legalActive?.artifactDigest);

      const staffingExport = await t.query(api.appconfig.exportConfig, {
        tenantSlug: "acme-staffing",
      });
      const legalExport = await t.query(api.appconfig.exportConfig, {
        tenantSlug: "legal-workflows",
      });
      const staffingManifest = await t.query(api.configHistory.currentManifest, {
        tenantSlug: "acme-staffing",
      });
      const legalManifest = await t.query(api.configHistory.currentManifest, {
        tenantSlug: "legal-workflows",
      });
      expect(record(staffingExport).account).toMatchObject({
        slug: "acme-staffing",
        kind: "staffing",
      });
      expect(record(legalExport).account).toMatchObject({
        slug: "legal-workflows",
        kind: "legal",
      });
      expect(names(section(staffingExport, "entityTypes"), "name")).toEqual([
        "Client",
        "Employer",
        "Job",
        "Placement",
        "Venue",
        "Worker",
      ]);
      expect(names(section(legalExport, "entityTypes"), "name")).toEqual([
        "Attorney",
        "Client",
        "Matter",
      ]);
      expect(names(section(staffingExport, "forms"), "form")).toEqual([
        "forklift",
        "handbook",
        "i9",
        "venue_disclosure",
      ]);
      expect(names(section(legalExport, "forms"), "form")).toEqual([
        "conflict_check",
        "engagement_letter",
      ]);
      expect(names(section(staffingExport, "attributes"), "name")).toContain(
        "worker.status",
      );
      expect(names(section(staffingExport, "attributes"), "name")).not.toContain(
        "matter.status",
      );
      expect(names(section(legalExport, "attributes"), "name")).toContain(
        "matter.status",
      );
      expect(names(section(legalExport, "attributes"), "name")).not.toContain(
        "worker.status",
      );
      expect(staffingManifest.form).toEqual([
        "forklift",
        "handbook",
        "i9",
        "venue_disclosure",
      ]);
      expect(legalManifest.form).toEqual([
        "conflict_check",
        "engagement_letter",
      ]);
      expect(staffingManifest.form).not.toContain("conflict_check");
      expect(legalManifest.form).not.toContain("i9");

      const staffingExportDump = dumpAccountDeploy(staffingExport);
      const legalExportDump = dumpAccountDeploy(legalExport);
      expect(staffingExportDump.prepared.artifact.manifest).toEqual(
        staffingInput.artifact.manifest,
      );
      expect(legalExportDump.prepared.artifact.manifest).toEqual(
        legalInput.artifact.manifest,
      );

      vi.setSystemTime(30_000);
      const repeatedStaffingPlan = await t.mutation(
        api.accountDeploy.planFromArtifact,
        {
          tenantSlug: "acme-staffing",
          config: staffingInput.config,
          artifact: staffingInput.artifact,
          sourceDigest: staffingInput.sourceDigest,
          artifactDigest: staffingInput.artifactDigest,
          sourceFormat: "forma",
          draftId: staffingDraft.draftId,
          draftSourceDigest: staffingDraft.sourceDigest,
        },
      );
      expect(repeatedStaffingPlan).toMatchObject({
        status: "planned",
        empty: true,
        destructive: false,
        review: {
          baseline: {
            activePlanId: staffingPlan.planId,
            artifactDigest: staffingInput.artifactDigest,
          },
          diff: {
            totals: {
              attribute: { added: 0, changed: 0, removed: 0 },
              entityType: { added: 0, changed: 0, removed: 0 },
              form: { added: 0, changed: 0, removed: 0 },
              flow: { added: 0, changed: 0, removed: 0 },
              requirement: { added: 0, changed: 0, removed: 0 },
              action: { added: 0, changed: 0, removed: 0 },
            },
          },
        },
      });
      const repeatedLegalPlan = await t.mutation(
        api.accountDeploy.planFromArtifact,
        {
          tenantSlug: "legal-workflows",
          config: legalInput.config,
          artifact: legalInput.artifact,
          sourceDigest: legalInput.sourceDigest,
          artifactDigest: legalInput.artifactDigest,
          sourceFormat: "forma",
          draftId: legalDraft.draftId,
          draftSourceDigest: legalDraft.sourceDigest,
        },
      );
      expect(repeatedLegalPlan).toMatchObject({
        status: "planned",
        empty: true,
        destructive: false,
        review: {
          baseline: {
            activePlanId: legalPlan.planId,
            artifactDigest: legalInput.artifactDigest,
          },
          diff: {
            totals: {
              attribute: { added: 0, changed: 0, removed: 0 },
              entityType: { added: 0, changed: 0, removed: 0 },
              form: { added: 0, changed: 0, removed: 0 },
              flow: { added: 0, changed: 0, removed: 0 },
              requirement: { added: 0, changed: 0, removed: 0 },
              action: { added: 0, changed: 0, removed: 0 },
            },
          },
        },
      });

      const staffingDrafts = await t.query(api.accountConfigDrafts.listDrafts, {
        tenantSlug: "acme-staffing",
        limit: 5,
      });
      const legalDrafts = await t.query(api.accountConfigDrafts.listDrafts, {
        tenantSlug: "legal-workflows",
        limit: 5,
      });
      expect(staffingDrafts.map((draft) => draft._id)).toEqual([
        staffingDraft.draftId,
      ]);
      expect(legalDrafts.map((draft) => draft._id)).toEqual([legalDraft.draftId]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("stores a deployment plan and advances active tenant deployment on apply", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({
        tokenIdentifier: "user:deployer",
      });
      await t.mutation(api.tenants.createTenant, {
        slug: "legal-workflows",
        name: "Legal Workflows",
        kind: "legal",
      });

      vi.setSystemTime(1_000);
      const artifact = deployArtifact(LEGAL_CONFIG);
      const planned = await t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "legal-workflows",
        config: LEGAL_CONFIG,
        artifact,
        sourceDigest: digest(LEGAL_CONFIG),
        artifactDigest: digest(artifact),
        sourceFormat: "json",
      });

      expect(planned.status).toBe("planned");
      expect(planned.empty).toBe(false);
      expect(planned.destructive).toBe(false);
      expect(planned.summary).toMatchObject({
        tenantSlug: "legal-workflows",
      });
      expect(planned.review).toMatchObject({
        source: {
          digest: digest(LEGAL_CONFIG),
          format: "json",
          preview: expect.stringContaining("matter.status"),
        },
        artifact: {
          digest: digest(artifact),
          manifest: artifact.manifest,
          preview: expect.stringContaining("metacrdt.account.deploy"),
        },
        resourceGraph: {
          digest: expect.stringMatching(/^cyrb53:/),
          edgeCount: expect.any(Number),
          edges: expect.arrayContaining([
            expect.objectContaining({
              fromKind: "entityType",
              fromName: "Matter",
              relation: "attribute",
              toKind: "attribute",
              toName: "matter.status",
            }),
            expect.objectContaining({
              fromKind: "entityType",
              fromName: "Matter",
              relation: "flow",
              toKind: "flow",
              toName: "matter_intake",
            }),
          ]),
          truncated: false,
        },
        baseline: {},
        diff: {
          totals: expect.any(Object),
        },
      });

      await expect(
        t.mutation(api.accountDeploy.applyPlan, {
          tenantSlug: "legal-workflows",
          planId: planned.planId,
        }),
      ).rejects.toThrow(/deployment plan is planned/);
      await expect(
        t.mutation(api.accountDeploy.planRollback, {
          tenantSlug: "legal-workflows",
          planId: planned.planId,
        }),
      ).rejects.toThrow(/rollback target is planned/);

      vi.setSystemTime(2_000);
      const approved = await approveDeploymentPlan(
        t,
        "legal-workflows",
        planned.planId,
      );
      expect(approved).toMatchObject({
        status: "approved",
        approvedBy: "user:deployer",
        approvedAt: 2_000,
      });

      vi.setSystemTime(3_000);
      const applied = await applyDeploymentPlan(t, "legal-workflows", planned.planId);
      expect(applied).toMatchObject({
        status: "applied",
        empty: false,
        destructive: false,
      });

      const active = await t.query(api.accountDeploy.currentDeployment, {
        tenantSlug: "legal-workflows",
      });
      expect(active).toMatchObject({
        sourceDigest: digest(LEGAL_CONFIG),
        artifactDigest: digest(artifact),
        appliedBy: "user:deployer",
      });
      expect(active?.plan?.status).toBe("applied");

      vi.setSystemTime(4_000);
      const rollback = await planDeploymentRollback(
        t,
        "legal-workflows",
        planned.planId,
      );
      expect(rollback).toMatchObject({
        status: "planned",
        rollbackOfPlanId: planned.planId,
        sourceDigest: digest(LEGAL_CONFIG),
        artifactDigest: digest(artifact),
      });
      expect(rollback.review).toMatchObject({
        rollbackOfPlanId: planned.planId,
        source: { digest: digest(LEGAL_CONFIG) },
        artifact: { digest: digest(artifact) },
        baseline: {
          activePlanId: planned.planId,
          artifactDigest: digest(artifact),
          appliedAt: 3_000,
        },
        rollbackTarget: {
          planId: planned.planId,
          sourceDigest: digest(LEGAL_CONFIG),
          artifactDigest: digest(artifact),
          appliedAt: 3_000,
        },
      });

      const manifest = await t.query(api.configHistory.currentManifest, {
        tenantSlug: "legal-workflows",
      });
      expect(manifest.entityType).toEqual(["Matter"]);
      expect(manifest.form).toEqual(["conflict_check"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("replanning the active artifact produces an empty idempotent deployment", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({
        tokenIdentifier: "user:deployer",
      });
      await t.mutation(api.tenants.createTenant, {
        slug: "legal-workflows",
        name: "Legal Workflows",
        kind: "legal",
      });

      const artifact = deployArtifact(LEGAL_CONFIG);
      vi.setSystemTime(1_000);
      const initialPlan = await t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "legal-workflows",
        config: LEGAL_CONFIG,
        artifact,
        sourceDigest: digest(LEGAL_CONFIG),
        artifactDigest: digest(artifact),
        sourceFormat: "json",
      });
      await approveDeploymentPlan(t, "legal-workflows", initialPlan.planId);
      await applyDeploymentPlan(t, "legal-workflows", initialPlan.planId);

      const historyBefore = await t.query(api.configHistory.history, {
        tenantSlug: "legal-workflows",
        changesOnly: true,
      });

      vi.setSystemTime(2_000);
      const idempotentPlan = await t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "legal-workflows",
        config: LEGAL_CONFIG,
        artifact,
        sourceDigest: digest(LEGAL_CONFIG),
        artifactDigest: digest(artifact),
        sourceFormat: "json",
      });

      expect(idempotentPlan).toMatchObject({
        status: "planned",
        empty: true,
        destructive: false,
        review: {
          baseline: {
            activePlanId: initialPlan.planId,
            artifactDigest: digest(artifact),
            appliedAt: 1_000,
          },
          diff: {
            accountChange: {
              action: "unchanged",
              changedFields: [],
            },
          },
        },
      });
      expect(idempotentPlan.plan).toMatchObject({
        empty: true,
        byKind: {
          attribute: { added: [], changed: [], removed: [] },
          entityType: { added: [], changed: [], removed: [] },
          form: { added: [], changed: [], removed: [] },
          flow: { added: [], changed: [], removed: [] },
          requirement: { added: [], changed: [], removed: [] },
          action: { added: [], changed: [], removed: [] },
        },
      });

      const review = await t.query(api.accountDeploy.reviewPlan, {
        tenantSlug: "legal-workflows",
        planId: idempotentPlan.planId,
      });
      expect(review).toMatchObject({
        planId: idempotentPlan.planId,
        status: "planned",
        staleness: {
          stale: false,
          baseline: {
            activePlanId: initialPlan.planId,
            artifactDigest: digest(artifact),
            appliedAt: 1_000,
          },
          current: {
            activePlanId: initialPlan.planId,
            artifactDigest: digest(artifact),
            appliedAt: 1_000,
          },
        },
      });

      await approveDeploymentPlan(t, "legal-workflows", idempotentPlan.planId);
      const applied = await applyDeploymentPlan(
        t,
        "legal-workflows",
        idempotentPlan.planId,
      );
      expect(applied).toMatchObject({
        status: "applied",
        empty: true,
        result: {
          skipped: true,
          reason: "deployment plan is empty",
        },
      });

      const active = await t.query(api.accountDeploy.currentDeployment, {
        tenantSlug: "legal-workflows",
      });
      expect(active).toMatchObject({
        activePlanId: idempotentPlan.planId,
        artifactDigest: digest(artifact),
        plan: {
          _id: idempotentPlan.planId,
          empty: true,
          status: "applied",
        },
      });

      const historyAfter = await t.query(api.configHistory.history, {
        tenantSlug: "legal-workflows",
        changesOnly: true,
      });
      expect(historyAfter).toEqual(historyBefore);
    } finally {
      vi.useRealTimers();
    }
  });

  test("persists account metadata-only changes as non-empty deployment plans", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:deployer",
    });
    await t.mutation(api.tenants.createTenant, {
      slug: "legal-workflows",
      name: "Legal Workflows",
      kind: "legal",
    });

    const initialArtifact = deployArtifact(LEGAL_CONFIG);
    const initialPlan = await t.mutation(api.accountDeploy.planFromArtifact, {
      tenantSlug: "legal-workflows",
      config: LEGAL_CONFIG,
      artifact: initialArtifact,
      sourceDigest: digest(LEGAL_CONFIG),
      artifactDigest: digest(initialArtifact),
      sourceFormat: "json",
    });
    await approveDeploymentPlan(t, "legal-workflows", initialPlan.planId);
    await applyDeploymentPlan(t, "legal-workflows", initialPlan.planId);

    const renamedConfig = {
      ...LEGAL_CONFIG,
      account: { ...LEGAL_CONFIG.account, name: "Legal Operations" },
    };
    const renamedArtifact = deployArtifact(renamedConfig);
    const planned = await t.mutation(api.accountDeploy.planFromArtifact, {
      tenantSlug: "legal-workflows",
      config: renamedConfig,
      artifact: renamedArtifact,
      sourceDigest: digest(renamedConfig),
      artifactDigest: digest(renamedArtifact),
      sourceFormat: "json",
    });

    expect(planned.empty).toBe(false);
    expect(planned.summary).toMatchObject({
      accountChange: {
        action: "changed",
        changedFields: ["name"],
      },
    });
    expect(planned.review).toMatchObject({
      diff: {
        accountChange: {
          action: "changed",
          before: LEGAL_CONFIG.account,
          after: renamedConfig.account,
          changedFields: ["name"],
        },
      },
    });
  });

  test("links deployment plans to saved draft review context", async () => {
    const base = convexTest(schema, modules);
    const t = base.withIdentity({
      tokenIdentifier: "user:deployer",
    });
    await t.mutation(api.tenants.createTenant, {
      slug: "legal-workflows",
      name: "Legal Workflows",
      kind: "legal",
    });
    await t.mutation(api.tenants.createTenant, {
      slug: "acme-staffing",
      name: "Acme Staffing",
      kind: "staffing",
    });

    const artifact = deployArtifact(LEGAL_CONFIG);
    const source = JSON.stringify(LEGAL_CONFIG, null, 2);
    const draft = await t.mutation(api.accountConfigDrafts.saveDraft, {
      tenantSlug: "legal-workflows",
      name: "main",
      source,
      sourceFormat: "json",
      config: LEGAL_CONFIG,
      artifactDigest: digest(artifact),
      checkedInPath: "configs/accounts/legal-workflows.forma",
      checkedInDigest: "cyrb53:checked-in",
      reviewNote: "Ready for deployment review.",
      diagnostics: [],
    });

    const planned = await t.mutation(api.accountDeploy.planFromArtifact, {
      tenantSlug: "legal-workflows",
      config: LEGAL_CONFIG,
      artifact,
      sourceDigest: digest(LEGAL_CONFIG),
      artifactDigest: digest(artifact),
      sourceFormat: "json",
      draftId: draft.draftId,
      draftSourceDigest: draft.sourceDigest,
    });

    expect(planned).toMatchObject({
      draftId: draft.draftId,
      review: {
        source: {
          draft: {
            id: draft.draftId,
            name: "main",
            sourceFormat: "json",
            checkedInPath: "configs/accounts/legal-workflows.forma",
            checkedInDigest: "cyrb53:checked-in",
            reviewNote: "Ready for deployment review.",
            artifactDigest: digest(artifact),
            updatedBy: "user:deployer",
          },
        },
      },
    });

    const plans = await t.query(api.accountDeploy.listPlans, {
      tenantSlug: "legal-workflows",
      limit: 10,
    });
    expect(plans[0]).toMatchObject({
      draftId: draft.draftId,
      review: {
        source: {
          draft: {
            id: draft.draftId,
            reviewNote: "Ready for deployment review.",
          },
        },
      },
    });

    const reviewSnapshot = await t.query(api.accountDeploy.reviewPlan, {
      tenantSlug: "legal-workflows",
      planId: planned.planId,
    });
    expect(reviewSnapshot).toMatchObject({
      planId: planned.planId,
      tenantSlug: "legal-workflows",
      status: "planned",
      sourceDigest: digest(LEGAL_CONFIG),
      artifactDigest: digest(artifact),
      staleness: {
        stale: false,
        baseline: {},
        current: {},
      },
      review: {
        source: {
          draft: {
            id: draft.draftId,
            reviewNote: "Ready for deployment review.",
          },
        },
        artifact: {
          digest: digest(artifact),
        },
      },
    });
    const bob = base.withIdentity({
      tokenIdentifier: "user:bob",
    });
    await expect(
      bob.query(api.accountDeploy.reviewPlan, {
        tenantSlug: "legal-workflows",
        planId: planned.planId,
      }),
    ).rejects.toThrow(/Tenant access denied/);
    await expect(
      t.query(api.accountDeploy.reviewPlan, {
        tenantSlug: "acme-staffing",
        planId: planned.planId,
      }),
    ).rejects.toThrow(/Tenant access denied/);
    await expect(
      bob.mutation(api.accountDeploy.approvePlan, {
        tenantSlug: "legal-workflows",
        planId: planned.planId,
      }),
    ).rejects.toThrow(/Tenant access denied/);
    await expect(
      bob.mutation(api.accountDeploy.applyPlan, {
        tenantSlug: "legal-workflows",
        planId: planned.planId,
      }),
    ).rejects.toThrow(/Tenant access denied/);
    await expect(
      t.mutation(api.accountDeploy.approvePlan, {
        planId: planned.planId,
      } as never),
    ).rejects.toThrow(/tenantSlug/);
    await expect(
      t.mutation(api.accountDeploy.approvePlan, {
        tenantSlug: "acme-staffing",
        planId: planned.planId,
      }),
    ).rejects.toThrow(/Tenant access denied/);

    await expect(
      t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "legal-workflows",
        config: LEGAL_CONFIG,
        artifact,
        sourceDigest: digest(LEGAL_CONFIG),
        artifactDigest: digest(artifact),
        sourceFormat: "json",
        draftId: draft.draftId,
        draftSourceDigest: "cyrb53:stale-draft-source",
      }),
    ).rejects.toThrow(/draft source digest does not match/);
  });

  test("rejects approval when active state changed after review", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({
        tokenIdentifier: "user:deployer",
      });
      await t.mutation(api.tenants.createTenant, {
        slug: "legal-workflows",
        name: "Legal Workflows",
        kind: "legal",
      });

      vi.setSystemTime(1_000);
      const staleArtifact = deployArtifact(LEGAL_CONFIG);
      const stalePlan = await t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "legal-workflows",
        config: LEGAL_CONFIG,
        artifact: staleArtifact,
        sourceDigest: digest(LEGAL_CONFIG),
        artifactDigest: digest(staleArtifact),
        sourceFormat: "json",
      });

      const replacementConfig = {
        ...LEGAL_CONFIG,
        actions: [
          {
            ...LEGAL_CONFIG.actions[0],
            label: "Close matter immediately",
          },
        ],
      };
      const replacementArtifact = deployArtifact(replacementConfig);
      vi.setSystemTime(2_000);
      const replacementPlan = await t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "legal-workflows",
        config: replacementConfig,
        artifact: replacementArtifact,
        sourceDigest: digest(replacementConfig),
        artifactDigest: digest(replacementArtifact),
        sourceFormat: "json",
      });
      await approveDeploymentPlan(t, "legal-workflows", replacementPlan.planId);
      await applyDeploymentPlan(t, "legal-workflows", replacementPlan.planId);

      const staleReview = await t.query(api.accountDeploy.reviewPlan, {
        tenantSlug: "legal-workflows",
        planId: stalePlan.planId,
      });
      expect(staleReview).toMatchObject({
        planId: stalePlan.planId,
        status: "planned",
        staleness: {
          stale: true,
          baseline: {},
          current: {
            activePlanId: replacementPlan.planId,
            artifactDigest: digest(replacementArtifact),
            appliedAt: 2_000,
          },
          message: expect.stringContaining("deployment plan is stale"),
        },
      });

      vi.setSystemTime(3_000);
      const staleApproval = await approveDeploymentPlan(
        t,
        "legal-workflows",
        stalePlan.planId,
      );
      expect(staleApproval).toMatchObject({
        status: "failed",
        error: expect.stringContaining("deployment plan is stale"),
      });

      const plans = await t.query(api.accountDeploy.listPlans, {
        tenantSlug: "legal-workflows",
        limit: 10,
      });
      const staleRow = plans.find((plan) => plan._id === stalePlan.planId);
      expect(staleRow).toMatchObject({
        status: "failed",
        error: expect.stringContaining("deployment plan is stale"),
      });
      const failedReview = await t.query(api.accountDeploy.reviewPlan, {
        tenantSlug: "legal-workflows",
        planId: stalePlan.planId,
      });
      expect(failedReview).toMatchObject({
        planId: stalePlan.planId,
        status: "failed",
        error: expect.stringContaining("deployment plan is stale"),
        sourceDigest: digest(LEGAL_CONFIG),
        artifactDigest: digest(staleArtifact),
        updatedAt: 3_000,
        review: {
          source: {
            digest: digest(LEGAL_CONFIG),
            format: "json",
          },
          artifact: {
            digest: digest(staleArtifact),
          },
        },
        current: {
          activePlanId: replacementPlan.planId,
          artifactDigest: digest(replacementArtifact),
          appliedAt: 2_000,
        },
        staleness: {
          stale: true,
          current: {
            activePlanId: replacementPlan.planId,
            artifactDigest: digest(replacementArtifact),
            appliedAt: 2_000,
          },
          message: expect.stringContaining("deployment plan is stale"),
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("rejects an approved deployment plan when active state changed after review", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({
        tokenIdentifier: "user:deployer",
      });
      await t.mutation(api.tenants.createTenant, {
        slug: "legal-workflows",
        name: "Legal Workflows",
        kind: "legal",
      });
      const staleArtifact = deployArtifact(LEGAL_CONFIG);

      vi.setSystemTime(1_000);
      const stalePlan = await t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "legal-workflows",
        config: LEGAL_CONFIG,
        artifact: staleArtifact,
        sourceDigest: digest(LEGAL_CONFIG),
        artifactDigest: digest(staleArtifact),
        sourceFormat: "json",
      });
      await approveDeploymentPlan(t, "legal-workflows", stalePlan.planId);

      const replacementConfig = {
        ...LEGAL_CONFIG,
        actions: [
          {
            ...LEGAL_CONFIG.actions[0],
            label: "Close matter immediately",
          },
        ],
      };
      const replacementArtifact = deployArtifact(replacementConfig);
      vi.setSystemTime(2_000);
      const replacementPlan = await t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "legal-workflows",
        config: replacementConfig,
        artifact: replacementArtifact,
        sourceDigest: digest(replacementConfig),
        artifactDigest: digest(replacementArtifact),
        sourceFormat: "json",
      });
      await approveDeploymentPlan(t, "legal-workflows", replacementPlan.planId);

      vi.setSystemTime(3_000);
      await applyDeploymentPlan(t, "legal-workflows", replacementPlan.planId);

      vi.setSystemTime(4_000);
      const staleApply = await applyDeploymentPlan(
        t,
        "legal-workflows",
        stalePlan.planId,
      );
      expect(staleApply).toMatchObject({
        status: "failed",
        error: expect.stringContaining("deployment plan is stale"),
      });

      const active = await t.query(api.accountDeploy.currentDeployment, {
        tenantSlug: "legal-workflows",
      });
      expect(active).toMatchObject({
        activePlanId: replacementPlan.planId,
        artifactDigest: digest(replacementArtifact),
      });
      const plans = await t.query(api.accountDeploy.listPlans, {
        tenantSlug: "legal-workflows",
        limit: 10,
      });
      const staleRow = plans.find((plan) => plan._id === stalePlan.planId);
      expect(staleRow).toMatchObject({
        status: "failed",
        error: expect.stringContaining("deployment plan is stale"),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("rejects deployment artifacts and digests that do not match config", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:deployer",
    });
    await t.mutation(api.tenants.ensureDemoTenants, {});
    const artifact = deployArtifact(LEGAL_CONFIG);

    await expect(
      t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "legal-workflows",
        config: LEGAL_CONFIG,
        artifact,
        sourceDigest: "cyrb53:wrong",
        artifactDigest: digest(artifact),
        sourceFormat: "json",
      }),
    ).rejects.toThrow(/source digest mismatch/);

    await expect(
      t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "legal-workflows",
        config: LEGAL_CONFIG,
        artifact: { ...artifact, resources: {} },
        sourceDigest: digest(LEGAL_CONFIG),
        artifactDigest: digest(artifact),
        sourceFormat: "json",
      }),
    ).rejects.toThrow(/deployment artifact does not match account config/);
  });

  test("rejects deployment configs whose account metadata does not match tenant", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:deployer",
    });
    await t.mutation(api.tenants.ensureDemoTenants, {});
    const wrongSlugConfig = {
      ...LEGAL_CONFIG,
      account: { ...LEGAL_CONFIG.account, slug: "staffing" },
    };
    const wrongSlugArtifact = deployArtifact(wrongSlugConfig);
    const invalidKindConfig = {
      ...LEGAL_CONFIG,
      account: { ...LEGAL_CONFIG.account, kind: "finance" },
    };
    const invalidKindArtifact = deployArtifact(invalidKindConfig);

    await expect(
      t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "legal-workflows",
        config: wrongSlugConfig,
        artifact: wrongSlugArtifact,
        sourceDigest: digest(wrongSlugConfig),
        artifactDigest: digest(wrongSlugArtifact),
        sourceFormat: "json",
      }),
    ).rejects.toThrow(/account slug staffing does not match tenant legal-workflows/);

    await expect(
      t.mutation(api.accountDeploy.planFromArtifact, {
        tenantSlug: "legal-workflows",
        config: invalidKindConfig,
        artifact: invalidKindArtifact,
        sourceDigest: digest(invalidKindConfig),
        artifactDigest: digest(invalidKindArtifact),
        sourceFormat: "json",
      }),
    ).rejects.toThrow(/account kind must be staffing, legal, or custom/);
  });
});
