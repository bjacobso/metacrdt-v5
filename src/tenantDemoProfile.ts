export type TenantKind = "staffing" | "legal" | "custom";

export type TenantDemoProfile = {
  kind: "staffing" | "legal";
  entityType: "Worker" | "Matter";
  subject: string;
  setupLabel: string;
  installLabel: string;
  setupAction: "setupStaffing" | "setupLegal";
  flowStartContext: Record<string, string>;
};

export function tenantDemoProfile(kind: TenantKind | undefined): TenantDemoProfile {
  if (kind === "legal") {
    return {
      kind: "legal",
      entityType: "Matter",
      subject: "matter:globex-onboarding",
      setupLabel: "legal workflows",
      installLabel: "Install legal workflows",
      setupAction: "setupLegal",
      flowStartContext: { client: "client:globex" },
    };
  }
  return {
    kind: "staffing",
    entityType: "Worker",
    subject: "worker:maria",
    setupLabel: "staffing demo",
    installLabel: "Install staffing blueprint",
    setupAction: "setupStaffing",
    flowStartContext: { employer: "employer:acme" },
  };
}
