/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { STAFFING_BLUEPRINT } from "./appconfig";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function flush(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function setup(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.mutation(api.appconfig.setupStaffing, {});
  await flush(t);
}

describe("config-as-code + origin + entity detail", () => {
  test("applyConfig registers configured types; meta types are system", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);

      const types = await t.query(api.entities.listEntityTypes, {});
      const byName = new Map(types.map((x) => [x.type, x]));

      // Blueprint types are declared → configured.
      expect(byName.get("Worker")?.origin).toBe("configured");
      expect(byName.get("Placement")?.origin).toBe("configured");
      // Schema/form/action carriers are system.
      expect(byName.get("Attribute")?.origin).toBe("system");
      expect(byName.get("EntityType")?.origin).toBe("system");
      expect(byName.get("Form")?.origin).toBe("system");
      expect(byName.get("Action")?.origin).toBe("system");
    } finally {
      vi.useRealTimers();
    }
  });

  test("listEntities origin filter splits data from system machinery", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);

      const data = await t.query(api.entities.listEntities, { origin: "data" });
      const sys = await t.query(api.entities.listEntities, { origin: "system" });

      // Maria is data; the type:/attr:/form: carriers are system.
      expect(data.some((x) => x.id === "worker:maria")).toBe(true);
      expect(data.every((x) => x.origin === "data")).toBe(true);
      expect(data.some((x) => x.id.startsWith("type:"))).toBe(false);

      expect(sys.some((x) => x.id === "type:Worker")).toBe(true);
      expect(sys.every((x) => x.origin === "system")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("entityDetail computes flows, obligations, and state for a worker", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);

      const d = await t.query(api.entities.entityDetail, { e: "worker:maria" });
      expect(d.types).toContain("Worker");
      expect(d.origin).toBe("data");
      // Onboarding flow applies (subjectType Worker).
      expect(d.flows.some((f) => f.name === "onboarding")).toBe(true);
      // Open obligations surfaced (i9 etc.).
      expect(d.obligations.some((o) => o.form === "i9" && o.open)).toBe(true);
      // Terminate/reactivate actions apply to Worker.
      expect(d.actions.some((a) => a.name === "terminate")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("configured type schema drives entity table columns", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);

      const shape = await t.query(api.attributes.typeSchemaAsOf, {
        type: "Placement",
      });
      expect(shape.attributes).toEqual([
        "client",
        "employer",
        "job",
        "venue",
        "worker",
      ]);
      expect(shape.columns.find((c) => c.name === "worker")).toMatchObject({
        valueType: "entityRef",
        cardinality: "one",
      });

      const rows = await t.query(api.entities.queryEntities, {
        type: "Placement",
        pageSize: 10,
      });
      expect(rows.total).toBeGreaterThan(0);
      const first = rows.page.find((r) => r.id === "placement:p1");
      expect(first?.attributes.worker).toEqual(["worker:maria"]);
      expect(first?.attributes.employer).toEqual(["employer:acme"]);
    } finally {
      vi.useRealTimers();
    }
  });

  test("runAction asserts the action's facts on the target entity", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);

      await t.mutation(api.actions.runAction, {
        action: "terminate",
        entity: "worker:maria",
      });
      await flush(t);

      const e = await t.query(api.facts.getEntity, { e: "worker:maria" });
      expect(e.attributes["worker.status"]).toEqual(["terminated"]);

      // Idempotent action defs: rerunning the blueprint doesn't duplicate.
      await t.mutation(api.appconfig.applyConfig, {
        config: { actions: [{ name: "terminate", label: "Terminate worker", appliesTo: "Worker", asserts: { "worker.status": "terminated" } }] },
      });
      await flush(t);
      const acts = await t.query(api.actions.actionsForType, { type: "Worker" });
      expect(acts.filter((a) => a.name === "terminate").length).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("runAction resolves configured action args into asserted facts", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);

      await t.mutation(api.appconfig.applyConfig, {
        config: {
          actions: [
            {
              name: "set_status",
              label: "Set worker status",
              appliesTo: "Worker",
              fields: [
                {
                  name: "status",
                  label: "Status",
                  type: "select",
                  options: ["active", "terminated"],
                },
              ],
              asserts: { "worker.status": "$arg.status" },
            },
          ],
        },
      });
      await flush(t);

      const actions = await t.query(api.actions.actionsForType, { type: "Worker" });
      expect(actions.find((a) => a.name === "set_status")?.fields).toEqual([
        {
          name: "status",
          label: "Status",
          type: "select",
          options: ["active", "terminated"],
        },
      ]);

      await t.mutation(api.actions.runAction, {
        action: "set_status",
        entity: "worker:maria",
        args: { status: "terminated" },
      });
      await flush(t);

      const e = await t.query(api.facts.getEntity, { e: "worker:maria" });
      expect(e.attributes["worker.status"]).toEqual(["terminated"]);

      await expect(
        t.mutation(api.actions.runAction, {
          action: "set_status",
          entity: "worker:maria",
          args: {},
        }),
      ).rejects.toThrow(/missing action arg: status/);
    } finally {
      vi.useRealTimers();
    }
  });

  test("runAction rejects unknown arg placeholders", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);

      await t.mutation(api.appconfig.applyConfig, {
        config: {
          actions: [
            {
              name: "bad_placeholder",
              appliesTo: "Worker",
              fields: [{ name: "status", type: "string" }],
              asserts: { "worker.status": "$arg.missing" },
            },
          ],
        },
      });
      await flush(t);

      await expect(
        t.mutation(api.actions.runAction, {
          action: "bad_placeholder",
          entity: "worker:maria",
          args: { status: "active" },
        }),
      ).rejects.toThrow(/unknown action arg placeholder: missing/);
    } finally {
      vi.useRealTimers();
    }
  });

  test("runAction can open a configured collection form", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);

      await t.mutation(api.appconfig.applyConfig, {
        config: {
          actions: [
            {
              name: "collect_i9",
              label: "Collect I-9",
              appliesTo: "Worker",
              fields: [{ name: "scope", label: "Employer", type: "string" }],
              opensForm: { form: "i9", scope: "$arg.scope" },
              asserts: {},
            },
          ],
        },
      });
      await flush(t);

      const actions = await t.query(api.actions.actionsForType, { type: "Worker" });
      expect(actions.find((a) => a.name === "collect_i9")?.opensForm).toEqual({
        form: "i9",
        scope: "$arg.scope",
      });

      const first = await t.mutation(api.actions.runAction, {
        action: "collect_i9",
        entity: "worker:maria",
        args: { scope: "employer:acme" },
      });
      expect(first.asserted).toBe(0);
      expect(first.collect?.collectUrl).toMatch(/^\/collect\?token=/);
      expect(first.collect?.reused).toBe(false);

      const token = first.collect!.token;
      const page = await t.query(api.forms.collectionByToken, { token });
      expect(page).toMatchObject({
        found: true,
        subject: "worker:maria",
        form: "i9",
        scope: "employer:acme",
        title: "Form I-9",
      });

      const second = await t.mutation(api.actions.runAction, {
        action: "collect_i9",
        entity: "worker:maria",
        args: { scope: "employer:acme" },
      });
      expect(second.collect?.token).toBe(token);
      expect(second.collect?.reused).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("system processes report live counts", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);
      const procs = await t.query(api.system.listSystemProcesses, {});
      const reconciler = procs.find((p) => p.name === "compliance-reconciler");
      expect(reconciler).toBeDefined();
      // 4 requirements → 8 compliance rules.
      const ruleStat = reconciler!.stats.find((s) => s.label === "compliance rules");
      expect(ruleStat!.value).toBe(8);
    } finally {
      vi.useRealTimers();
    }
  });

  test("applyConfig reconcile removes dropped requirements and obligations", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);

      let detail = await t.query(api.entities.entityDetail, { e: "worker:maria" });
      expect(detail.obligations.some((o) => o.form === "forklift")).toBe(true);

      await t.mutation(api.appconfig.applyConfig, {
        config: {
          requirements: STAFFING_BLUEPRINT.requirements.filter(
            (r) => r.form !== "forklift",
          ),
        },
      });
      await flush(t);

      detail = await t.query(api.entities.entityDetail, { e: "worker:maria" });
      expect(detail.obligations.some((o) => o.form === "forklift")).toBe(false);
      const rules = await t.query(api.rules.listRules, {});
      expect(rules.find((r) => r.name === "require.forklift")?.enabled).toBe(false);
      expect(rules.find((r) => r.name === "task.forklift")?.enabled).toBe(false);

      await t.mutation(api.appconfig.applyConfig, {
        config: { requirements: STAFFING_BLUEPRINT.requirements },
      });
      await flush(t);

      detail = await t.query(api.entities.entityDetail, { e: "worker:maria" });
      expect(detail.obligations.some((o) => o.form === "forklift")).toBe(true);
      const restoredRules = await t.query(api.rules.listRules, {});
      expect(restoredRules.find((r) => r.name === "require.forklift")?.enabled).toBe(
        true,
      );
      expect(restoredRules.find((r) => r.name === "task.forklift")?.enabled).toBe(
        true,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("applyConfig reconcile removes dropped actions only when actions are present", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);

      await t.mutation(api.appconfig.applyConfig, {
        config: {
          actions: STAFFING_BLUEPRINT.actions.filter((a) => a.name !== "terminate"),
        },
      });
      await flush(t);

      const actions = await t.query(api.actions.actionsForType, { type: "Worker" });
      expect(actions.some((a) => a.name === "terminate")).toBe(false);
      expect(actions.some((a) => a.name === "reactivate")).toBe(true);

      // Partial action reconciliation did not wipe the rest of the blueprint.
      const form = await t.query(api.forms.formFields, { form: "i9" });
      expect(form?.title).toBe("Form I-9");
    } finally {
      vi.useRealTimers();
    }
  });

  test("applyConfig reconcile removes configured type and attribute without deleting data", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      await setup(t);

      await t.mutation(api.appconfig.applyConfig, {
        config: {
          attributes: STAFFING_BLUEPRINT.attributes.filter((a) => a.name !== "venue"),
          entityTypes: STAFFING_BLUEPRINT.entityTypes.filter((e) => e.name !== "Venue"),
        },
      });
      await flush(t);

      const attrs = await t.query(api.attributes.listAttributes, {});
      expect(attrs.some((a) => a.name === "venue")).toBe(false);

      const types = await t.query(api.entities.listEntityTypes, {});
      const venueType = types.find((t) => t.type === "Venue");
      expect(venueType?.origin).toBe("data");

      const venues = await t.query(api.entities.listEntities, {
        type: "Venue",
        origin: "data",
      });
      expect(venues.some((e) => e.id === "venue:stadium7")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  test("config history diffs owned artifacts across applyConfig runs", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
      vi.setSystemTime(1_000);
      await setup(t);

      let manifest = await t.query(api.configHistory.currentManifest, {});
      expect(manifest.requirement).toContain("forklift");
      expect(manifest.action).toEqual(["reactivate", "terminate"]);

      let history = await t.query(api.configHistory.history, { limit: 10 });
      expect(
        history.some((h) =>
          h.added.some((i) => i.kind === "requirement" && i.value === "forklift"),
        ),
      ).toBe(true);

      vi.setSystemTime(2_000);
      await t.mutation(api.appconfig.applyConfig, {
        config: {
          requirements: STAFFING_BLUEPRINT.requirements.filter(
            (r) => r.form !== "forklift",
          ),
        },
      });
      await flush(t);

      manifest = await t.query(api.configHistory.currentManifest, {});
      expect(manifest.requirement).not.toContain("forklift");

      history = await t.query(api.configHistory.history, { limit: 5 });
      expect(history[0].removed).toContainEqual({
        kind: "requirement",
        value: "forklift",
      });

      vi.setSystemTime(3_000);
      await t.mutation(api.appconfig.applyConfig, {
        config: {
          requirements: STAFFING_BLUEPRINT.requirements.filter(
            (r) => r.form !== "forklift",
          ),
        },
      });
      await flush(t);

      history = await t.query(api.configHistory.history, { limit: 1 });
      expect(history[0].added).toEqual([]);
      expect(history[0].removed).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
