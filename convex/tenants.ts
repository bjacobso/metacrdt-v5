import { mutation, query, type MutationCtx } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  authPrincipal,
  requireTenant,
  type TenantRole,
} from "./lib/tenantAuth";

const tenantKindValidator = v.optional(
  v.union(v.literal("staffing"), v.literal("legal"), v.literal("custom")),
);

const roleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("editor"),
  v.literal("viewer"),
);

const demoTenantKindValidator = v.union(
  v.literal("staffing"),
  v.literal("legal"),
);

type DemoTenantKind = "staffing" | "legal";

const DEMO_TENANTS: Record<
  DemoTenantKind,
  { slug: string; name: string; kind: "staffing" | "legal" }
> = {
  staffing: {
    slug: "acme-staffing",
    name: "Acme Staffing",
    kind: "staffing",
  },
  legal: {
    slug: "legal-workflows",
    name: "Legal Workflows",
    kind: "legal",
  },
};

function normalizeSlug(slug: string): string {
  return slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function tenantBySlug(ctx: MutationCtx, slug: string) {
  return await ctx.db
    .query("tenants")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

async function ensureTenant(
  ctx: MutationCtx,
  args: {
    slug: string;
    name: string;
    kind?: "staffing" | "legal" | "custom";
  },
): Promise<Id<"tenants">> {
  const slug = normalizeSlug(args.slug);
  if (slug.length === 0) throw new Error("tenant slug is required");
  const now = Date.now();
  const existing = await tenantBySlug(ctx, slug);
  if (existing !== null) {
    await ctx.db.patch("tenants", existing._id, {
      name: args.name,
      kind: args.kind,
      updatedAt: now,
    });
    return existing._id;
  }
  return await ctx.db.insert("tenants", {
    slug,
    name: args.name,
    kind: args.kind,
    createdAt: now,
    updatedAt: now,
  });
}

async function ensureMembership(
  ctx: MutationCtx,
  args: {
    tenantId: Id<"tenants">;
    principal: string;
    role: TenantRole;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("tenantMemberships")
    .withIndex("by_tenant_and_principal", (q) =>
      q.eq("tenantId", args.tenantId).eq("principal", args.principal),
    )
    .unique();
  if (existing !== null) {
    await ctx.db.patch("tenantMemberships", existing._id, { role: args.role });
    return;
  }
  await ctx.db.insert("tenantMemberships", {
    tenantId: args.tenantId,
    principal: args.principal,
    role: args.role,
    createdAt: Date.now(),
  });
}

export const listMyTenants = query({
  args: {},
  handler: async (ctx) => {
    const principal = await authPrincipal(ctx);
    if (principal === null) return [];
    const memberships = await ctx.db
      .query("tenantMemberships")
      .withIndex("by_principal", (q) => q.eq("principal", principal))
      .take(100);

    const out = [];
    for (const membership of memberships) {
      const tenant = await ctx.db.get(membership.tenantId);
      if (tenant === null) continue;
      out.push({
        _id: tenant._id,
        slug: tenant.slug,
        name: tenant.name,
        kind: tenant.kind,
        role: membership.role,
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getTenantBySlug = query({
  args: { tenantSlug: v.string() },
  handler: async (ctx, args) => {
    const tenant = await requireTenant(ctx, normalizeSlug(args.tenantSlug));
    return tenant;
  },
});

export const createTenant = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    kind: tenantKindValidator,
  },
  handler: async (ctx, args) => {
    const principal = await authPrincipal(ctx);
    if (principal === null) throw new Error("Not authenticated");
    const tenantId = await ensureTenant(ctx, args);
    await ensureMembership(ctx, { tenantId, principal, role: "owner" });
    return { tenantId, slug: normalizeSlug(args.slug) };
  },
});

export const upsertMembershipForCurrentUser = mutation({
  args: {
    tenantSlug: v.string(),
    role: roleValidator,
  },
  handler: async (ctx, args) => {
    const principal = await authPrincipal(ctx);
    if (principal === null) throw new Error("Not authenticated");
    const tenant = await ctx.db
      .query("tenants")
      .withIndex("by_slug", (q) => q.eq("slug", normalizeSlug(args.tenantSlug)))
      .unique();
    if (tenant === null) throw new Error("Tenant not found");
    await ensureMembership(ctx, {
      tenantId: tenant._id,
      principal,
      role: args.role,
    });
    return { tenantId: tenant._id, role: args.role };
  },
});

export const ensureDemoTenant = mutation({
  args: { kind: demoTenantKindValidator },
  handler: async (
    ctx,
    args,
  ): Promise<{ tenantId: Id<"tenants">; slug: string }> => {
    const principal = await authPrincipal(ctx);
    if (principal === null) throw new Error("Not authenticated");
    const demo = DEMO_TENANTS[args.kind];
    const tenantId = await ensureTenant(ctx, demo);
    await ensureMembership(ctx, { tenantId, principal, role: "owner" });
    if (args.kind === "staffing") {
      await ctx.runMutation(api.appconfig.setupStaffing, {
        tenantSlug: demo.slug,
      });
    } else {
      await ctx.runMutation(api.appconfig.setupLegal, {
        tenantSlug: demo.slug,
      });
    }
    return { tenantId, slug: demo.slug };
  },
});

export const ensureDemoTenants = mutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<{
    staffing: Id<"tenants">;
    legal: Id<"tenants">;
    slugs: { staffing: string; legal: string };
  }> => {
    const principal = await authPrincipal(ctx);
    if (principal === null) throw new Error("Not authenticated");

    const staffing = await ensureTenant(ctx, DEMO_TENANTS.staffing);
    const legal = await ensureTenant(ctx, DEMO_TENANTS.legal);
    await ensureMembership(ctx, { tenantId: staffing, principal, role: "owner" });
    await ensureMembership(ctx, { tenantId: legal, principal, role: "owner" });
    await ctx.runMutation(api.appconfig.setupStaffing, {
      tenantSlug: DEMO_TENANTS.staffing.slug,
    });
    await ctx.runMutation(api.appconfig.setupLegal, {
      tenantSlug: DEMO_TENANTS.legal.slug,
    });
    return {
      staffing,
      legal,
      slugs: {
        staffing: DEMO_TENANTS.staffing.slug,
        legal: DEMO_TENANTS.legal.slug,
      },
    };
  },
});
