import { describe, expect, it } from "vitest";
import {
  CONFIGURE_NAV,
  PAGE_TITLES,
  ROUTES,
  splitTenantPath,
  tenantPath,
  TOUR_STEPS,
} from "./navigationModel";

describe("navigation model", () => {
  it("keeps account configuration separate from engine tools", () => {
    expect(CONFIGURE_NAV.map((item) => item.to)).toEqual([
      ROUTES.accountConfig,
      ROUTES.systemConsole,
      ROUTES.transactions,
    ]);
    expect(PAGE_TITLES[ROUTES.accountConfig]).toBe("Account Config");
    expect(PAGE_TITLES[ROUTES.systemConsole]).toBe("System Console");
  });

  it("does not advertise the legacy data model route", () => {
    const configureRoutes: readonly string[] = CONFIGURE_NAV.map((item) => item.to);
    const tourRoutes: readonly string[] = TOUR_STEPS.map((step) => step.route);

    expect(configureRoutes).not.toContain(ROUTES.legacyDataModel);
    expect(tourRoutes).not.toContain(ROUTES.legacyDataModel);
  });

  it("builds and parses tenant-scoped routes", () => {
    expect(tenantPath("legal-workflows", ROUTES.overview)).toBe(
      "/t/legal-workflows",
    );
    expect(tenantPath("legal-workflows", ROUTES.accountConfig)).toBe(
      "/t/legal-workflows/config",
    );
    expect(splitTenantPath("/t/legal-workflows/config")).toEqual({
      tenantSlug: "legal-workflows",
      route: ROUTES.accountConfig,
    });
    expect(splitTenantPath("/config")).toEqual({
      tenantSlug: null,
      route: ROUTES.accountConfig,
    });
  });
});
