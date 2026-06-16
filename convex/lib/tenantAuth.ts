import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const TENANT_NOT_AUTHENTICATED = "Not authenticated";
export const TENANT_NOT_FOUND = "Tenant not found";
export const TENANT_ACCESS_DENIED = "Tenant access denied";
export const TENANT_CONTEXT_REQUIRED = "Tenant context required";

export type TenantRole = "owner" | "admin" | "editor" | "viewer";

export type TenantContext = {
  tenantId: Id<"tenants">;
  tenantSlug: string;
  principal: string;
  role: TenantRole;
};

type Ctx = QueryCtx | MutationCtx;

const ROLE_RANK: Record<TenantRole, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export function roleAtLeast(role: TenantRole, required: TenantRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export async function authPrincipal(ctx: Ctx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.tokenIdentifier ?? null;
}

export async function requireTenant(
  ctx: Ctx,
  tenantSlug: string,
  requiredRole: TenantRole = "viewer",
): Promise<TenantContext> {
  const principal = await authPrincipal(ctx);
  if (principal === null) throw new Error(TENANT_NOT_AUTHENTICATED);

  const tenant = await ctx.db
    .query("tenants")
    .withIndex("by_slug", (q) => q.eq("slug", tenantSlug))
    .unique();
  if (tenant === null) throw new Error(TENANT_NOT_FOUND);

  const membership = await ctx.db
    .query("tenantMemberships")
    .withIndex("by_tenant_and_principal", (q) =>
      q.eq("tenantId", tenant._id).eq("principal", principal),
    )
    .unique();
  if (membership === null || !roleAtLeast(membership.role, requiredRole)) {
    throw new Error(TENANT_ACCESS_DENIED);
  }

  return {
    tenantId: tenant._id,
    tenantSlug: tenant.slug,
    principal,
    role: membership.role,
  };
}

export async function requireTenantById(
  ctx: Ctx,
  tenantId: Id<"tenants">,
  requiredRole: TenantRole = "viewer",
): Promise<TenantContext> {
  const principal = await authPrincipal(ctx);
  if (principal === null) throw new Error(TENANT_NOT_AUTHENTICATED);

  const tenant = await ctx.db.get(tenantId);
  if (tenant === null) throw new Error(TENANT_NOT_FOUND);

  const membership = await ctx.db
    .query("tenantMemberships")
    .withIndex("by_tenant_and_principal", (q) =>
      q.eq("tenantId", tenant._id).eq("principal", principal),
    )
    .unique();
  if (membership === null || !roleAtLeast(membership.role, requiredRole)) {
    throw new Error(TENANT_ACCESS_DENIED);
  }

  return {
    tenantId: tenant._id,
    tenantSlug: tenant.slug,
    principal,
    role: membership.role,
  };
}

export async function requireLegacyGlobalWrite(ctx: MutationCtx): Promise<string> {
  const principal = await authPrincipal(ctx);
  if (principal === null) throw new Error(TENANT_NOT_AUTHENTICATED);

  const existingTenant = await ctx.db.query("tenants").take(1);
  if (existingTenant.length > 0) throw new Error(TENANT_CONTEXT_REQUIRED);

  return principal;
}

export async function requireLegacyGlobalRead(ctx: Ctx): Promise<void> {
  const existingTenant = await ctx.db.query("tenants").take(1);
  if (existingTenant.length > 0) throw new Error(TENANT_CONTEXT_REQUIRED);
}

export async function tenantOrLegacyRead(
  ctx: Ctx,
  tenantSlug?: string,
): Promise<TenantContext | null> {
  if (tenantSlug === undefined) {
    await requireLegacyGlobalRead(ctx);
    return null;
  }
  return await requireTenant(ctx, tenantSlug);
}
