import { describe, expect, it } from "vitest";
import { formatViewSpecIssues, validateViewSpecStructure, type ViewSpec } from "../src/index.js";

const lit = (value: unknown) => ({ kind: "literal" as const, value });

describe("ViewSpec structural validation", () => {
  it("accepts a structurally valid normalized spec", () => {
    const result = validateViewSpecStructure(
      {
        $viewSpec: { version: "2" },
        queries: {
          employees: { query: { find: ["?e"], where: [["?e", ":employee/name", "?name"]] } },
          filteredEmployees: {
            query: { find: ["?e"], where: [["?e", ":employee/status", "active"]] },
            dependsOn: ["employees"],
          },
        },
        defs: {
          statusBadge: { type: "badge", content: lit("Active") },
        },
        onMount: { action: "runQuery", query: "employees" },
        root: {
          type: "tabs",
          children: [
            {
              type: "tab-panel",
              label: lit("Employees"),
              children: [
                {
                  type: "use",
                  name: "statusBadge",
                },
              ],
            },
          ],
        },
      },
      { customComponents: [] },
    );

    expect(result.valid).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it("reports invalid children, missing refs, unsupported events, and query issues", () => {
    const spec = {
      $viewSpec: { version: "2" },
      queries: {
        a: { query: {}, dependsOn: ["b"] },
        b: { query: {}, dependsOn: ["a"] },
        c: { query: {}, dependsOn: ["missingDep"] },
      },
      root: {
        type: "rows",
        children: [
          {
            type: "tab-panel",
            children: [],
          },
          {
            type: "tabs",
            children: [{ type: "text", content: lit("wrong child") }],
          },
          {
            type: "use",
            name: "missingDef",
          },
          {
            type: "custom",
            componentName: "missing/component",
          },
          {
            type: "item",
            events: {
              onSubmit: { action: "runQuery", query: "missingQuery" },
            },
          },
        ],
      },
      onMount: { action: "runQueries", queries: ["a", "missingMountQuery"] },
    } as unknown as ViewSpec;

    const result = validateViewSpecStructure(spec, { customComponents: [] });

    expect(result.valid).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "invalid_parent",
        "invalid_child",
        "missing_def",
        "unknown_custom_component",
        "unsupported_event",
        "missing_query",
        "missing_query_dependency",
        "query_dependency_cycle",
      ]),
    );
    expect(formatViewSpecIssues(result.issues)).toContain("ERROR invalid_child");
  });
});
