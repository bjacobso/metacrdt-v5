import { query } from "./_generated/server";
import { v } from "convex/values";
import { typeOrigin } from "./lib/origin";
import { typeNameOf } from "./lib/meta";
import { project, runWhere } from "./lib/engine";
import {
  eventLogTripleSource,
  eventLogTripleSourceForTenant,
} from "./lib/eventLogTripleSource";
import { obligationsFromEventLog } from "./lib/obligations";
import { tenantOrLegacyRead } from "./lib/tenantAuth";
import type { Id } from "./_generated/dataModel";

const TYPE_ATTR = "type";
const SAMPLE = 1000;

type Row = Record<string, unknown>;

async function currentRows(
  ctx: Parameters<typeof runWhere>[0],
  where: unknown[],
  select: string[],
  tenantId?: Id<"tenants">,
): Promise<Row[]> {
  const now = Date.now();
  return project(
    await runWhere(
      ctx,
      where,
      { txTime: now, validTime: now },
      {},
      {
        source:
          tenantId === undefined
            ? eventLogTripleSource
            : eventLogTripleSourceForTenant(tenantId),
      },
    ),
    select,
  );
}

/** Headline counts for the Overview dashboard. */
export const summary = query({
  args: { tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await tenantOrLegacyRead(ctx, args.tenantSlug);
    const typeRows = await currentRows(
      ctx,
      [["?e", TYPE_ATTR, "?type"]],
      ["?e", "?type"],
      tenant?.tenantId,
    );

    // Configured types: declared type:<Name> registry entries.
    const configured = new Set(
      typeRows
        .filter((r) => r.type === "EntityType" && typeof r.e === "string")
        .map((r) => typeNameOf(r.e as string)),
    );
    const configuredTypes = [...configured].filter(
      (t) => typeOrigin(t, true) === "configured",
    ).length;

    // Active placements.
    const placementEntities = new Set(
      typeRows
        .filter((r) => r.type === "Placement" && typeof r.e === "string")
        .map((r) => r.e as string),
    );
    const placements = placementEntities.size;

    // Evidence (submissions) currently on record — these are what reuse keys off.
    const submitted = await currentRows(
      ctx,
      [["?e", "submitted.i9", "?v"]],
      ["?e", "?v"],
      tenant?.tenantId,
    );
    const allSubmitted = typeRows.length; // placeholder; refined below

    // Reuse: a submission scope shared by more than one placement means the
    // evidence was reused rather than re-collected. Count distinct reused scopes.
    const scopeUse = new Map<string, number>();
    for (const attr of ["employer", "client", "job", "venue"]) {
      const rows = await currentRows(
        ctx,
        [["?e", attr, "?scope"]],
        ["?e", "?scope"],
        tenant?.tenantId,
      );
      for (const row of rows.slice(0, SAMPLE)) {
        if (typeof row.e === "string" && placementEntities.has(row.e)) {
          const key = `${attr}:${String(row.scope)}`;
          scopeUse.set(key, (scopeUse.get(key) ?? 0) + 1);
        }
      }
    }
    const reusedScopes = [...scopeUse.values()].filter((n) => n > 1).length;

    // Obligation satisfaction for the demo subject, derived directly from rules
    // over protocol-shaped factEvents.
    const obligations = await obligationsFromEventLog(ctx, {
      worker: "worker:maria",
      tenantId: tenant?.tenantId,
      limit: SAMPLE,
    });
    const required = obligations.filter((o) => !o.open).length;
    const open = obligations.filter((o) => o.open).length;

    return {
      configuredTypes,
      placements,
      reusedScopes,
      evidence: submitted.length || allSubmitted,
      required,
      open,
      satisfiedPct: required === 0 ? 100 : Math.round(((required - open) / required) * 100),
    };
  },
});

/** Recent transactions, each described by a representative fact event. */
export const recentActivity = query({
  args: { limit: v.optional(v.number()), tenantSlug: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const tenant = await tenantOrLegacyRead(ctx, args.tenantSlug);
    const txns =
      tenant === null
        ? await ctx.db
            .query("transactions")
            .withIndex("by_txTime")
            .order("desc")
            .take(Math.min(args.limit ?? 12, 50))
        : await ctx.db
            .query("transactions")
            .withIndex("by_tenant_and_txTime", (q) =>
              q.eq("tenantId", tenant.tenantId),
            )
            .order("desc")
            .take(Math.min(args.limit ?? 12, 50));

    const out = [];
    for (const tx of txns) {
      const ev =
        tenant === null
          ? await ctx.db
              .query("factEvents")
              .withIndex("by_tx", (q) => q.eq("txId", tx._id))
              .first()
          : await ctx.db
              .query("factEvents")
              .withIndex("by_tenant_and_tx", (q) =>
                q.eq("tenantId", tenant.tenantId).eq("txId", tx._id),
              )
              .first();
      if (!ev) continue;
      out.push({
        txId: tx._id,
        actorId: tx.actorId,
        actorType: tx.actorType,
        reason: tx.reason,
        txTime: tx.txTime,
        kind: ev.kind,
        e: ev.e,
        a: ev.a,
        v: ev.v,
      });
    }
    return out;
  },
});
