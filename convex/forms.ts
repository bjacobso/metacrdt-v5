import { mutation, query, QueryCtx } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { assertInTx, createTransaction, retractInTx } from "./facts";
import { requireTenant, tenantOrLegacyRead } from "./lib/tenantAuth";
import type { Id } from "./_generated/dataModel";
import {
  formDefinitionFacts,
  formEntity,
  submissionFacts,
  tokenInvalidReason,
  type FormDef,
} from "./lib/collect";

// A form's field schema is itself a fact: (form:<name>, "formDef", {title, fields}).
// Keeps definitions on the schema-as-facts thesis; the collection page renders
// from it. Collected values are saved as facts (subject, "<form>/<field>", value),
// plus the scope-keyed (subject, "submitted.<form>", scope) marker that the event
// path uses to resume the parked flow and clear the compliance obligation.

const fieldValidator = v.object({
  name: v.string(),
  label: v.string(),
  type: v.union(
    v.literal("string"),
    v.literal("number"),
    v.literal("boolean"),
    v.literal("date"),
    v.literal("select"),
  ),
  required: v.optional(v.boolean()),
  options: v.optional(v.array(v.string())),
  pii: v.optional(v.boolean()),
  sensitive: v.optional(v.boolean()),
});

/** Define (or replace) a form's field schema. */
export const defineForm = mutation({
  args: {
    form: v.string(),
    title: v.string(),
    fields: v.array(fieldValidator),
    tenantSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, args.tenantSlug, "admin");
    const now = Date.now();
    const e = formEntity(args.form);
    const txId = await createTransaction(ctx, {
      tenantId: tenant.tenantId,
      reason: `define form ${args.form}`,
      now,
    });

    // Manual cardinality-one for formDef: retract any prior definition.
    const prior = await ctx.db
      .query("currentFacts")
      .withIndex("by_tenant_and_e_a", (q) =>
        q.eq("tenantId", tenant.tenantId).eq("e", e).eq("a", "formDef"),
      )
      .collect();
    for (const row of prior) {
      await retractInTx(ctx, txId, now, row.factId, "form redefined");
    }

    for (const fact of formDefinitionFacts({
      form: args.form,
      title: args.title,
      fields: args.fields,
    })) {
      await assertInTx(ctx, txId, now, fact);
    }
    return { formEntity: e };
  },
});

async function loadFormDef(
  ctx: QueryCtx,
  form: string,
  tenantId?: Id<"tenants">,
): Promise<{ title: string; fields: unknown[] } | null> {
  const row =
    tenantId === undefined
      ? await ctx.db
          .query("currentFacts")
          .withIndex("by_e_a", (q) => q.eq("e", formEntity(form)).eq("a", "formDef"))
          .first()
      : await ctx.db
          .query("currentFacts")
          .withIndex("by_tenant_and_e_a", (q) =>
            q
              .eq("tenantId", tenantId)
              .eq("e", formEntity(form))
              .eq("a", "formDef"),
          )
          .first();
  return row ? (row.v as { title: string; fields: unknown[] }) : null;
}

async function loadComponentFormDef(
  ctx: QueryCtx,
  form: string,
): Promise<{ title: string; fields: unknown[] } | null> {
  const entity = await ctx.runQuery(components.metacrdt.log.getCurrentEntity, {
    e: formEntity(form),
  });
  const def = entity?.attributes.find((attr) => attr.a === "formDef")?.values[0];
  return def && typeof def === "object"
    ? (def as { title: string; fields: unknown[] })
    : null;
}

/** A form's field schema (for rendering). */
export const formFields = query({
  args: { form: v.string(), tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await tenantOrLegacyRead(ctx, args.tenantSlug);
    return await loadFormDef(ctx, args.form, tenant?.tenantId);
  },
});

/**
 * Public, token-keyed view for the isolated collection page: the flow run's
 * target plus the form's fields. Magic-link style — hardened to only reveal
 * waiting, unexpired, unconsumed collection runs.
 */
export const collectionByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("flowRuns")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!run) {
      return await ctx.runQuery(components.metacrdt.log.collectionByToken, {
        token: args.token,
      });
    }
    if (!run.form || !run.scope) return { found: false as const };
    const invalid = tokenInvalidReason(run, Date.now());
    if (invalid) return { found: false as const, reason: invalid };
    const def =
      run.collectionTarget === "component"
        ? await loadComponentFormDef(ctx, run.form)
        : await loadFormDef(ctx, run.form, run.tenantId);
    return {
      found: true as const,
      status: run.status,
      subject: run.subject,
      form: run.form,
      scope: run.scope,
      title: def?.title ?? run.form,
      fields: def?.fields ?? [],
    };
  },
});

/**
 * Submit a collection: save each field value as a fact, then assert the
 * scope-keyed submission marker — which (via the event path) resumes the parked
 * flow and clears the obligation. The token is single-use and may expire.
 */
export const submitCollection = mutation({
  args: {
    token: v.string(),
    values: v.any(), // Record<fieldName, value>
  },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("flowRuns")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!run) {
      return await ctx.runMutation(components.metacrdt.log.submitCollection, {
        token: args.token,
        values: args.values,
      });
    }
    if (!run.form || !run.scope) {
      return { ok: false as const, reason: "run is not awaiting a collection" };
    }

    const now = Date.now();
    const invalid = tokenInvalidReason(run, now);
    if (invalid === "used") return { ok: false as const, reason: "already submitted" };
    if (invalid === "expired") {
      await ctx.db.patch("flowRuns", run._id, {
        status: "expired",
        step: "expired",
        updatedAt: now,
      });
      return { ok: false as const, reason: "expired token" };
    }
    if (invalid) return { ok: false as const, reason: "already submitted" };

    const values = (args.values ?? {}) as Record<string, unknown>;
    const def =
      run.collectionTarget === "component"
        ? await loadComponentFormDef(ctx, run.form)
        : await loadFormDef(ctx, run.form, run.tenantId);
    let facts;
    try {
      facts = def
        ? submissionFacts(
            run.subject,
            { form: run.form, title: def.title, fields: def.fields } as FormDef,
            values,
            run.scope,
            now,
          )
        : [
            ...Object.entries(values).map(([field, value]) => ({
              e: run.subject,
              a: `${run.form}/${field}`,
              value,
            })),
            { e: run.subject, a: `submitted.${run.form}`, value: run.scope },
          ];
    } catch (error) {
      return {
        ok: false as const,
        reason: error instanceof Error ? error.message : "invalid submission",
      };
    }

    if (run.collectionTarget === "component") {
      for (const fact of facts) {
        await ctx.runMutation(components.metacrdt.log.appendAssert, {
          actorId: run.subject,
          actorType: "user",
          txTime: now,
          reason: `submit ${run.form}`,
          source: "forms.submitCollection",
          e: fact.e,
          a: fact.a,
          v: fact.value,
        });
      }
    } else {
      const txId = await createTransaction(ctx, {
        tenantId: run.tenantId,
        actorId: run.subject,
        reason: `submit ${run.form}`,
        now,
      });

      for (const fact of facts) {
        await assertInTx(ctx, txId, now, fact);
      }
    }

    await ctx.db.patch("flowRuns", run._id, {
      context: values,
      tokenConsumedAt: now,
    });
    return { ok: true as const };
  },
});
