/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

const LEGAL_CONFIG = {
  account: { slug: "legal-workflows", name: "Legal Workflows", kind: "legal" },
  attributes: [
    {
      name: "matter.status",
      valueType: "string",
      cardinality: "one",
    },
  ],
  entityTypes: [
    {
      name: "Matter",
      attributes: ["matter.status"],
    },
  ],
};

describe("account config drafts", () => {
  test("saves, validates, updates, lists, and deletes tenant drafts", async () => {
    vi.useFakeTimers();
    try {
      const base = convexTest(schema, modules);
      const alice = base.withIdentity({ tokenIdentifier: "user:alice" });
      await alice.mutation(api.tenants.ensureDemoTenants, {});

      vi.setSystemTime(1_000);
      const created = await alice.mutation(api.accountConfigDrafts.saveDraft, {
        tenantSlug: "legal-workflows",
        name: "main",
        source: JSON.stringify(LEGAL_CONFIG, null, 2),
        sourceFormat: "json",
        config: LEGAL_CONFIG,
        artifactDigest: "cyrb53:artifact",
        checkedInPath: "configs/accounts/legal-workflows.forma",
        checkedInDigest: "cyrb53:checked-in",
        reviewNote: "Ready for review.",
        diagnostics: [],
      });
      expect(created).toMatchObject({
        created: true,
        artifactDigest: "cyrb53:artifact",
        validation: { valid: true, errors: [] },
      });
      expect(created.sourceDigest).toMatch(/^cyrb53:/);

      const latest = await alice.query(api.accountConfigDrafts.latestDraft, {
        tenantSlug: "legal-workflows",
        name: "main",
      });
      expect(latest).toMatchObject({
        _id: created.draftId,
        tenantSlug: "legal-workflows",
        name: "main",
        sourceFormat: "json",
        sourceDigest: created.sourceDigest,
        checkedInPath: "configs/accounts/legal-workflows.forma",
        checkedInDigest: "cyrb53:checked-in",
        reviewNote: "Ready for review.",
        artifactDigest: "cyrb53:artifact",
        validation: { valid: true, errors: [] },
        updatedBy: "user:alice",
      });

      vi.setSystemTime(2_000);
      const updated = await alice.mutation(api.accountConfigDrafts.saveDraft, {
        tenantSlug: "legal-workflows",
        name: "main",
        source: "(tenant (slug \"legal-workflows\"))\n(entity Matter)",
        sourceFormat: "forma",
        checkedInPath: "configs/accounts/legal-workflows.forma",
        checkedInDigest: "cyrb53:checked-in-v2",
        reviewNote: "Needs attribute repair.",
        diagnostics: [
          {
            message: "entityType Matter references unknown attribute missing.attr",
            loc: { line: 2, col: 1 },
            path: "entityTypes[0]",
          },
        ],
      });
      expect(updated).toMatchObject({
        draftId: created.draftId,
        created: false,
        validation: null,
      });
      expect(updated.artifactDigest).toBeUndefined();

      const drafts = await alice.query(api.accountConfigDrafts.listDrafts, {
        tenantSlug: "legal-workflows",
      });
      expect(drafts).toHaveLength(1);
      expect(drafts[0]).toMatchObject({
        _id: created.draftId,
        sourceFormat: "forma",
        checkedInPath: "configs/accounts/legal-workflows.forma",
        checkedInDigest: "cyrb53:checked-in-v2",
        reviewNote: "Needs attribute repair.",
        diagnostics: [
          {
            message: "entityType Matter references unknown attribute missing.attr",
            loc: { line: 2, col: 1 },
            path: "entityTypes[0]",
          },
        ],
      });
      expect(drafts[0].artifactDigest).toBeUndefined();
      expect(drafts[0].validation).toBeUndefined();

      await expect(
        base.withIdentity({ tokenIdentifier: "user:bob" }).query(
          api.accountConfigDrafts.listDrafts,
          { tenantSlug: "legal-workflows" },
        ),
      ).rejects.toThrow(/Tenant access denied/);
      await expect(
        base.withIdentity({ tokenIdentifier: "user:bob" }).query(
          api.accountConfigDrafts.latestDraft,
          { tenantSlug: "legal-workflows", name: "main" },
        ),
      ).rejects.toThrow(/Tenant access denied/);
      await expect(
        base.withIdentity({ tokenIdentifier: "user:bob" }).mutation(
          api.accountConfigDrafts.deleteDraft,
          { tenantSlug: "legal-workflows", draftId: created.draftId },
        ),
      ).rejects.toThrow(/Tenant access denied/);
      await expect(
        alice.mutation(api.accountConfigDrafts.deleteDraft, {
          tenantSlug: "acme-staffing",
          draftId: created.draftId,
        }),
      ).rejects.toThrow(/Tenant access denied/);

      const deleted = await alice.mutation(api.accountConfigDrafts.deleteDraft, {
        tenantSlug: "legal-workflows",
        draftId: created.draftId,
      });
      expect(deleted).toEqual({ deleted: true });
      expect(
        await alice.query(api.accountConfigDrafts.listDrafts, {
          tenantSlug: "legal-workflows",
        }),
      ).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
