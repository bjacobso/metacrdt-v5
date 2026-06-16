import { describe, expect, it } from "vitest";
import { tenantDemoProfile } from "./tenantDemoProfile";

describe("tenantDemoProfile", () => {
  it("defaults custom or unknown tenants to the staffing demo profile", () => {
    expect(tenantDemoProfile(undefined)).toMatchObject({
      kind: "staffing",
      entityType: "Worker",
      subject: "worker:maria",
      setupAction: "setupStaffing",
      flowStartContext: { employer: "employer:acme" },
    });
    expect(tenantDemoProfile("custom")).toMatchObject({
      kind: "staffing",
      setupLabel: "staffing demo",
      installLabel: "Install staffing blueprint",
    });
  });

  it("uses matter workflow defaults for legal tenants", () => {
    expect(tenantDemoProfile("legal")).toEqual({
      kind: "legal",
      entityType: "Matter",
      subject: "matter:globex-onboarding",
      setupLabel: "legal workflows",
      installLabel: "Install legal workflows",
      setupAction: "setupLegal",
      flowStartContext: { client: "client:globex" },
    });
  });
});
