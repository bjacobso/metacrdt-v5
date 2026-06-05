import { query } from "./_generated/server";
import { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { COMPARISON_OPS, project, runWhere } from "./lib/engine";
import { META, typeNameOf } from "./lib/meta";
import { Origin, entityOrigin, isSystemEntity, typeOrigin } from "./lib/origin";

// The attribute that designates an entity's type (the "table" it belongs to).
const TYPE_ATTR = "type";
const SAMPLE = 1000;

/** The set of formally-declared type names (type:<Name> registry entities). */
async function configuredTypeNames(ctx: QueryCtx): Promise<Set<string>> {
  const regs = await ctx.db
    .query("currentFacts")
    .withIndex("by_a_v", (q) => q.eq("a", TYPE_ATTR).eq("v", META.entityType))
    .take(SAMPLE);
  return new Set(regs.map((r) => typeNameOf(r.e)));
}

/** All `type` values currently asserted on an entity. */
async function typesOf(ctx: QueryCtx, e: string): Promise<string[]> {
  const rows = await ctx.db
    .query("currentFacts")
    .withIndex("by_e_a", (q) => q.eq("e", e).eq("a", TYPE_ATTR))
    .collect();
  return rows.map((r) => String(r.v));
}

function coerce(raw: string): unknown {
  const t = raw.trim();
  if (t === "") return "";
  try {
    return JSON.parse(t);
  } catch {
    return raw;
  }
}

function firstValue(vals: unknown[]): unknown {
  return vals.length > 0 ? vals[0] : undefined;
}

function compareForSort(a: unknown, b: unknown): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1; // missing sorts last
  if (b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/** Load an entity's current attributes as { attr: values[] }. */
async function loadAttributes(
  ctx: QueryCtx,
  e: string,
): Promise<Record<string, unknown[]>> {
  const rows = await ctx.db
    .query("currentFacts")
    .withIndex("by_e", (q) => q.eq("e", e))
    .collect();
  const attrs: Record<string, unknown[]> = {};
  for (const r of rows) (attrs[r.a] ??= []).push(r.v);
  return attrs;
}

/**
 * Distinct entity types with counts and an `origin` facet. The set is the union
 * of types discovered in data and types formally declared in the registry
 * (so a configured type shows even with zero instances). System meta-types are
 * tagged "system" so the UI can tuck them behind a "show system" affordance.
 */
export const listEntityTypes = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("currentFacts")
      .withIndex("by_a", (q) => q.eq("a", TYPE_ATTR))
      .take(SAMPLE);
    const counts = new Map<string, number>();
    for (const r of rows) {
      const t = String(r.v);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }

    const configured = await configuredTypeNames(ctx);
    // Include declared-but-empty configured types.
    for (const name of configured) if (!counts.has(name)) counts.set(name, 0);

    return [...counts.entries()]
      .map(([type, count]) => ({
        type,
        count,
        origin: typeOrigin(type, configured.has(type)),
      }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  },
});

/**
 * Entity options for a picker / list: ids (+ name label) of a type, or across
 * all types, each tagged with `origin`. `origin: "data"` (the default) hides
 * system machinery; pass "system" for the schema/form/action carriers, or "all".
 */
export const listEntities = query({
  args: {
    type: v.optional(v.string()),
    limit: v.optional(v.number()),
    origin: v.optional(
      v.union(v.literal("data"), v.literal("system"), v.literal("all")),
    ),
  },
  handler: async (ctx, args) => {
    const cap = Math.min(args.limit ?? 500, 1000);
    const want = args.origin ?? "all";
    const typeRows = args.type
      ? await ctx.db
          .query("currentFacts")
          .withIndex("by_a_v", (q) => q.eq("a", TYPE_ATTR).eq("v", args.type))
          .take(cap)
      : await ctx.db
          .query("currentFacts")
          .withIndex("by_a", (q) => q.eq("a", TYPE_ATTR))
          .take(cap);

    const seen = new Set<string>();
    const out: { id: string; name?: string; type: string; origin: Origin }[] = [];
    for (const r of typeRows) {
      if (seen.has(r.e)) continue;
      seen.add(r.e);
      const sys = isSystemEntity(r.e, [String(r.v)]);
      if (want === "data" && sys) continue;
      if (want === "system" && !sys) continue;
      const nameRow = await ctx.db
        .query("currentFacts")
        .withIndex("by_e_a", (q) => q.eq("e", r.e).eq("a", "name"))
        .first();
      out.push({
        id: r.e,
        name: nameRow ? String(nameRow.v) : undefined,
        type: String(r.v),
        origin: sys ? "system" : "data",
      });
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
  },
});

/**
 * The full picture for one entity — the SaaS detail page in a single query:
 *   - current state (attribute map) + types/origin
 *   - flows runnable on it (flowDefs whose subjectType matches a type)
 *   - actions runnable on it (action:<name> defs whose appliesTo matches a type)
 *   - its flow runs (recent), and
 *   - its open obligations (requires./task. derived facts).
 * Everything is computed from type + config — nothing per-entity is hand-wired.
 */
export const entityDetail = query({
  args: { e: v.string() },
  handler: async (ctx, args) => {
    const e = args.e;
    const attributes = await loadAttributes(ctx, e);
    const types = (attributes[TYPE_ATTR] ?? []).map(String);
    const origin = entityOrigin(e, types);
    const name = (attributes["name"] ?? [])[0];

    // Flows runnable on this entity (subjectType ∈ its types).
    const allDefs = await ctx.db.query("flowDefs").take(50);
    const flows = allDefs
      .filter((d) => d.subjectType && types.includes(d.subjectType))
      .map((d) => ({
        name: d.name,
        title: d.title,
        steps: d.steps.map((s) => ({ id: s.id, type: s.type })),
      }));

    // Actions runnable on this entity (appliesTo ∈ its types).
    const actionDefs = await ctx.db
      .query("currentFacts")
      .withIndex("by_a_v", (q) => q.eq("a", TYPE_ATTR).eq("v", "Action"))
      .take(200);
    const actions: {
      name: string;
      label?: string;
      asserts: Record<string, unknown>;
    }[] = [];
    for (const ad of actionDefs) {
      const rows = await ctx.db
        .query("currentFacts")
        .withIndex("by_e", (q) => q.eq("e", ad.e))
        .collect();
      const m: Record<string, unknown[]> = {};
      for (const r of rows) (m[r.a] ??= []).push(r.v);
      const appliesTo = (m["appliesTo"] ?? []).map(String);
      if (!appliesTo.some((t) => types.includes(t))) continue;
      actions.push({
        name: ad.e.slice("action:".length),
        label: m["label"]?.[0] ? String(m["label"][0]) : undefined,
        asserts: (m["asserts"]?.[0] ?? {}) as Record<string, unknown>,
      });
    }

    // This entity's flow runs (most recent first).
    const runDocs = await ctx.db
      .query("flowRuns")
      .withIndex("by_subject", (q) => q.eq("subject", e))
      .order("desc")
      .take(20);
    const runs = runDocs.map((r) => ({
      _id: r._id,
      flowDefName: r.flowDefName ?? r.flowName,
      status: r.status,
      step: r.currentStepId ?? r.step,
      form: r.form,
      scope: r.scope,
      token: r.token,
      updatedAt: r.updatedAt,
    }));

    // Open obligations (derived requires./task. facts).
    const derived = (
      await ctx.db
        .query("derivedFacts")
        .withIndex("by_e", (q) => q.eq("e", e))
        .take(500)
    ).filter((d) => !d.stale);
    const obligations = derived
      .filter((d) => d.a.startsWith("requires.") || d.a.startsWith("task."))
      .map((d) => ({
        form: d.a.replace(/^(requires|task)\./, ""),
        scope: String(d.v),
        open: d.a.startsWith("task."),
      }));

    return {
      id: e,
      name: name !== undefined ? String(name) : undefined,
      types,
      origin,
      attributes,
      flows,
      actions,
      runs,
      obligations,
    };
  },
});

/** Discover the attribute columns present on entities of a given type. */
export const typeAttributes = query({
  args: { type: v.string() },
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("currentFacts")
      .withIndex("by_a_v", (q) => q.eq("a", TYPE_ATTR).eq("v", args.type))
      .take(200);
    const attrs = new Set<string>();
    for (const m of members) {
      const rows = await ctx.db
        .query("currentFacts")
        .withIndex("by_e", (q) => q.eq("e", m.e))
        .collect();
      for (const r of rows) attrs.add(r.a);
    }
    attrs.delete(TYPE_ATTR);
    return [...attrs].sort();
  },
});

const filterValidator = v.object({
  attribute: v.string(),
  op: v.string(),
  value: v.string(),
});

/**
 * List entities of a type as a table, with a dynamic filter/sort spec that is
 * compiled into a Datalog query. Filters become pattern/comparison clauses;
 * the result set is sorted by an attribute and paginated with an opaque cursor.
 * Returns the compiled `where` so the UI can show what it ran.
 */
export const queryEntities = query({
  args: {
    type: v.string(),
    filters: v.optional(v.array(filterValidator)),
    sort: v.optional(
      v.object({
        attribute: v.string(),
        dir: v.union(v.literal("asc"), v.literal("desc")),
      }),
    ),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const pageSize = Math.min(Math.max(args.pageSize ?? 25, 1), 100);
    const offset = args.cursor ? Math.max(parseInt(args.cursor, 10) || 0, 0) : 0;

    // Compile the type + filter spec into a Datalog `where`.
    const where: unknown[] = [["?e", TYPE_ATTR, args.type]];
    let i = 0;
    for (const f of args.filters ?? []) {
      const val = coerce(f.value);
      if (f.op === "=" || f.op === "==") {
        where.push(["?e", f.attribute, val]);
      } else if (COMPARISON_OPS.has(f.op)) {
        const fv = `?fv${i++}`;
        where.push(["?e", f.attribute, fv]);
        where.push([fv, f.op, val]);
      } else {
        throw new Error(`unsupported filter operator: ${f.op}`);
      }
    }

    const coord = { txTime: Date.now(), validTime: Date.now() };
    const bindings = await runWhere(ctx, where, coord);
    let ids = project(bindings, ["?e"]).map((r) => String(r.e));

    // Sort by an attribute via a single indexed scan (id -> value map), or by
    // id for a stable default.
    if (args.sort) {
      const valRows = await ctx.db
        .query("currentFacts")
        .withIndex("by_a", (q) => q.eq("a", args.sort!.attribute))
        .take(SAMPLE);
      const valueOf = new Map<string, unknown>();
      for (const r of valRows) {
        if (!valueOf.has(r.e)) valueOf.set(r.e, r.v);
      }
      const dir = args.sort.dir === "desc" ? -1 : 1;
      ids.sort(
        (a, b) => dir * compareForSort(valueOf.get(a), valueOf.get(b)),
      );
    } else {
      ids.sort();
    }

    const total = ids.length;
    const pageIds = ids.slice(offset, offset + pageSize);
    const page = await Promise.all(
      pageIds.map(async (id) => ({
        id,
        attributes: await loadAttributes(ctx, id),
      })),
    );

    const end = offset + pageSize;
    return {
      page,
      total,
      compiled: { where, select: ["?e"] },
      continueCursor: end < total ? String(end) : null,
      isDone: end >= total,
    };
  },
});
