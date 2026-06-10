import { mutation, query, internalMutation } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import { assertInTx, createTransaction } from "./facts";
import { requireWritePrincipal } from "./lib/writeAuth";
import { obligationsFromEventLog } from "./lib/obligations";
import {
  DAY_MS,
  requirementClauses,
  type RequirementSpec as CollectRequirementSpec,
} from "./lib/collect";

// Each form is required within a SCOPE (the entity attribute on a placement it
// keys off). A submission is keyed by the same scope entity, so one submission
// satisfies every placement sharing that scope — reuse falls out of the key.
type FormDef = CollectRequirementSpec;

export const FORMS: FormDef[] = [
  { form: "i9", scopeAttr: "employer", validityDays: 365 * 3 },
  { form: "handbook", scopeAttr: "client" },
  { form: "forklift", scopeAttr: "job", guard: ["role", "forklift"] },
  { form: "venue_disclosure", scopeAttr: "venue" },
];

// --- setup ------------------------------------------------------------------

/**
 * Install the compliance rules: per form, a requirement rule (placement →
 * `requires.<form>` keyed by scope entity) and a task rule (requirement ∧ NOT
 * submitted-in-scope → `task.<form>`). Both are plain Datalog rules over base
 * facts, so they recompute on the relevant fact changes — no rule chaining.
 */
export const setupComplianceRules = mutation({
  args: {},
  handler: async (ctx) => {
    await requireWritePrincipal(ctx);
    for (const f of FORMS) {
      const clauses = requirementClauses(f);

      await ctx.runMutation(api.rules.defineRule, {
        name: clauses.requirement.name,
        where: [...clauses.requirement.where],
        emit: clauses.requirement.emit,
        dependsOnAttributes: [...clauses.requirement.dependsOnAttributes],
      });

      await ctx.runMutation(api.rules.defineRule, {
        name: clauses.task.name,
        where: [...clauses.task.where],
        emit: clauses.task.emit,
        dependsOnAttributes: [...clauses.task.dependsOnAttributes],
      });
    }
    return { rules: FORMS.length * 2 };
  },
});

/** Seed the staffing demo domain (Maria placed by Acme across two placements). */
export const seedStaffingDemo = mutation({
  args: {},
  handler: async (ctx) => {
    await requireWritePrincipal(ctx);
    const now = Date.now();
    const txId = await createTransaction(ctx, {
      reason: "seed staffing demo",
      now,
    });
    const f = (e: string, a: string, value: unknown) =>
      assertInTx(ctx, txId, now, { e, a, value });

    // Subjects & scope entities.
    await f("worker:maria", "type", "Worker");
    await f("worker:maria", "name", "Maria");
    await f("worker:maria", "worker.status", "active");
    await f("employer:acme", "type", "Employer");
    await f("employer:acme", "name", "Acme Staffing");
    await f("client:globex", "type", "Client");
    await f("client:globex", "name", "Globex");
    await f("client:initech", "type", "Client");
    await f("client:initech", "name", "Initech");
    await f("job:forklift1", "type", "Job");
    await f("job:forklift1", "role", "forklift");
    await f("job:cashier1", "type", "Job");
    await f("job:cashier1", "role", "cashier");
    await f("venue:stadium7", "type", "Venue");
    await f("venue:stadium7", "name", "Stadium 7");

    // p1: Acme → Globex, forklift job at Stadium 7.
    await f("placement:p1", "type", "Placement");
    await f("placement:p1", "worker", "worker:maria");
    await f("placement:p1", "employer", "employer:acme");
    await f("placement:p1", "client", "client:globex");
    await f("placement:p1", "job", "job:forklift1");
    await f("placement:p1", "venue", "venue:stadium7");

    // p2: same employer (Acme) → different client (Initech), cashier job.
    await f("placement:p2", "type", "Placement");
    await f("placement:p2", "worker", "worker:maria");
    await f("placement:p2", "employer", "employer:acme");
    await f("placement:p2", "client", "client:initech");
    await f("placement:p2", "job", "job:cashier1");

    return { txId };
  },
});

// --- submissions ------------------------------------------------------------

/**
 * Record a form submission, scope-keyed: (worker, submitted.<form>, scope).
 * An optional validity window sets `validTo` so the submission lapses and the
 * obligation re-fires on expiry (picked up by the recompute cron).
 */
export const submitForm = mutation({
  args: {
    worker: v.string(),
    form: v.string(),
    scope: v.string(),
    validForDays: v.optional(v.number()),
    actorId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actorId = await requireWritePrincipal(ctx);
    const now = Date.now();
    const def = FORMS.find((f) => f.form === args.form);
    const days = args.validForDays ?? def?.validityDays;
    const txId = await createTransaction(ctx, {
      actorId,
      reason: `submit ${args.form} for ${args.scope}`,
      now,
    });
    const factId = await assertInTx(ctx, txId, now, {
      e: args.worker,
      a: `submitted.${args.form}`,
      value: args.scope,
      validTo: days !== undefined ? now + days * DAY_MS : undefined,
    });
    return { txId, factId };
  },
});

// --- recompute (cron + manual) ----------------------------------------------

/** Re-run all compliance rules — used by the cron for valid-time expiry. */
export const recomputeCompliance = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rules = await ctx.db
      .query("rules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();
    let scheduled = 0;
    for (const r of rules) {
      if (r.name.startsWith("require.") || r.name.startsWith("task.")) {
        await ctx.scheduler.runAfter(0, internal.materialize.recomputeRule, {
          ruleId: r._id,
        });
        scheduled++;
      }
    }
    return { scheduled };
  },
});

/** Manual trigger for the same recompute (handy for demoing expiry). */
export const recomputeNow = mutation({
  args: {},
  handler: async (ctx): Promise<{ scheduled: number }> => {
    await requireWritePrincipal(ctx);
    return await ctx.runMutation(internal.compliance.recomputeCompliance, {});
  },
});

// --- read model -------------------------------------------------------------

/**
 * A worker's compliance state: which forms are required (by scope) and which
 * are still open (task facts), each open task annotated with the placement
 * facts that justify it (provenance).
 */
export const workerCompliance = query({
  args: { worker: v.string() },
  handler: async (ctx, args) => {
    const required: { form: string; scope: string }[] = [];
    const open: {
      form: string;
      scope: string;
      because: { e: string; a: string; v: unknown }[];
    }[] = [];
    for (const obligation of await obligationsFromEventLog(ctx, {
      worker: args.worker,
      limit: 500,
    })) {
      if (!obligation.open) {
        required.push({ form: obligation.form, scope: obligation.scope });
      } else {
        const because = [];
        for (const fid of obligation.sourceFactIds) {
          const f = await ctx.db.get("facts", fid);
          if (f) because.push({ e: f.e, a: f.a, v: f.v });
        }
        open.push({
          form: obligation.form,
          scope: obligation.scope,
          because,
        });
      }
    }
    const invalidated = [];
    const invalidationRows = await ctx.db
      .query("currentFacts")
      .withIndex("by_e", (q) => q.eq("e", args.worker))
      .collect();
    for (const row of invalidationRows) {
      if (!row.a.startsWith("obligation.invalidated.")) continue;
      const form = row.a.slice("obligation.invalidated.".length);
      const value = row.v;
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        continue;
      }
      const payload = value as {
        scope?: unknown;
        reason?: unknown;
        invalidatedAt?: unknown;
      };
      if (typeof payload.scope !== "string") continue;
      invalidated.push({
        form,
        scope: payload.scope,
        reason:
          typeof payload.reason === "string" ? payload.reason : "unknown",
        invalidatedAt:
          typeof payload.invalidatedAt === "number"
            ? payload.invalidatedAt
            : null,
      });
    }
    required.sort((a, b) => (a.form + a.scope).localeCompare(b.form + b.scope));
    open.sort((a, b) => (a.form + a.scope).localeCompare(b.form + b.scope));
    invalidated.sort((a, b) =>
      (a.form + a.scope).localeCompare(b.form + b.scope),
    );
    return { worker: args.worker, required, open, invalidated };
  },
});
