/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { normalizeViewSpec, validateViewSpecStructure } from "@metacrdt/views";
import { api } from "./_generated/api";
import { STAFFING_BLUEPRINT, STAFFING_VIEWS } from "./appconfig";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function flush(t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

const MINIMAL_SPEC = {
  root: {
    type: "text",
    content: "Hello view",
  },
};

describe("ontology view registry", () => {
  test("define/list/get round-trips view definitions", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({
        tokenIdentifier: "system",
      });

      await t.mutation(api.views.defineView, {
        name: "hello",
        label: "Hello",
        description: "A tiny view.",
        spec: MINIMAL_SPEC,
      });

      const list = await t.query(api.views.listViews, {});
      expect(list).toEqual([
        { name: "hello", label: "Hello", description: "A tiny view." },
      ]);

      const loaded = await t.query(api.views.getView, { name: "hello" });
      expect(loaded).toMatchObject({
        name: "hello",
        label: "Hello",
        description: "A tiny view.",
        spec: MINIMAL_SPEC,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  test("listViews uses metadata only and does not parse specJson", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "system",
    });

    await t.mutation(api.views.defineView, {
      name: "metadata-only",
      label: "Metadata only",
      spec: MINIMAL_SPEC,
    });
    await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("currentFacts")
        .withIndex("by_e_a", (q) =>
          q.eq("e", "view:metadata-only").eq("a", "specJson"),
        )
        .collect();
      for (const row of rows) await ctx.db.patch(row._id, { v: "{" });
    });

    expect(await t.query(api.views.listViews, {})).toEqual([
      {
        name: "metadata-only",
        label: "Metadata only",
        description: undefined,
      },
    ]);
  });

  test("defineView skips byte-identical redefines", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "system",
    });

    const first = await t.mutation(api.views.defineView, {
      name: "stable",
      label: "Stable",
      spec: MINIMAL_SPEC,
    });
    const eventCount = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("factEvents")
        .withIndex("by_e", (q) => q.eq("e", "view:stable"))
        .collect();
      return rows.length;
    });
    const second = await t.mutation(api.views.defineView, {
      name: "stable",
      label: "Stable",
      spec: MINIMAL_SPEC,
    });
    const eventCountAfter = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("factEvents")
        .withIndex("by_e", (q) => q.eq("e", "view:stable"))
        .collect();
      return rows.length;
    });

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(eventCountAfter).toBe(eventCount);
  });

  test("applyConfig is idempotent and reconciles removed views", async () => {
    vi.useFakeTimers();
    try {
      const t = convexTest(schema, modules).withIdentity({
        tokenIdentifier: "system",
      });

      vi.setSystemTime(1_000);
      await t.mutation(api.appconfig.applyConfig, {
        config: { views: STAFFING_BLUEPRINT.views },
      });
      await flush(t);
      vi.setSystemTime(2_000);
      await t.mutation(api.appconfig.applyConfig, {
        config: { views: STAFFING_BLUEPRINT.views },
      });
      await flush(t);

      let views = await t.query(api.views.listViews, {});
      expect(views.map((view) => view.name)).toEqual([
        "onboarding-dashboard",
        "worker-roster",
      ]);

      vi.setSystemTime(3_000);
      await t.mutation(api.appconfig.applyConfig, {
        config: {
          views: STAFFING_BLUEPRINT.views.filter(
            (view) => view.name !== "worker-roster",
          ),
        },
      });
      await flush(t);

      views = await t.query(api.views.listViews, {});
      expect(views.map((view) => view.name)).toEqual([
        "onboarding-dashboard",
      ]);
      expect(await t.query(api.views.getView, { name: "worker-roster" })).toBe(
        null,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  test("defineView rejects malformed specs", async () => {
    const t = convexTest(schema, modules).withIdentity({
      tokenIdentifier: "system",
    });

    await expect(
      t.mutation(api.views.defineView, {
        name: "bad",
        spec: { description: "Missing root" },
      }),
    ).rejects.toThrow(/malformed view spec/);
  });

  test("staffing blueprint views pass full ViewSpec structure validation", () => {
    for (const view of STAFFING_VIEWS) {
      const result = validateViewSpecStructure(normalizeViewSpec(view.spec));
      expect(result.issues).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });
});
