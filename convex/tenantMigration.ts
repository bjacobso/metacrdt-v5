// This branch is greenfield-only: tenant-owned runtime rows require tenantId at
// creation time. Do not reintroduce public default-tenant or backfill functions
// here; create fresh tenants through convex/tenants.ts instead.
export const GREENFIELD_TENANT_RUNTIME_ONLY = true;
