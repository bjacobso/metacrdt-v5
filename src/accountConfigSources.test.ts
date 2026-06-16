import { describe, expect, it } from "vitest";
import accountConfigSchema from "../configs/accounts/schema.json";
import {
  CHECKED_IN_ACCOUNT_SOURCES,
  checkedInSourcesForTenant,
  selectCheckedInAccountSource,
} from "./accountConfigSources";

describe("checked-in account config sources", () => {
  it("filters checked-in sources to the active tenant", () => {
    expect(
      checkedInSourcesForTenant("acme-staffing").map((entry) => entry.path),
    ).toEqual(["configs/accounts/staffing.forma"]);
    expect(
      checkedInSourcesForTenant("legal-workflows").map((entry) => entry.path),
    ).toEqual(["configs/accounts/legal-workflows.forma"]);
    expect(checkedInSourcesForTenant(null)).toEqual([]);
  });

  it("ignores a stale selected path from another tenant", () => {
    const legalSources = checkedInSourcesForTenant("legal-workflows");

    expect(
      selectCheckedInAccountSource(
        legalSources,
        "configs/accounts/staffing.forma",
      ),
    ).toMatchObject({
      tenantSlug: "legal-workflows",
      path: "configs/accounts/legal-workflows.forma",
    });
  });

  it("preserves an explicitly selected source when it belongs to the tenant", () => {
    const staffingSources = checkedInSourcesForTenant("acme-staffing");

    expect(
      selectCheckedInAccountSource(
        staffingSources,
        "configs/accounts/staffing.forma",
      ),
    ).toBe(CHECKED_IN_ACCOUNT_SOURCES[0]);
  });

  it("documents attribute-compatible field type rules in the account schema", () => {
    const definitions = accountConfigSchema.$defs;
    const formDefaultRules = definitions.formFieldDefaultValueByType.allOf;
    const actionDefaultRules = definitions.actionFieldDefaultValueByType.allOf;

    expect(definitions.field.description).toContain(
      "If name matches a declared account attribute",
    );
    expect(definitions.field.description).toContain(
      "string attributes may use string or select",
    );
    expect(definitions.field.description).toContain(
      "defaultValue is validated against the field type",
    );
    expect(definitions.field.properties).toMatchObject({
      defaultValue: { $ref: "#/$defs/jsonValue" },
    });
    expect(definitions.field.allOf).toContainEqual({
      $ref: "#/$defs/formFieldDefaultValueByType",
    });
    expect(definitions.field.additionalProperties).toBe(false);
    expect(definitions.actionField.description).toContain(
      "entityRef/date inputs are string-shaped",
    );
    expect(definitions.actionField.description).toContain(
      "Action-only inputs that do not match account attributes",
    );
    expect(definitions.actionField.description).toContain(
      "defaultValue is validated against the field type",
    );
    expect(definitions.actionField.properties).toMatchObject({
      defaultValue: { $ref: "#/$defs/jsonValue" },
    });
    expect(definitions.actionField.allOf).toContainEqual({
      $ref: "#/$defs/actionFieldDefaultValueByType",
    });
    expect(definitions.actionField.additionalProperties).toBe(false);

    expect(formDefaultRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          if: { properties: { type: { const: "select" } } },
          then: { properties: { defaultValue: { type: "string" } } },
        }),
        expect.objectContaining({
          if: { properties: { type: { const: "date" } } },
          then: { properties: { defaultValue: { type: "string" } } },
        }),
        expect.objectContaining({
          if: { properties: { type: { const: "number" } } },
          then: { properties: { defaultValue: { type: "number" } } },
        }),
        expect.objectContaining({
          if: { properties: { type: { const: "boolean" } } },
          then: { properties: { defaultValue: { type: "boolean" } } },
        }),
      ]),
    );
    expect(actionDefaultRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          if: { properties: { type: { const: "select" } } },
          then: { properties: { defaultValue: { type: "string" } } },
        }),
        expect.objectContaining({
          if: { properties: { type: { const: "number" } } },
          then: { properties: { defaultValue: { type: "number" } } },
        }),
        expect.objectContaining({
          if: { properties: { type: { const: "boolean" } } },
          then: { properties: { defaultValue: { type: "boolean" } } },
        }),
      ]),
    );
  });
});
