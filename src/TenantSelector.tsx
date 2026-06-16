export type TenantOption = {
  slug: string;
  name: string;
};

export function TenantSelector({
  tenants,
  selectedTenantSlug,
  isAuthenticated,
  onSelect,
  onCreateDemoTenant,
  onCreateDemoTenants,
}: {
  tenants: TenantOption[] | undefined;
  selectedTenantSlug: string | null;
  isAuthenticated: boolean;
  onSelect: (slug: string) => void;
  onCreateDemoTenant: (kind: "staffing" | "legal") => void;
  onCreateDemoTenants: () => void;
}) {
  return (
    <div className="border-y border-white/10 px-3 py-3">
      <label className="px-2 text-[10px] font-semibold uppercase tracking-wider text-brand-muted">
        Tenant
      </label>
      {tenants === undefined ? (
        <div className="mt-1.5 rounded-md bg-white/5 px-2 py-1.5 text-[12px] text-white/60">
          Loading...
        </div>
      ) : tenants.length > 0 ? (
        <select
          value={selectedTenantSlug ?? ""}
          onChange={(event) => onSelect(event.currentTarget.value)}
          className="mt-1.5 w-full rounded-md border border-white/10 bg-brand-soft px-2 py-1.5 text-[12px] text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
        >
          {tenants.map((tenant) => (
            <option key={tenant.slug} value={tenant.slug}>
              {tenant.name}
            </option>
          ))}
        </select>
      ) : (
        <div className="mt-1.5 grid gap-1.5">
          <button
            type="button"
            disabled={!isAuthenticated}
            onClick={() => onCreateDemoTenant("staffing")}
            className="w-full rounded-md bg-white/10 px-2 py-1.5 text-left text-[12px] text-white/80 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create staffing tenant
          </button>
          <button
            type="button"
            disabled={!isAuthenticated}
            onClick={() => onCreateDemoTenant("legal")}
            className="w-full rounded-md bg-white/10 px-2 py-1.5 text-left text-[12px] text-white/80 transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create legal tenant
          </button>
          <button
            type="button"
            disabled={!isAuthenticated}
            onClick={onCreateDemoTenants}
            className="w-full rounded-md bg-white/5 px-2 py-1.5 text-left text-[12px] text-white/70 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create both demo tenants
          </button>
        </div>
      )}
    </div>
  );
}
