import { query } from "./_generated/server";
import { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { COMPARISON_OPS, project, runWhere } from "./lib/engine";
import {
  eventLogBaseWithDerivedTripleSource,
  eventLogBaseWithDerivedTripleSourceForTenant,
  eventLogTripleSource,
  eventLogTripleSourceForTenant,
} from "./lib/eventLogTripleSource";
import { listActionDefs } from "./lib/actionDefs";
import { META, typeNameOf } from "./lib/meta";
import { obligationsFromEventLog } from "./lib/obligations";
import { Origin, entityOrigin, isSystemEntity, typeOrigin } from "./lib/origin";
import { redactAttributeMap, type DeniedAttribute } from "./lib/readAuth";
import { requireLegacyGlobalRead, requireTenant } from "./lib/tenantAuth";
import type { Id } from "./_generated/dataModel";

// The attribute that designates an entity's type (the "table" it belongs to).
const TYPE_ATTR = "type";
const SAMPLE = 1000;

async function readTenantOrLegacy(ctx: QueryCtx, tenantSlug?: string) {
  if (tenantSlug === undefined) {
    await requireLegacyGlobalRead(ctx);
    return null;
  }
  return await requireTenant(ctx, tenantSlug);
}

/** The set of formally-declared type names (type:<Name> registry entities). */
async function configuredTypeNames(
  ctx: QueryCtx,
  tenantId?: Id<"tenants">,
): Promise<Set<string>> {
  const rows = await projectCurrent(
    ctx,
    [["?e", TYPE_ATTR, META.entityType]],
    ["?e"],
    undefined,
    tenantId,
  );
  return new Set(rows.map((r) => typeNameOf(String(r.e))));
}

/** All `type` values currently asserted on an entity. */
async function typesOf(
  ctx: QueryCtx,
  e: string,
  tenantId?: Id<"tenants">,
): Promise<string[]> {
  const rows = await projectCurrent(
    ctx,
    [[e, TYPE_ATTR, "?type"]],
    ["?type"],
    undefined,
    tenantId,
  );
  return [...new Set(rows.map((r) => String(r.type)))].sort();
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

function compareForSort(a: unknown, b: unknown): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1; // missing sorts last
  if (b === undefined) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

async function projectCurrent(
  ctx: QueryCtx,
  where: unknown[],
  select: string[],
  coord: { txTime: number; validTime: number } = {
    txTime: Date.now(),
    validTime: Date.now(),
  },
  tenantId?: Id<"tenants">,
) {
  return project(
    await runWhere(ctx, where, coord, {}, {
      source:
        tenantId === undefined
          ? eventLogTripleSource
          : eventLogTripleSourceForTenant(tenantId),
    }),
    select,
  );
}

async function currentValues(
  ctx: QueryCtx,
  e: string,
  a: string,
  coord?: { txTime: number; validTime: number },
  tenantId?: Id<"tenants">,
): Promise<unknown[]> {
  const rows = await projectCurrent(ctx, [[e, a, "?v"]], ["?v"], coord, tenantId);
  return rows.map((row) => row.v);
}

/** Load an entity's current attributes as { attr: values[] }. */
async function loadAttributes(
  ctx: QueryCtx,
  e: string,
  coord: { txTime: number; validTime: number } = {
    txTime: Date.now(),
    validTime: Date.now(),
  },
  tenantId?: Id<"tenants">,
): Promise<{
  attributes: Record<string, unknown[]>;
  denied: DeniedAttribute[];
}> {
  const rows = await projectCurrent(
    ctx,
    [[e, "?a", "?v"]],
    ["?a", "?v"],
    coord,
    tenantId,
  );
  const attrs: Record<string, unknown[]> = {};
  for (const r of rows) (attrs[String(r.a)] ??= []).push(r.v);
  return await redactAttributeMap(ctx, e, attrs);
}

/**
 * Distinct entity types with counts and an `origin` facet. The set is the union
 * of types discovered in data and types formally declared in the registry
 * (so a configured type shows even with zero instances). System meta-types are
 * tagged "system" so the UI can tuck them behind a "show system" affordance.
 */
export const listEntityTypes = query({
  args: { tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
    const rows = (
      await projectCurrent(
        ctx,
        [["?e", TYPE_ATTR, "?type"]],
        ["?e", "?type"],
        undefined,
        tenant?.tenantId,
      )
    ).slice(0, SAMPLE);
    const counts = new Map<string, number>();
    const seen = new Set<string>();
    for (const r of rows) {
      const t = String(r.type);
      const key = `${String(r.e)}\u0000${t}`;
      if (seen.has(key)) continue;
      seen.add(key);
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }

    const configured = await configuredTypeNames(ctx, tenant?.tenantId);
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
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
    const cap = Math.min(args.limit ?? 500, 1000);
    const want = args.origin ?? "all";
    const coord = { txTime: Date.now(), validTime: Date.now() };
    const typeRows = (
      await projectCurrent(
        ctx,
        args.type
          ? [["?e", TYPE_ATTR, args.type]]
          : [["?e", TYPE_ATTR, "?type"]],
        args.type ? ["?e"] : ["?e", "?type"],
        coord,
        tenant?.tenantId,
      )
    ).slice(0, cap);

    const seen = new Set<string>();
    const out: { id: string; name?: string; type: string; origin: Origin }[] = [];
    for (const r of typeRows) {
      const id = String(r.e);
      if (seen.has(id)) continue;
      seen.add(id);
      const types =
        args.type !== undefined
          ? [args.type]
          : "type" in r
            ? [String(r.type)]
            : await typesOf(ctx, id, tenant?.tenantId);
      const type = types[0] ?? "";
      const sys = isSystemEntity(id, types);
      if (want === "data" && sys) continue;
      if (want === "system" && !sys) continue;
      const name = (await currentValues(ctx, id, "name", coord, tenant?.tenantId))[0];
      out.push({
        id,
        name: name !== undefined ? String(name) : undefined,
        type,
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
  args: { e: v.string(), tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
    const e = args.e;
    const { attributes, denied } = await loadAttributes(
      ctx,
      e,
      undefined,
      tenant?.tenantId,
    );
    const types = (attributes[TYPE_ATTR] ?? []).map(String);
    const origin = entityOrigin(e, types);
    const name = (attributes["name"] ?? [])[0];

    // Flows runnable on this entity (subjectType ∈ its types).
    const allDefs =
      tenant === null
        ? await ctx.db.query("flowDefs").take(50)
        : await ctx.db
            .query("flowDefs")
            .withIndex("by_tenant_and_name", (q) =>
              q.eq("tenantId", tenant.tenantId),
            )
            .take(50);
    const flows = allDefs
      .filter((d) => d.subjectType && types.includes(d.subjectType))
      .map((d) => ({
        name: d.name,
        title: d.title,
        steps: d.steps.map((s) => ({ id: s.id, type: s.type })),
      }));

    // Actions runnable on this entity (appliesTo ∈ its types).
    const actions = (await listActionDefs(ctx, tenant?.tenantId)).filter(
      (def) => def.appliesTo !== undefined && types.includes(def.appliesTo),
    );

    // This entity's flow runs (most recent first).
    const runDocs =
      tenant === null
        ? await ctx.db
            .query("flowRuns")
            .withIndex("by_subject", (q) => q.eq("subject", e))
            .order("desc")
            .take(20)
        : await ctx.db
            .query("flowRuns")
            .withIndex("by_tenant_and_subject", (q) =>
              q.eq("tenantId", tenant.tenantId).eq("subject", e),
            )
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

    // Open obligations (requires./task. rule outputs derived from factEvents).
    const obligations = (
      await obligationsFromEventLog(ctx, {
        worker: e,
        tenantId: tenant?.tenantId,
        limit: 500,
      })
    ).map((o) => ({
      form: o.form,
      scope: o.scope,
      open: o.open,
    }));

    return {
      id: e,
      name: name !== undefined ? String(name) : undefined,
      types,
      origin,
      attributes,
      denied,
      flows,
      actions,
      runs,
      obligations,
    };
  },
});

/** Discover the attribute columns present on entities of a given type. */
export const typeAttributes = query({
  args: { type: v.string(), tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
    const members = (
      await projectCurrent(
        ctx,
        [["?e", TYPE_ATTR, args.type]],
        ["?e"],
        undefined,
        tenant?.tenantId,
      )
    ).slice(0, 200);
    const attrs = new Set<string>();
    for (const m of members) {
      const rows = await projectCurrent(
        ctx,
        [[String(m.e), "?a", "?v"]],
        ["?a"],
        undefined,
        tenant?.tenantId,
      );
      for (const r of rows) attrs.add(String(r.a));
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
    tenantSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const tenant = await readTenantOrLegacy(ctx, args.tenantSlug);
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
    const bindings = await runWhere(ctx, where, coord, {}, {
      enforceReadAuth: true,
      source:
        tenant?.tenantId === undefined
          ? eventLogBaseWithDerivedTripleSource
          : eventLogBaseWithDerivedTripleSourceForTenant(tenant.tenantId),
    });
    let ids = [...new Set(project(bindings, ["?e"]).map((r) => String(r.e)))];

    // Sort by an attribute via the event-log base source (id -> first visible
    // value map), or by id for a stable default.
    if (args.sort) {
      const idSet = new Set(ids);
      const sortRows = project(
        await runWhere(ctx, [["?e", args.sort.attribute, "?v"]], coord, {}, {
          enforceReadAuth: true,
          source:
            tenant?.tenantId === undefined
              ? eventLogTripleSource
              : eventLogTripleSourceForTenant(tenant.tenantId),
        }),
        ["?e", "?v"],
      );
      const valuesById = new Map<string, unknown[]>();
      for (const row of sortRows) {
        const id = String(row.e);
        if (!idSet.has(id)) continue;
        const values = valuesById.get(id) ?? [];
        values.push(row.v);
        valuesById.set(id, values);
      }
      const valueOf = new Map<string, unknown>();
      for (const [id, values] of valuesById) {
        valueOf.set(id, [...values].sort(compareForSort)[0]);
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
        ...(await loadAttributes(ctx, id, coord, tenant?.tenantId)),
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
