import { mutation, query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { assertInTx, createTransaction, retractInTx } from "./facts";

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
});

function formEntity(form: string): string {
  return `form:${form}`;
}

/** Define (or replace) a form's field schema. */
export const defineForm = mutation({
  args: {
    form: v.string(),
    title: v.string(),
    fields: v.array(fieldValidator),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const e = formEntity(args.form);
    const txId = await createTransaction(ctx, {
      reason: `define form ${args.form}`,
      now,
    });

    // Manual cardinality-one for formDef: retract any prior definition.
    const prior = await ctx.db
      .query("currentFacts")
      .withIndex("by_e_a", (q) => q.eq("e", e).eq("a", "formDef"))
      .collect();
    for (const row of prior) {
      await retractInTx(ctx, txId, now, row.factId, "form redefined");
    }

    await assertInTx(ctx, txId, now, { e, a: "type", value: "Form" });
    await assertInTx(ctx, txId, now, {
      e,
      a: "formDef",
      value: { title: args.title, fields: args.fields },
    });
    return { formEntity: e };
  },
});

async function loadFormDef(
  ctx: QueryCtx,
  form: string,
): Promise<{ title: string; fields: unknown[] } | null> {
  const row = await ctx.db
    .query("currentFacts")
    .withIndex("by_e_a", (q) => q.eq("e", formEntity(form)).eq("a", "formDef"))
    .first();
  return row ? (row.v as { title: string; fields: unknown[] }) : null;
}

/** A form's field schema (for rendering). */
export const formFields = query({
  args: { form: v.string() },
  handler: async (ctx, args) => {
    return await loadFormDef(ctx, args.form);
  },
});

/**
 * Public, token-keyed view for the isolated collection page: the flow run's
 * target plus the form's fields. Magic-link style — no auth (demo-grade).
 */
export const collectionByToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const run = await ctx.db
      .query("flowRuns")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!run || !run.form || !run.scope) return { found: false as const };
    const def = await loadFormDef(ctx, run.form);
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
 * flow and clears the obligation. Idempotent-ish: only acts on a waiting run.
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
    if (!run) return { ok: false as const, reason: "unknown token" };
    if (run.status !== "waiting") {
      return { ok: false as const, reason: "already submitted" };
    }
    if (!run.form || !run.scope) {
      return { ok: false as const, reason: "run is not awaiting a collection" };
    }

    const now = Date.now();
    const txId = await createTransaction(ctx, {
      actorId: run.subject,
      reason: `submit ${run.form}`,
      now,
    });

    const values = (args.values ?? {}) as Record<string, unknown>;
    for (const [field, value] of Object.entries(values)) {
      await assertInTx(ctx, txId, now, {
        e: run.subject,
        a: `${run.form}/${field}`,
        value,
      });
    }
    // The marker that satisfies the obligation and resumes the flow.
    await assertInTx(ctx, txId, now, {
      e: run.subject,
      a: `submitted.${run.form}`,
      value: run.scope,
    });

    await ctx.db.patch("flowRuns", run._id, { context: values });
    return { ok: true as const };
  },
});
