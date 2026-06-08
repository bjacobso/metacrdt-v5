/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seedPiiSubmission(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.mutation(api.forms.defineForm, {
    form: "i9",
    title: "Form I-9",
    fields: [
      { name: "ssn", label: "SSN", type: "string", required: true, pii: true },
      { name: "dob", label: "DOB", type: "date", required: true },
    ],
  });
  await t.mutation(api.flows.startCollect, {
    subject: "worker:t1",
    form: "i9",
    scope: "employer:acme",
  });
  const flows = await t.query(api.flows.listFlows, { subject: "worker:t1" });
  await t.mutation(api.forms.submitCollection, {
    token: flows[0].token!,
    values: { ssn: "123-45-6789", dob: "1990-01-01" },
  });
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("attribute-level read authorization", () => {
  test("PII form fields are denied until the authenticated principal has a grant", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const writer = t.withIdentity({ tokenIdentifier: "system" });
      await seedPiiSubmission(writer);
      await writer.mutation(api.facts.assertFact, {
        e: "worker:t1",
        a: "type",
        value: "Worker",
      });

      const anon = await t.query(api.facts.getEntity, { e: "worker:t1" });
      expect(anon.attributes["i9/ssn"]).toBeUndefined();
      expect(anon.attributes["i9/dob"]).toEqual(["1990-01-01"]);
      expect(anon.denied).toEqual([{ a: "i9/ssn", reason: "pii" }]);

      const publicEntities = await t.query(api.entities.queryEntities, {
        type: "Worker",
      });
      const publicWorker = publicEntities.page.find((r) => r.id === "worker:t1");
      expect(publicWorker?.attributes["i9/ssn"]).toBeUndefined();
      expect(publicWorker?.attributes["i9/dob"]).toEqual(["1990-01-01"]);
      expect(publicWorker?.denied).toEqual([{ a: "i9/ssn", reason: "pii" }]);

      const noGrant = t.withIdentity({ tokenIdentifier: "user:hr" });
      const stillDenied = await noGrant.query(api.facts.entityFactsAsOf, {
        e: "worker:t1",
      });
      expect(stillDenied.facts.some((f) => f.a === "i9/ssn")).toBe(false);
      expect(stillDenied.denied).toEqual([{ a: "i9/ssn", reason: "pii" }]);

      await writer.mutation(api.facts.assertFact, {
        e: "user:hr",
        a: "grants.read",
        value: { e: "worker:t1", a: "i9/ssn" },
        reason: "grant HR read access to worker I-9 SSN",
      });
      await writer.finishAllScheduledFunctions(vi.runAllTimers);

      const allowed = await noGrant.query(api.facts.getEntity, {
        e: "worker:t1",
      });
      expect(allowed.attributes["i9/ssn"]).toEqual(["123-45-6789"]);
      expect(allowed.denied).toEqual([]);

      const grantedEntities = await noGrant.query(api.entities.queryEntities, {
        type: "Worker",
      });
      const grantedWorker = grantedEntities.page.find((r) => r.id === "worker:t1");
      expect(grantedWorker?.attributes["i9/ssn"]).toEqual(["123-45-6789"]);
      expect(grantedWorker?.denied).toEqual([]);

      const publicFacts = await t.query(api.facts.queryFacts, {
        e: "worker:t1",
        a: "i9/ssn",
      });
      expect(publicFacts).toEqual([]);

      const compareCoord = {
        txTime: Date.now() + 1000,
        validTime: Date.now() + 1000,
      };
      const publicCompare = await t.query(api.facts.compareFacts, {
        e: "worker:t1",
        a: "i9/ssn",
        before: compareCoord,
        after: compareCoord,
      });
      expect(publicCompare.before).toEqual([]);
      expect(publicCompare.after).toEqual([]);
      expect(publicCompare.changed).toBe(false);
      expect(publicCompare.denied).toEqual({ a: "i9/ssn", reason: "pii" });

      const grantedFacts = await noGrant.query(api.facts.queryFacts, {
        e: "worker:t1",
        a: "i9/ssn",
      });
      expect(grantedFacts.map((f) => f.v)).toEqual(["123-45-6789"]);

      const grantedCompare = await noGrant.query(api.facts.compareFacts, {
        e: "worker:t1",
        a: "i9/ssn",
        before: compareCoord,
        after: compareCoord,
      });
      expect(grantedCompare.before).toEqual(["123-45-6789"]);
      expect(grantedCompare.after).toEqual(["123-45-6789"]);
      expect(grantedCompare.changed).toBe(false);
      expect(grantedCompare.denied).toBeNull();

      const publicDatalog = await t.query(api.datalog.datalog, {
        where: [["worker:t1", "i9/ssn", "?ssn"]],
        select: ["?ssn"],
      });
      expect(publicDatalog).toEqual([]);

      const grantedDatalog = await noGrant.query(api.datalog.datalog, {
        where: [["worker:t1", "i9/ssn", "?ssn"]],
        select: ["?ssn"],
      });
      expect(grantedDatalog).toEqual([{ ssn: "123-45-6789" }]);
    } finally {
      vi.useRealTimers();
    }
  });
});
