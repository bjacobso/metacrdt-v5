/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import { STAFFING_BLUEPRINT } from "./appconfig";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function flush(t: ReturnType<typeof convexTest>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

async function setup(t: ReturnType<typeof convexTest>) {
  await t.mutation(api.appconfig.setupStaffing, {});
  await flush(t);
}

describe("config-as-code + origin + entity detail", () => {
  test("applyConfig registers configured types; meta types are system", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
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
      const t = convexTest(schema, modules);
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
      const t = convexTest(schema, modules);
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

  test("runAction asserts the action's facts on the target entity", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
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

  test("system processes report live counts", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules);
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
      const t = convexTest(schema, modules);
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
      const t = convexTest(schema, modules);
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
      const t = convexTest(schema, modules);
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
});
