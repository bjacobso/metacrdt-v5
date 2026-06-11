/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import metacrdtSchema from "../../../packages/convex/src/component/schema";

const modules = import.meta.glob("./**/*.ts");
const metacrdtModules = import.meta.glob("../../../packages/convex/src/component/**/*.ts");

describe("write authorization", () => {
  test("anonymous callers cannot use general public write mutations", async () => {
    const t = convexTest(schema, modules);

    await expect(
      t.mutation(api.facts.assertFact, {
        e: "worker:anon",
        a: "type",
        value: "Worker",
      }),
    ).rejects.toThrow(/Not authenticated/);

    await expect(
      t.mutation(api.appconfig.setupStaffing, {}),
    ).rejects.toThrow(/Not authenticated/);
  });

  test("authenticated public writes record the server-derived principal", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "user:writer",
    });

    await t.mutation(api.facts.assertFact, {
      e: "worker:writer",
      a: "type",
      value: "Worker",
      actorId: "spoofed",
    });

    const asOf = await t.query(api.facts.entityFactsAsOf, {
      e: "worker:writer",
    });
    expect(asOf.facts.find((f) => f.a === "type")?.actor).toBe("user:writer");
  });

  test("component-owned public write wrappers require authentication", async () => {
    const t = convexTest(schema, modules);
    t.registerComponent("metacrdt", metacrdtSchema, metacrdtModules);

    await expect(
      t.mutation(api.metacrdtComponent.createOwnedEntity, {
        e: "component-auth:worker",
        type: "Worker",
      }),
    ).rejects.toThrow(/Not authenticated/);
  });

  test("collection submission remains token-authorized", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
      const writer = t.withIdentity({ tokenIdentifier: "user:issuer" });

      await writer.mutation(api.forms.defineForm, {
        form: "i9",
        title: "Form I-9",
        fields: [{ name: "dob", label: "DOB", type: "date" }],
      });
      await writer.mutation(api.flows.startCollect, {
        subject: "worker:collect-auth",
        form: "i9",
        scope: "employer:acme",
      });
      const flows = await t.query(api.flows.listFlows, {
        subject: "worker:collect-auth",
      });
      const token = flows[0].token!;

      const result = await t.mutation(api.forms.submitCollection, {
        token,
        values: { dob: "1990-01-01" },
      });
      expect(result).toEqual({ ok: true });

      await t.finishAllScheduledFunctions(vi.runAllTimers);
      const entity = await t.query(api.facts.getEntity, {
        e: "worker:collect-auth",
      });
      expect(entity.attributes["i9/dob"]).toEqual(["1990-01-01"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
