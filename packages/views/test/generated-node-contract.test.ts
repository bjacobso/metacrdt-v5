import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
  normalizeViewSpec,
  ViewNode as RootViewNode,
  ViewSpec,
  VIEW_COMPONENT_TYPES,
  VIEW_SPEC_COMPONENT_CATALOG,
  type ViewNode,
  type ViewSpec as ViewSpecType,
} from "../src/index.js";
import {
  ViewNode as GeneratedViewNode,
  VIEW_COMPONENT_TYPES as GENERATED_VIEW_COMPONENT_TYPES,
} from "../src/generated/view-node.generated.js";

const decodeSpec = (input: unknown): ViewSpecType => {
  return Schema.decodeUnknownSync(ViewSpec)(normalizeViewSpec(input));
};

const lit = (value: unknown) => ({ kind: "literal" as const, value });

const findChild = <T extends ViewNode["type"]>(
  children: readonly ViewNode[],
  type: T,
): Extract<ViewNode, { type: T }> => {
  const child = children.find((entry): entry is Extract<ViewNode, { type: T }> => {
    return entry.type === type;
  });
  if (child === undefined) {
    throw new Error(`Expected child node of type ${type}`);
  }
  return child;
};

describe("generated ViewSpec node contract", () => {
  it("is the public root node contract", () => {
    expect(RootViewNode).toBe(GeneratedViewNode);
    expect(VIEW_COMPONENT_TYPES).toEqual(GENERATED_VIEW_COMPONENT_TYPES);
  });

  it("exports a descriptor-derived component catalog", () => {
    expect(Object.keys(VIEW_SPEC_COMPONENT_CATALOG)).toEqual([...VIEW_COMPONENT_TYPES]);
    expect(VIEW_SPEC_COMPONENT_CATALOG.tabs.children).toEqual({
      kind: "only",
      required: true,
      types: ["tab-panel"],
    });
    expect(VIEW_SPEC_COMPONENT_CATALOG["tab-panel"].parents).toEqual(["tabs"]);
    expect(
      VIEW_SPEC_COMPONENT_CATALOG.card.slots.find((slot) => slot.field === "action"),
    ).toMatchObject({
      name: "action",
      kind: "node-list",
      many: true,
    });
    expect(VIEW_SPEC_COMPONENT_CATALOG.input.events).toEqual(["onChange"]);
    expect(
      VIEW_SPEC_COMPONENT_CATALOG.input.slots.find((slot) => slot.field === "defaultValue"),
    ).toMatchObject({
      name: "default-value",
      kind: "expr",
    });
  });

  it("decodes normalized specs that exercise generated descriptor refinements", () => {
    const spec = decodeSpec({
      root: {
        type: "rows",
        children: [
          {
            type: "card",
            title: lit("Quarterly health"),
            action: [
              {
                type: "action-button",
                label: lit("Approve"),
                actionRef: "approve-report",
                parameters: { reportId: "report-1", notify: true },
                events: {
                  onSuccess: {
                    action: "showToast",
                    message: lit("Approved"),
                  },
                },
              },
            ],
            footer: { type: "text", content: lit("Updated just now") },
            children: [
              {
                type: "tabs",
                children: [
                  {
                    type: "tab-panel",
                    title: lit("Overview"),
                    children: [
                      {
                        type: "for-each",
                        children: [
                          {
                            type: "text",
                            content: {
                              kind: "var",
                              source: "item",
                              path: ["name"],
                            },
                          },
                        ],
                      },
                    ],
                  },
                  { type: "text", content: "filtered out of tabs" },
                ],
              },
              {
                type: "condition",
                children: [
                  {
                    type: "case",
                    when: { kind: "var", source: "state", path: ["visible"] },
                    children: [{ type: "alert", message: lit("Visible") }],
                  },
                  {
                    type: "else",
                    children: [{ type: "empty-state", title: lit("Nothing here") }],
                  },
                  { type: "text", content: "filtered out of condition" },
                ],
              },
            ],
          },
          {
            type: "table",
            props: {
              columns: ["name", { key: "score", label: "Score" }],
              filters: [
                "status",
                { key: "region", label: "Region", placeholder: "Filter region..." },
              ],
              pageSize: 25,
              defaultSort: { key: "score", direction: "desc" },
            },
            events: {
              onRowClick: {
                action: "setState",
                key: "selectedRow",
                value: { kind: "var", source: "row", path: ["id"] },
              },
            },
          },
          {
            type: "chart",
            props: {
              chartType: "bar",
              categoryKey: "month",
              series: ["revenue", { dataKey: "cost", label: "Cost", color: "#d43f3a" }],
            },
          },
          {
            type: "select",
            name: "status",
            defaultValue: { kind: "var", source: "query", path: ["filters", "0", "status"] },
            options: ["open", { value: "closed", label: "Closed" }],
            children: [
              { type: "select-option", value: "pending", label: lit("Pending") },
              { type: "text", content: "filtered out of select children" },
            ],
          },
          {
            type: "radio-group",
            name: "priority",
            options: [{ value: "high", label: "High" }],
            children: [{ type: "radio-option", value: "low", label: lit("Low") }],
          },
          {
            type: "toggle-group",
            name: "tags",
            mode: "multiple",
            variant: "outline",
            options: [{ value: "urgent", label: "Urgent" }],
          },
          {
            type: "button-group",
            orientation: "horizontal",
            children: [
              { type: "action-button", label: lit("Approve") },
              { type: "create-entity-button", entityType: "Employee", label: lit("New") },
            ],
          },
          {
            type: "tooltip",
            content: lit("Open command menu"),
            side: "bottom",
            children: [{ type: "kbd", content: lit("Cmd K") }],
          },
          {
            type: "popover",
            trigger: [{ type: "badge", content: lit("Details") }],
            title: lit("Details"),
            children: [{ type: "text", content: lit("Popover body") }],
          },
          {
            type: "hover-card",
            trigger: [{ type: "avatar", fallback: lit("AB"), size: "sm" }],
            children: [{ type: "text", content: lit("Profile") }],
          },
          {
            type: "aspect-ratio",
            ratio: 1.777,
            children: [{ type: "raw-html", content: lit("<strong>Trusted</strong>") }],
          },
          { type: "raw-css", content: lit(".view { color: var(--primary); }") },
          { type: "raw-js", code: lit("window.__viewSpecFixture = true;") },
          {
            type: "split-pane",
            props: { sizes: [30, 70] },
            children: [
              { type: "text", content: lit("Left") },
              { type: "text", content: lit("Right") },
            ],
          },
          {
            type: "tree",
            defaultExpanded: 2,
            events: {
              onNodeClick: {
                action: "setState",
                key: "selectedNode",
                value: { kind: "var", source: "event", path: ["node"] },
              },
            },
          },
          {
            type: "use",
            name: "status-badge",
            params: { tone: "info" },
          },
        ],
      },
    });

    const typedSpec: ViewSpecType = spec;
    expect(typedSpec.$viewSpec).toEqual({ version: "2" });

    const children = typedSpec.root.type === "rows" ? typedSpec.root.children : [];
    const card = findChild(children, "card");
    const tabs = findChild(card.children, "tabs");
    const condition = findChild(card.children, "condition");
    const table = findChild(children, "table");
    const chart = findChild(children, "chart");
    const select = findChild(children, "select");
    const use = findChild(children, "use");

    expect(card.action).toHaveLength(1);
    expect(card.footer).toHaveLength(1);
    expect(tabs.children).toHaveLength(1);
    expect(tabs.children[0]?.title).toEqual(lit("Overview"));
    expect(condition.children.map((child) => child.type)).toEqual(["case", "else"]);
    expect(table.bind).toEqual({ kind: "literal", value: [] });
    expect(table.columns).toEqual(["name", { key: "score", label: "Score" }]);
    expect(table.filters).toEqual([
      "status",
      { key: "region", label: "Region", placeholder: "Filter region..." },
    ]);
    expect(table.pageSize).toBe(25);
    expect(table.defaultSort).toEqual({ key: "score", direction: "desc" });
    expect(chart.series).toEqual(["revenue", { dataKey: "cost", label: "Cost", color: "#d43f3a" }]);
    expect(select.defaultValue).toEqual({
      kind: "var",
      source: "query",
      path: ["filters", "0", "status"],
    });
    expect(select.children).toEqual([
      { type: "select-option", value: "pending", label: lit("Pending") },
    ]);
    expect(use.overrides).toEqual({ tone: "info" });
  });
});
