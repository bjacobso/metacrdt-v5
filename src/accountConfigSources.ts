import staffingFormaSource from "../configs/accounts/staffing.forma?raw";
import legalFormaSource from "../configs/accounts/legal-workflows.forma?raw";
import type { AccountConfigSourceFormat } from "./configSource";

export type CheckedInAccountSource = {
  path: string;
  tenantSlug: string;
  label: string;
  format: AccountConfigSourceFormat;
  source: string;
};

export const CHECKED_IN_ACCOUNT_SOURCES: CheckedInAccountSource[] = [
  {
    path: "configs/accounts/staffing.forma",
    tenantSlug: "acme-staffing",
    label: "Staffing Forma",
    format: "forma",
    source: staffingFormaSource,
  },
  {
    path: "configs/accounts/legal-workflows.forma",
    tenantSlug: "legal-workflows",
    label: "Legal Forma",
    format: "forma",
    source: legalFormaSource,
  },
];

export function checkedInSourcesForTenant(
  tenantSlug: string | null | undefined,
  sources: readonly CheckedInAccountSource[] = CHECKED_IN_ACCOUNT_SOURCES,
): CheckedInAccountSource[] {
  if (tenantSlug == null) return [];
  return sources.filter((entry) => entry.tenantSlug === tenantSlug);
}

export function selectCheckedInAccountSource(
  sourcesForTenant: readonly CheckedInAccountSource[],
  selectedPath: string,
): CheckedInAccountSource | undefined {
  return sourcesForTenant.find((entry) => entry.path === selectedPath) ??
    sourcesForTenant[0];
}
