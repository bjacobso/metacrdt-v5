/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const STAFFING_TENANT = "acme-staffing";
const LEGAL_TENANT = "legal-workflows";

describe("external collection", () => {
  test("define form → render-by-token → submit saves facts and resumes the flow", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await t.mutation(api.tenants.ensureDemoTenants, {});
      await t.mutation(api.forms.defineForm, {
        tenantSlug: STAFFING_TENANT,
        form: "i9",
        title: "Form I-9",
        fields: [
          { name: "ssn", label: "SSN", type: "string", required: true },
          { name: "dob", label: "DOB", type: "date", required: true },
        ],
      });

      const { runId } = await t.mutation(api.flows.startCollect, {
        tenantSlug: STAFFING_TENANT,
        subject: "worker:t1",
        form: "i9",
        scope: "employer:acme",
      });

      // The isolated page payload, keyed by the magic-link token.
      const flows = await t.query(api.flows.listFlows, {
        tenantSlug: STAFFING_TENANT,
        subject: "worker:t1",
      });
      const token = flows[0].token!;
      const page = await t.query(api.forms.collectionByToken, { token });
      expect(page.found).toBe(true);
      expect(page.found && page.status).toBe("waiting");
      expect(page.found && (page.fields as { name: string }[]).map((f) => f.name)).toEqual([
        "ssn",
        "dob",
      ]);

      // Submit → saves field facts + the submission marker → resumes the run.
      const res = await t.mutation(api.forms.submitCollection, {
        token,
        values: { ssn: "123", dob: "1990-01-01" },
      });
      expect(res.ok).toBe(true);
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      // Field values saved as facts.
      const entity = await t.query(api.facts.getEntity, {
        tenantSlug: STAFFING_TENANT,
        e: "worker:t1",
      });
      expect(entity.attributes["i9/ssn"]).toEqual(["123"]);
      expect(entity.attributes["i9/dob"]).toEqual(["1990-01-01"]);

      // The flow run resumed to completed.
      const after = await t.query(api.flows.listFlows, {
        tenantSlug: STAFFING_TENANT,
        subject: "worker:t1",
      });
      expect(after.find((f) => f._id === runId)!.status).toBe("completed");

      // The token is single-use: after a successful submit it no longer renders
      // the collection payload, and a second submit is rejected.
      const dup = await t.query(api.forms.collectionByToken, { token });
      expect(dup).toEqual({ found: false, reason: "used" });
      const res2 = await t.mutation(api.forms.submitCollection, {
        token,
        values: { ssn: "x" },
      });
      expect(res2.ok).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  test("collection tokens can expire before submission", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await t.mutation(api.tenants.ensureDemoTenants, {});
      await t.mutation(api.forms.defineForm, {
        tenantSlug: STAFFING_TENANT,
        form: "i9",
        title: "Form I-9",
        fields: [{ name: "ssn", label: "SSN", type: "string", required: true }],
      });

      await t.mutation(api.flows.startCollect, {
        tenantSlug: STAFFING_TENANT,
        subject: "worker:t-expire",
        form: "i9",
        scope: "employer:acme",
        expireSeconds: 0,
      });
      const flows = await t.query(api.flows.listFlows, {
        tenantSlug: STAFFING_TENANT,
        subject: "worker:t-expire",
      });
      const token = flows[0].token!;

      expect(await t.query(api.forms.collectionByToken, { token })).toEqual({
        found: false,
        reason: "expired",
      });
      expect(
        await t.mutation(api.forms.submitCollection, {
          token,
          values: { ssn: "123" },
        }),
      ).toEqual({ ok: false, reason: "expired token" });
    } finally {
      vi.useRealTimers();
    }
  });

  test("collection tokens submit into only the issuing tenant", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await t.mutation(api.tenants.ensureDemoTenants, {});
      for (const tenantSlug of [STAFFING_TENANT, LEGAL_TENANT]) {
        await t.mutation(api.forms.defineForm, {
          tenantSlug,
          form: "shared_intake",
          title: "Shared Intake",
          fields: [{ name: "answer", label: "Answer", type: "string", required: true }],
        });
        await t.mutation(api.flows.startCollect, {
          tenantSlug,
          subject: "shared:subject",
          form: "shared_intake",
          scope: "shared:scope",
        });
      }

      const staffingRuns = await t.query(api.flows.listFlows, {
        tenantSlug: STAFFING_TENANT,
        subject: "shared:subject",
      });
      const legalRuns = await t.query(api.flows.listFlows, {
        tenantSlug: LEGAL_TENANT,
        subject: "shared:subject",
      });
      const staffingToken = staffingRuns[0].token!;
      const legalToken = legalRuns[0].token!;
      expect(staffingToken).not.toBe(legalToken);

      expect(
        await t.mutation(api.forms.submitCollection, {
          token: staffingToken,
          values: { answer: "staffing-only" },
        }),
      ).toEqual({ ok: true });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const staffingEntity = await t.query(api.facts.getEntity, {
        tenantSlug: STAFFING_TENANT,
        e: "shared:subject",
      });
      const legalEntity = await t.query(api.facts.getEntity, {
        tenantSlug: LEGAL_TENANT,
        e: "shared:subject",
      });
      expect(staffingEntity.attributes["shared_intake/answer"]).toEqual([
        "staffing-only",
      ]);
      expect(legalEntity.attributes["shared_intake/answer"]).toBeUndefined();

      const staffingAfter = await t.query(api.flows.listFlows, {
        tenantSlug: STAFFING_TENANT,
        subject: "shared:subject",
      });
      const legalAfter = await t.query(api.flows.listFlows, {
        tenantSlug: LEGAL_TENANT,
        subject: "shared:subject",
      });
      expect(staffingAfter[0].status).toBe("completed");
      expect(legalAfter[0].status).toBe("waiting");
      expect(await t.query(api.forms.collectionByToken, { token: legalToken })).toMatchObject({
        found: true,
        subject: "shared:subject",
        form: "shared_intake",
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
