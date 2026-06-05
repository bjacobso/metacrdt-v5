import { query } from "./_generated/server";
import { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { COMPARISON_OPS, project, runWhere } from "./lib/engine";

// The attribute that designates an entity's type (the "table" it belongs to).
const TYPE_ATTR = "type";
const SAMPLE = 1000;

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

/** Distinct entity types (values of the `type` attribute) with counts. */
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
    return [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  },
});

/** Entity options for a picker: ids (+ name label) of a type, or across all types. */
export const listEntities = query({
  args: { type: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const cap = Math.min(args.limit ?? 500, 1000);
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
    const out: { id: string; name?: string; type: string }[] = [];
    for (const r of typeRows) {
      if (seen.has(r.e)) continue;
      seen.add(r.e);
      const nameRow = await ctx.db
        .query("currentFacts")
        .withIndex("by_e_a", (q) => q.eq("e", r.e).eq("a", "name"))
        .first();
      out.push({
        id: r.e,
        name: nameRow ? String(nameRow.v) : undefined,
        type: String(r.v),
      });
    }
    out.sort((a, b) => a.id.localeCompare(b.id));
    return out;
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
