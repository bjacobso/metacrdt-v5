import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMutation, useQuery } from "convex/react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../convex/_generated/api";
import { splitTenantPath, tenantPath } from "./navigationModel";

type Tenant = {
  _id: string;
  slug: string;
  name: string;
  kind?: "staffing" | "legal" | "custom";
  role: "owner" | "admin" | "editor" | "viewer";
};

type TenantContextValue = {
  tenants: Tenant[] | undefined;
  selectedTenant: Tenant | null;
  selectedTenantSlug: string | null;
  setSelectedTenantSlug: (slug: string) => void;
  ensureDemoTenant: (kind: "staffing" | "legal") => Promise<void>;
  ensureDemoTenants: () => Promise<void>;
};

const TenantContext = createContext<TenantContextValue | null>(null);

const STORAGE_KEY = "metacrdt.selectedTenant";

function readStoredTenantSlug(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeTenantSlug(slug: string | null) {
  try {
    if (slug === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, slug);
  } catch {
    // Ignore private-mode/localStorage failures; URL-scoped tenant selection still works.
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const { tenantSlug: routeTenantSlug } = useParams<{ tenantSlug?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const tenants = useQuery(api.tenants.listMyTenants, {}) as Tenant[] | undefined;
  const ensureDemoTenantMutation = useMutation(api.tenants.ensureDemoTenant);
  const ensureDemoTenantsMutation = useMutation(api.tenants.ensureDemoTenants);
  const [storedTenantSlug, setStoredTenantSlug] = useState<string | null>(
    readStoredTenantSlug,
  );

  const routeTenant = useMemo(() => {
    if (routeTenantSlug === undefined) return undefined;
    if (tenants === undefined) return undefined;
    return tenants.find((tenant) => tenant.slug === routeTenantSlug) ?? null;
  }, [routeTenantSlug, tenants]);

  const selectedTenantSlug =
    routeTenantSlug === undefined
      ? storedTenantSlug
      : routeTenant === undefined
        ? null
        : routeTenant?.slug ?? null;

  useEffect(() => {
    if (tenants === undefined) return;
    if (routeTenantSlug !== undefined) {
      if (routeTenant !== null && routeTenant !== undefined) {
        setStoredTenantSlug(routeTenant.slug);
        storeTenantSlug(routeTenant.slug);
      }
      return;
    }
    if (tenants.length === 0) {
      setStoredTenantSlug(null);
      storeTenantSlug(null);
      return;
    }
    if (
      selectedTenantSlug === null ||
      !tenants.some((tenant) => tenant.slug === selectedTenantSlug)
    ) {
      setStoredTenantSlug(tenants[0].slug);
      storeTenantSlug(tenants[0].slug);
    }
  }, [routeTenant, routeTenantSlug, selectedTenantSlug, tenants]);

  const selectedTenant = useMemo(() => {
    return tenants?.find((tenant) => tenant.slug === selectedTenantSlug) ?? null;
  }, [selectedTenantSlug, tenants]);

  function navigateToTenant(slug: string) {
    const { route } = splitTenantPath(location.pathname);
    navigate(tenantPath(slug, route));
  }

  const value: TenantContextValue = {
    tenants,
    selectedTenant,
    selectedTenantSlug,
    setSelectedTenantSlug: (slug) => {
      setStoredTenantSlug(slug);
      storeTenantSlug(slug);
      navigateToTenant(slug);
    },
    ensureDemoTenant: async (kind) => {
      const result = await ensureDemoTenantMutation({ kind });
      setStoredTenantSlug(result.slug);
      storeTenantSlug(result.slug);
      navigateToTenant(result.slug);
    },
    ensureDemoTenants: async () => {
      const result = await ensureDemoTenantsMutation({});
      const slug = selectedTenantSlug ?? result.slugs.staffing;
      setStoredTenantSlug(slug);
      storeTenantSlug(slug);
      navigateToTenant(slug);
    },
  };

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

export function useTenant() {
  const value = useContext(TenantContext);
  if (value === null) throw new Error("useTenant must be used within TenantProvider");
  return value;
}
