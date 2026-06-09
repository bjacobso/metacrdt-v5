/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 *
 * Generated from the hosted ViewSpec descriptors in preludes/viewspec.lisp.
 * Run: pnpm --filter @metacrdt/views generate
 */

import { Schema } from "effect";
import { type ViewExpr, ViewExpression } from "./view-expression.generated.js";
import { type ViewActionOrList, ViewActionOrListSchema } from "./view-action.generated.js";

export interface ViewTableColumn {
  readonly key: string;
  readonly label?: string | undefined;
  readonly kind?: "text" | "status" | "severity" | "priority" | "date" | "mono" | undefined;
}

export interface ViewTableFilter {
  readonly key: string;
  readonly label?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly op?: "ilike" | "like" | "=" | "!=" | ">" | ">=" | "<" | "<=" | undefined;
}

export interface ViewTableSort {
  readonly key: string;
  readonly direction?: "asc" | "desc" | undefined;
}

export interface ViewChartSeries {
  readonly dataKey: string;
  readonly label?: string | undefined;
  readonly color?: string | undefined;
}

export interface ViewSelectOptionValue {
  readonly value: string;
  readonly label?: string | undefined;
}

export const ViewTableColumnSchema = Schema.Struct({
  key: Schema.String,
  label: Schema.optional(Schema.String),
  kind: Schema.optional(Schema.Literal("text", "status", "severity", "priority", "date", "mono")),
}).annotations({
  identifier: "ViewTableColumn",
}) as unknown as Schema.Schema<ViewTableColumn>;

export const ViewTableFilterSchema = Schema.Struct({
  key: Schema.String,
  label: Schema.optional(Schema.String),
  placeholder: Schema.optional(Schema.String),
  op: Schema.optional(Schema.Literal("ilike", "like", "=", "!=", ">", ">=", "<", "<=")),
}).annotations({
  identifier: "ViewTableFilter",
}) as unknown as Schema.Schema<ViewTableFilter>;

export const ViewTableSortSchema = Schema.Struct({
  key: Schema.String,
  direction: Schema.optional(Schema.Literal("asc", "desc")),
}).annotations({
  identifier: "ViewTableSort",
}) as unknown as Schema.Schema<ViewTableSort>;

export const ViewChartSeriesSchema = Schema.Struct({
  dataKey: Schema.String,
  label: Schema.optional(Schema.String),
  color: Schema.optional(Schema.String),
}).annotations({
  identifier: "ViewChartSeries",
}) as unknown as Schema.Schema<ViewChartSeries>;

export const ViewSelectOptionValueSchema = Schema.Struct({
  value: Schema.String,
  label: Schema.optional(Schema.String),
}).annotations({
  identifier: "ViewSelectOptionValue",
}) as unknown as Schema.Schema<ViewSelectOptionValue>;

export interface ViewNodeBase {
  readonly visible?: ViewExpr | undefined;
}

export interface ViewStyleFields {
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly minHeight?: number | undefined;
  readonly maxWidth?: number | undefined;
}

export const GENERATED_VIEW_COMPONENT_TYPES = ["text", "rows", "columns", "card", "item-group", "item", "button", "progress", "workflow-strip", "workflow-step", "empty-state", "badge", "avatar", "kbd", "spinner", "separator", "tabs", "tab-panel", "accordion", "accordion-item", "grid", "aspect-ratio", "spacer", "split-pane", "for-each", "condition", "case", "else", "slot", "use", "tooltip", "popover", "hover-card", "dialog", "table", "tree", "metric", "chart", "markdown", "stat-group", "heading", "divider", "alert", "form", "button-group", "breadcrumb", "breadcrumb-item", "input", "textarea", "checkbox", "switch", "select", "select-option", "radio-group", "radio-option", "slider", "toggle-group", "skeleton", "raw-html", "raw-css", "raw-js", "custom", "component-ref", "cond", "entity-browser", "action-button", "create-entity-button", "entity-picker", "query-console", "view-ref", "action-form", "entity-table", "entity-detail", "entity-form", "task-queue", "task-detail", "task-summary", "task-status-editor", "task-document-links", "task-metadata", "violation-list", "violation-detail", "violation-summary", "violation-status-editor", "violation-related-records", "violation-timeline"] as const;

export const VIEW_COMPONENT_TYPES = GENERATED_VIEW_COMPONENT_TYPES;

export type ViewComponentType = (typeof VIEW_COMPONENT_TYPES)[number];

export const ViewComponentType = Schema.Literal(...VIEW_COMPONENT_TYPES).annotations({
  identifier: "ViewComponentType",
});

export type ViewSpecComponentSlotKind =
  | "expr"
  | "string"
  | "number"
  | "boolean"
  | "record"
  | "unknown-array"
  | "node-list"
  | "number-array"
  | "table-columns"
  | "table-filters"
  | "table-sort"
  | "chart-series"
  | "select-options"
  | "boolean-or-number";

export interface ViewSpecComponentCatalogSlot {
  readonly name: string;
  readonly field: string;
  readonly kind: ViewSpecComponentSlotKind;
  readonly required: boolean;
  readonly many: boolean;
  readonly aliases: readonly string[];
  readonly values?: readonly string[] | undefined;
  readonly description?: string | undefined;
}

export interface ViewSpecComponentCatalogChildren {
  readonly kind: "any" | "none" | "only";
  readonly required: boolean;
  readonly types?: readonly ViewComponentType[] | undefined;
}

export interface ViewSpecComponentCatalogEntry {
  readonly type: ViewComponentType;
  readonly description?: string | undefined;
  readonly allowsBind: boolean;
  readonly requiredBind: boolean;
  readonly positionalProp?: string | undefined;
  readonly slots: readonly ViewSpecComponentCatalogSlot[];
  readonly children: ViewSpecComponentCatalogChildren;
  readonly parents: readonly ViewComponentType[];
  readonly events: readonly string[];
  readonly unknownPropsKind?: "expr" | "json" | "node-list" | "value" | undefined;
}

export const VIEW_SPEC_COMPONENT_CATALOG: Record<ViewComponentType, ViewSpecComponentCatalogEntry> = {
  "text": { type: "text", allowsBind: true, requiredBind: false, positionalProp: "content", slots: [{ name: "content", field: "content", kind: "expr", required: false, many: false, aliases: ["text"] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "rows": { type: "rows", allowsBind: false, requiredBind: false, slots: [{ name: "gap", field: "gap", kind: "number", required: false, many: false, aliases: [] }], children: { kind: "any", required: true }, parents: [], events: [] },
  "columns": { type: "columns", allowsBind: false, requiredBind: false, slots: [{ name: "gap", field: "gap", kind: "number", required: false, many: false, aliases: [] }], children: { kind: "any", required: true }, parents: [], events: [] },
  "card": { type: "card", allowsBind: false, requiredBind: false, slots: [{ name: "title", field: "title", kind: "expr", required: false, many: false, aliases: [] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }, { name: "subject-mode", field: "subjectMode", kind: "expr", required: false, many: false, aliases: [] }, { name: "action", field: "action", kind: "node-list", required: false, many: true, aliases: [] }, { name: "footer", field: "footer", kind: "node-list", required: false, many: true, aliases: [] }], children: { kind: "any", required: true }, parents: [], events: [] },
  "item-group": { type: "item-group", allowsBind: true, requiredBind: false, slots: [], children: { kind: "any", required: true }, parents: [], events: [] },
  "item": { type: "item", allowsBind: false, requiredBind: false, slots: [{ name: "variant", field: "variant", kind: "string", required: false, many: false, aliases: [], values: ["default", "outline", "muted"] }, { name: "size", field: "size", kind: "string", required: false, many: false, aliases: [], values: ["default", "sm", "xs"] }, { name: "icon", field: "icon", kind: "string", required: false, many: false, aliases: [] }, { name: "title", field: "title", kind: "expr", required: false, many: false, aliases: ["text", "content"] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }, { name: "value", field: "value", kind: "expr", required: false, many: false, aliases: [] }, { name: "badge", field: "badge", kind: "expr", required: false, many: false, aliases: [] }, { name: "badge-variant", field: "badgeVariant", kind: "string", required: false, many: false, aliases: [], values: ["default", "secondary", "outline", "destructive"] }], children: { kind: "any", required: false }, parents: [], events: ["onClick"] },
  "button": { type: "button", allowsBind: false, requiredBind: false, positionalProp: "label", slots: [{ name: "label", field: "label", kind: "expr", required: false, many: false, aliases: ["text", "title", "content"] }, { name: "variant", field: "variant", kind: "string", required: false, many: false, aliases: [], values: ["default", "destructive", "outline", "secondary", "ghost", "link"] }, { name: "size", field: "size", kind: "string", required: false, many: false, aliases: [], values: ["default", "sm", "lg", "icon"] }, { name: "disabled", field: "disabled", kind: "expr", required: false, many: false, aliases: [] }, { name: "button-type", field: "buttonType", kind: "string", required: false, many: false, aliases: ["type"], values: ["button", "submit", "reset"] }], children: { kind: "any", required: false }, parents: [], events: ["onClick"] },
  "progress": { type: "progress", allowsBind: true, requiredBind: false, slots: [{ name: "value", field: "value", kind: "expr", required: false, many: false, aliases: [] }, { name: "label", field: "label", kind: "expr", required: false, many: false, aliases: ["title"] }, { name: "hint", field: "hint", kind: "expr", required: false, many: false, aliases: ["description"] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "workflow-strip": { type: "workflow-strip", allowsBind: false, requiredBind: false, slots: [{ name: "title", field: "title", kind: "expr", required: false, many: false, aliases: [] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }], children: { kind: "only", required: true, types: ["workflow-step"] }, parents: [], events: [] },
  "workflow-step": { type: "workflow-step", allowsBind: false, requiredBind: false, slots: [{ name: "label", field: "label", kind: "expr", required: true, many: false, aliases: ["title"] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }, { name: "status", field: "status", kind: "expr", required: false, many: false, aliases: [] }, { name: "icon", field: "icon", kind: "string", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: ["workflow-strip"], events: [] },
  "empty-state": { type: "empty-state", allowsBind: false, requiredBind: false, slots: [{ name: "icon", field: "icon", kind: "string", required: false, many: false, aliases: [] }, { name: "title", field: "title", kind: "expr", required: false, many: false, aliases: ["text", "content"] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }], children: { kind: "any", required: false }, parents: [], events: [] },
  "badge": { type: "badge", allowsBind: false, requiredBind: false, positionalProp: "content", slots: [{ name: "content", field: "content", kind: "expr", required: false, many: false, aliases: ["text", "label", "value"] }, { name: "variant", field: "variant", kind: "string", required: false, many: false, aliases: [], values: ["default", "secondary", "outline", "destructive"] }, { name: "dot", field: "dot", kind: "boolean", required: false, many: false, aliases: [] }, { name: "dot-color", field: "dotColor", kind: "string", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "avatar": { type: "avatar", allowsBind: false, requiredBind: false, slots: [{ name: "src", field: "src", kind: "expr", required: false, many: false, aliases: [] }, { name: "alt", field: "alt", kind: "expr", required: false, many: false, aliases: [] }, { name: "fallback", field: "fallback", kind: "expr", required: false, many: false, aliases: ["text", "label"] }, { name: "size", field: "size", kind: "string", required: false, many: false, aliases: [], values: ["default", "sm", "lg"] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "kbd": { type: "kbd", allowsBind: false, requiredBind: false, positionalProp: "content", slots: [{ name: "content", field: "content", kind: "expr", required: false, many: false, aliases: ["text", "label"] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "spinner": { type: "spinner", allowsBind: false, requiredBind: false, slots: [{ name: "label", field: "label", kind: "expr", required: false, many: false, aliases: [] }, { name: "size", field: "size", kind: "string", required: false, many: false, aliases: [], values: ["sm", "default", "lg"] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "separator": { type: "separator", allowsBind: false, requiredBind: false, slots: [{ name: "orientation", field: "orientation", kind: "string", required: false, many: false, aliases: [], values: ["horizontal", "vertical"] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "tabs": { type: "tabs", allowsBind: false, requiredBind: false, slots: [], children: { kind: "only", required: true, types: ["tab-panel"] }, parents: [], events: [] },
  "tab-panel": { type: "tab-panel", allowsBind: false, requiredBind: false, slots: [{ name: "label", field: "label", kind: "expr", required: false, many: false, aliases: ["title"] }], children: { kind: "any", required: true }, parents: ["tabs"], events: [] },
  "accordion": { type: "accordion", allowsBind: false, requiredBind: false, slots: [{ name: "mode", field: "mode", kind: "string", required: false, many: false, aliases: [], values: ["single", "multiple"] }], children: { kind: "only", required: true, types: ["accordion-item"] }, parents: [], events: [] },
  "accordion-item": { type: "accordion-item", allowsBind: false, requiredBind: false, slots: [{ name: "title", field: "title", kind: "expr", required: false, many: false, aliases: ["label", "text"] }, { name: "default-open", field: "defaultOpen", kind: "boolean", required: false, many: false, aliases: [] }], children: { kind: "any", required: true }, parents: ["accordion"], events: [] },
  "grid": { type: "grid", allowsBind: false, requiredBind: false, slots: [{ name: "columns", field: "columns", kind: "number", required: false, many: false, aliases: [] }], children: { kind: "any", required: true }, parents: [], events: [] },
  "aspect-ratio": { type: "aspect-ratio", allowsBind: false, requiredBind: false, slots: [{ name: "ratio", field: "ratio", kind: "number", required: false, many: false, aliases: [] }], children: { kind: "any", required: true }, parents: [], events: [] },
  "spacer": { type: "spacer", allowsBind: false, requiredBind: false, slots: [{ name: "height", field: "height", kind: "number", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "split-pane": { type: "split-pane", allowsBind: false, requiredBind: false, slots: [{ name: "direction", field: "direction", kind: "string", required: false, many: false, aliases: [], values: ["horizontal", "vertical"] }, { name: "sizes", field: "sizes", kind: "number-array", required: false, many: false, aliases: [] }], children: { kind: "any", required: true }, parents: [], events: [] },
  "for-each": { type: "for-each", allowsBind: true, requiredBind: true, slots: [{ name: "empty-text", field: "emptyText", kind: "string", required: false, many: false, aliases: [] }], children: { kind: "any", required: true }, parents: [], events: [] },
  "condition": { type: "condition", allowsBind: false, requiredBind: false, slots: [], children: { kind: "only", required: true, types: ["case", "else"] }, parents: [], events: [] },
  "case": { type: "case", allowsBind: false, requiredBind: false, slots: [{ name: "when", field: "when", kind: "expr", required: true, many: false, aliases: [] }], children: { kind: "any", required: true }, parents: ["condition"], events: [] },
  "else": { type: "else", allowsBind: false, requiredBind: false, slots: [], children: { kind: "any", required: true }, parents: ["condition"], events: [] },
  "slot": { type: "slot", allowsBind: true, requiredBind: false, positionalProp: "name", slots: [{ name: "name", field: "name", kind: "string", required: false, many: false, aliases: ["ref"] }], children: { kind: "any", required: false }, parents: [], events: [] },
  "use": { type: "use", allowsBind: false, requiredBind: false, positionalProp: "name", slots: [{ name: "name", field: "name", kind: "string", required: true, many: false, aliases: ["ref", "def"] }, { name: "overrides", field: "overrides", kind: "record", required: false, many: false, aliases: ["params"] }], children: { kind: "any", required: false }, parents: [], events: [] },
  "tooltip": { type: "tooltip", allowsBind: false, requiredBind: false, slots: [{ name: "content", field: "content", kind: "expr", required: true, many: false, aliases: ["text", "label"] }, { name: "side", field: "side", kind: "string", required: false, many: false, aliases: [], values: ["top", "right", "bottom", "left"] }], children: { kind: "any", required: true }, parents: [], events: [] },
  "popover": { type: "popover", allowsBind: false, requiredBind: false, slots: [{ name: "trigger", field: "trigger", kind: "node-list", required: true, many: true, aliases: [] }, { name: "title", field: "title", kind: "expr", required: false, many: false, aliases: [] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }, { name: "side", field: "side", kind: "string", required: false, many: false, aliases: [], values: ["top", "right", "bottom", "left"] }, { name: "align", field: "align", kind: "string", required: false, many: false, aliases: [], values: ["start", "center", "end"] }], children: { kind: "any", required: true }, parents: [], events: [] },
  "hover-card": { type: "hover-card", allowsBind: false, requiredBind: false, slots: [{ name: "trigger", field: "trigger", kind: "node-list", required: true, many: true, aliases: [] }, { name: "side", field: "side", kind: "string", required: false, many: false, aliases: [], values: ["top", "right", "bottom", "left"] }, { name: "align", field: "align", kind: "string", required: false, many: false, aliases: [], values: ["start", "center", "end"] }], children: { kind: "any", required: true }, parents: [], events: [] },
  "dialog": { type: "dialog", allowsBind: false, requiredBind: false, slots: [{ name: "dialog-id", field: "dialogId", kind: "string", required: true, many: false, aliases: ["id", "name"] }, { name: "title", field: "title", kind: "expr", required: false, many: false, aliases: [] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }], children: { kind: "any", required: true }, parents: [], events: ["onOpenChange"] },
  "table": { type: "table", allowsBind: true, requiredBind: true, slots: [{ name: "columns", field: "columns", kind: "table-columns", required: false, many: false, aliases: [] }, { name: "filters", field: "filters", kind: "table-filters", required: false, many: false, aliases: [] }, { name: "page-size", field: "pageSize", kind: "number", required: false, many: false, aliases: [] }, { name: "default-sort", field: "defaultSort", kind: "table-sort", required: false, many: false, aliases: [] }, { name: "empty-state", field: "emptyState", kind: "string", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: ["onRowClick"] },
  "tree": { type: "tree", allowsBind: true, requiredBind: false, slots: [{ name: "id-key", field: "idKey", kind: "string", required: false, many: false, aliases: [] }, { name: "parent-id-key", field: "parentIdKey", kind: "string", required: false, many: false, aliases: ["parent-key"] }, { name: "label-key", field: "labelKey", kind: "string", required: false, many: false, aliases: [] }, { name: "default-expanded", field: "defaultExpanded", kind: "boolean-or-number", required: false, many: false, aliases: [] }], children: { kind: "any", required: false }, parents: [], events: ["onNodeClick"] },
  "metric": { type: "metric", allowsBind: true, requiredBind: true, slots: [{ name: "label", field: "label", kind: "expr", required: false, many: false, aliases: ["title"] }, { name: "value", field: "value", kind: "expr", required: false, many: false, aliases: [] }, { name: "value-key", field: "valueKey", kind: "string", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "chart": { type: "chart", allowsBind: true, requiredBind: false, slots: [{ name: "title", field: "title", kind: "expr", required: false, many: false, aliases: [] }, { name: "chart-type", field: "chartType", kind: "string", required: false, many: false, aliases: ["variant"], values: ["bar", "line", "area", "pie", "radar", "radial", "scatter"] }, { name: "category-key", field: "categoryKey", kind: "string", required: false, many: false, aliases: ["x-key"] }, { name: "series", field: "series", kind: "unknown-array", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "markdown": { type: "markdown", allowsBind: true, requiredBind: false, positionalProp: "content", slots: [{ name: "content", field: "content", kind: "expr", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "stat-group": { type: "stat-group", allowsBind: false, requiredBind: false, slots: [{ name: "gap", field: "gap", kind: "number", required: false, many: false, aliases: [] }], children: { kind: "any", required: true }, parents: [], events: [] },
  "heading": { type: "heading", allowsBind: false, requiredBind: false, positionalProp: "text", slots: [{ name: "text", field: "text", kind: "expr", required: false, many: false, aliases: ["title", "content"] }, { name: "level", field: "level", kind: "number", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "divider": { type: "divider", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "alert": { type: "alert", allowsBind: false, requiredBind: false, positionalProp: "message", slots: [{ name: "variant", field: "variant", kind: "string", required: false, many: false, aliases: [], values: ["default", "warning", "error", "info"] }, { name: "message", field: "message", kind: "expr", required: true, many: false, aliases: ["text"] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "form": { type: "form", allowsBind: false, requiredBind: false, slots: [{ name: "title", field: "title", kind: "expr", required: false, many: false, aliases: [] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }], children: { kind: "any", required: true }, parents: [], events: ["onSubmit"] },
  "button-group": { type: "button-group", allowsBind: false, requiredBind: false, slots: [{ name: "orientation", field: "orientation", kind: "string", required: false, many: false, aliases: [], values: ["horizontal", "vertical"] }], children: { kind: "any", required: true }, parents: [], events: [] },
  "breadcrumb": { type: "breadcrumb", allowsBind: false, requiredBind: false, slots: [], children: { kind: "only", required: true, types: ["breadcrumb-item"] }, parents: [], events: [] },
  "breadcrumb-item": { type: "breadcrumb-item", allowsBind: false, requiredBind: false, slots: [{ name: "label", field: "label", kind: "expr", required: true, many: false, aliases: ["text", "title"] }, { name: "href", field: "href", kind: "expr", required: false, many: false, aliases: [] }, { name: "current", field: "current", kind: "boolean", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: ["breadcrumb"], events: ["onClick"] },
  "input": { type: "input", allowsBind: false, requiredBind: false, slots: [{ name: "name", field: "name", kind: "string", required: true, many: false, aliases: ["state-key", "key"] }, { name: "default-value", field: "defaultValue", kind: "expr", required: false, many: false, aliases: [] }, { name: "label", field: "label", kind: "expr", required: false, many: false, aliases: [] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }, { name: "placeholder", field: "placeholder", kind: "string", required: false, many: false, aliases: [] }, { name: "input-type", field: "inputType", kind: "string", required: false, many: false, aliases: ["type"], values: ["text", "email", "password", "number", "url", "date"] }, { name: "prefix", field: "prefix", kind: "string", required: false, many: false, aliases: [] }, { name: "suffix", field: "suffix", kind: "string", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: ["onChange"] },
  "textarea": { type: "textarea", allowsBind: false, requiredBind: false, slots: [{ name: "name", field: "name", kind: "string", required: true, many: false, aliases: ["state-key", "key"] }, { name: "default-value", field: "defaultValue", kind: "expr", required: false, many: false, aliases: [] }, { name: "label", field: "label", kind: "expr", required: false, many: false, aliases: [] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }, { name: "placeholder", field: "placeholder", kind: "string", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: ["onChange"] },
  "checkbox": { type: "checkbox", allowsBind: false, requiredBind: false, slots: [{ name: "name", field: "name", kind: "string", required: true, many: false, aliases: ["state-key", "key"] }, { name: "default-value", field: "defaultValue", kind: "expr", required: false, many: false, aliases: [] }, { name: "label", field: "label", kind: "expr", required: false, many: false, aliases: ["text", "title"] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: ["onChange"] },
  "switch": { type: "switch", allowsBind: false, requiredBind: false, slots: [{ name: "name", field: "name", kind: "string", required: true, many: false, aliases: ["state-key", "key"] }, { name: "default-value", field: "defaultValue", kind: "expr", required: false, many: false, aliases: [] }, { name: "label", field: "label", kind: "expr", required: false, many: false, aliases: ["text", "title"] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: ["onChange"] },
  "select": { type: "select", allowsBind: false, requiredBind: false, slots: [{ name: "name", field: "name", kind: "string", required: true, many: false, aliases: ["state-key", "key"] }, { name: "default-value", field: "defaultValue", kind: "expr", required: false, many: false, aliases: [] }, { name: "label", field: "label", kind: "expr", required: false, many: false, aliases: [] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }, { name: "placeholder", field: "placeholder", kind: "string", required: false, many: false, aliases: [] }, { name: "options", field: "options", kind: "select-options", required: false, many: false, aliases: [] }], children: { kind: "only", required: false, types: ["select-option"] }, parents: [], events: ["onChange"] },
  "select-option": { type: "select-option", allowsBind: false, requiredBind: false, slots: [{ name: "value", field: "value", kind: "string", required: true, many: false, aliases: ["key"] }, { name: "label", field: "label", kind: "expr", required: false, many: false, aliases: ["text"] }], children: { kind: "none", required: false }, parents: ["select"], events: [] },
  "radio-group": { type: "radio-group", allowsBind: false, requiredBind: false, slots: [{ name: "name", field: "name", kind: "string", required: true, many: false, aliases: ["state-key", "key"] }, { name: "default-value", field: "defaultValue", kind: "expr", required: false, many: false, aliases: [] }, { name: "label", field: "label", kind: "expr", required: false, many: false, aliases: [] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }, { name: "options", field: "options", kind: "select-options", required: false, many: false, aliases: [] }], children: { kind: "only", required: false, types: ["radio-option"] }, parents: [], events: ["onChange"] },
  "radio-option": { type: "radio-option", allowsBind: false, requiredBind: false, slots: [{ name: "value", field: "value", kind: "string", required: true, many: false, aliases: ["key"] }, { name: "label", field: "label", kind: "expr", required: false, many: false, aliases: ["text"] }], children: { kind: "none", required: false }, parents: ["radio-group"], events: [] },
  "slider": { type: "slider", allowsBind: false, requiredBind: false, slots: [{ name: "name", field: "name", kind: "string", required: true, many: false, aliases: ["state-key", "key"] }, { name: "default-value", field: "defaultValue", kind: "expr", required: false, many: false, aliases: [] }, { name: "label", field: "label", kind: "expr", required: false, many: false, aliases: [] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }, { name: "min", field: "min", kind: "number", required: false, many: false, aliases: [] }, { name: "max", field: "max", kind: "number", required: false, many: false, aliases: [] }, { name: "step", field: "step", kind: "number", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: ["onChange"] },
  "toggle-group": { type: "toggle-group", allowsBind: false, requiredBind: false, slots: [{ name: "name", field: "name", kind: "string", required: true, many: false, aliases: ["state-key", "key"] }, { name: "default-value", field: "defaultValue", kind: "expr", required: false, many: false, aliases: [] }, { name: "mode", field: "mode", kind: "string", required: false, many: false, aliases: [], values: ["single", "multiple"] }, { name: "variant", field: "variant", kind: "string", required: false, many: false, aliases: [], values: ["default", "outline"] }, { name: "options", field: "options", kind: "unknown-array", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: ["onChange"] },
  "skeleton": { type: "skeleton", allowsBind: false, requiredBind: false, slots: [{ name: "lines", field: "lines", kind: "number", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "raw-html": { type: "raw-html", allowsBind: false, requiredBind: false, positionalProp: "content", slots: [{ name: "content", field: "content", kind: "expr", required: true, many: false, aliases: ["html"] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "raw-css": { type: "raw-css", allowsBind: false, requiredBind: false, positionalProp: "content", slots: [{ name: "content", field: "content", kind: "expr", required: true, many: false, aliases: ["css"] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "raw-js": { type: "raw-js", allowsBind: false, requiredBind: false, positionalProp: "code", slots: [{ name: "code", field: "code", kind: "expr", required: true, many: false, aliases: ["js", "content"] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "custom": { type: "custom", allowsBind: false, requiredBind: false, slots: [{ name: "component-name", field: "componentName", kind: "string", required: true, many: false, aliases: [] }, { name: "props", field: "props", kind: "record", required: false, many: false, aliases: [] }], children: { kind: "any", required: false }, parents: [], events: [], unknownPropsKind: "json" },
  "component-ref": { type: "component-ref", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "cond": { type: "cond", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "entity-browser": { type: "entity-browser", allowsBind: true, requiredBind: false, slots: [{ name: "title", field: "title", kind: "expr", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: ["onRowClick"] },
  "action-button": { type: "action-button", allowsBind: false, requiredBind: false, slots: [{ name: "label", field: "label", kind: "expr", required: false, many: false, aliases: ["text"] }, { name: "variant", field: "variant", kind: "string", required: false, many: false, aliases: [], values: ["default", "destructive", "outline", "secondary", "ghost"] }, { name: "action-ref", field: "actionRef", kind: "string", required: false, many: false, aliases: ["action-name"] }, { name: "entity-id", field: "entityId", kind: "expr", required: false, many: false, aliases: ["entity-id-bind"] }, { name: "parameters", field: "parameters", kind: "record", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: ["onClick", "onSuccess"] },
  "create-entity-button": { type: "create-entity-button", allowsBind: false, requiredBind: false, slots: [{ name: "label", field: "label", kind: "expr", required: false, many: false, aliases: ["text"] }, { name: "entity-type", field: "entityType", kind: "string", required: true, many: false, aliases: ["entity"] }, { name: "variant", field: "variant", kind: "string", required: false, many: false, aliases: [], values: ["default", "destructive", "outline", "secondary", "ghost"] }], children: { kind: "none", required: false }, parents: [], events: ["onClick", "onSuccess"] },
  "entity-picker": { type: "entity-picker", allowsBind: false, requiredBind: false, slots: [{ name: "name", field: "name", kind: "string", required: true, many: false, aliases: ["state-key", "key"] }, { name: "label", field: "label", kind: "expr", required: false, many: false, aliases: [] }, { name: "description", field: "description", kind: "expr", required: false, many: false, aliases: [] }, { name: "placeholder", field: "placeholder", kind: "string", required: false, many: false, aliases: [] }, { name: "entity-type", field: "entityType", kind: "string", required: false, many: false, aliases: ["entity"] }], children: { kind: "none", required: false }, parents: [], events: ["onChange"] },
  "query-console": { type: "query-console", allowsBind: false, requiredBind: false, slots: [{ name: "title", field: "title", kind: "expr", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "view-ref": { type: "view-ref", allowsBind: false, requiredBind: false, positionalProp: "name", slots: [{ name: "name", field: "name", kind: "string", required: true, many: false, aliases: ["ref"] }, { name: "input", field: "input", kind: "record", required: false, many: false, aliases: [] }], children: { kind: "none", required: false }, parents: [], events: [] },
  "action-form": { type: "action-form", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "entity-table": { type: "entity-table", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "entity-detail": { type: "entity-detail", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "entity-form": { type: "entity-form", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "task-queue": { type: "task-queue", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "task-detail": { type: "task-detail", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "task-summary": { type: "task-summary", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "task-status-editor": { type: "task-status-editor", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "task-document-links": { type: "task-document-links", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "task-metadata": { type: "task-metadata", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "violation-list": { type: "violation-list", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "violation-detail": { type: "violation-detail", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "violation-summary": { type: "violation-summary", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "violation-status-editor": { type: "violation-status-editor", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "violation-related-records": { type: "violation-related-records", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
  "violation-timeline": { type: "violation-timeline", allowsBind: false, requiredBind: false, slots: [], children: { kind: "none", required: false }, parents: [], events: [] },
};

export interface ViewTextNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "text";
  readonly bind?: ViewExpr | undefined;
  readonly content?: ViewExpr | undefined;
}

export interface ViewRowsNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "rows";
  readonly gap?: number | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewColumnsNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "columns";
  readonly gap?: number | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewCardNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "card";
  readonly title?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly subjectMode?: ViewExpr | undefined;
  readonly action?: readonly ViewNode[] | undefined;
  readonly footer?: readonly ViewNode[] | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewItemGroupNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "item-group";
  readonly bind?: ViewExpr | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewItemNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "item";
  readonly variant?: "default" | "outline" | "muted" | undefined;
  readonly size?: "default" | "sm" | "xs" | undefined;
  readonly icon?: string | undefined;
  readonly title?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly value?: ViewExpr | undefined;
  readonly badge?: ViewExpr | undefined;
  readonly badgeVariant?: "default" | "secondary" | "outline" | "destructive" | undefined;
  readonly children?: readonly ViewNode[] | undefined;
  readonly events?: { readonly onClick?: ViewActionOrList | undefined } | undefined;
}

export interface ViewButtonNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "button";
  readonly label?: ViewExpr | undefined;
  readonly variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" | undefined;
  readonly size?: "default" | "sm" | "lg" | "icon" | undefined;
  readonly disabled?: ViewExpr | undefined;
  readonly buttonType?: "button" | "submit" | "reset" | undefined;
  readonly children?: readonly ViewNode[] | undefined;
  readonly events?: { readonly onClick?: ViewActionOrList | undefined } | undefined;
}

export interface ViewProgressNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "progress";
  readonly bind?: ViewExpr | undefined;
  readonly value?: ViewExpr | undefined;
  readonly label?: ViewExpr | undefined;
  readonly hint?: ViewExpr | undefined;
}

export interface ViewWorkflowStripNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "workflow-strip";
  readonly title?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly children: readonly (ViewWorkflowStepNode)[];
}

export interface ViewWorkflowStepNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "workflow-step";
  readonly label: ViewExpr;
  readonly description?: ViewExpr | undefined;
  readonly status?: ViewExpr | undefined;
  readonly icon?: string | undefined;
}

export interface ViewEmptyStateNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "empty-state";
  readonly icon?: string | undefined;
  readonly title?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly children?: readonly ViewNode[] | undefined;
}

export interface ViewBadgeNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "badge";
  readonly content?: ViewExpr | undefined;
  readonly variant?: "default" | "secondary" | "outline" | "destructive" | undefined;
  readonly dot?: boolean | undefined;
  readonly dotColor?: string | undefined;
}

export interface ViewAvatarNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "avatar";
  readonly src?: ViewExpr | undefined;
  readonly alt?: ViewExpr | undefined;
  readonly fallback?: ViewExpr | undefined;
  readonly size?: "default" | "sm" | "lg" | undefined;
}

export interface ViewKbdNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "kbd";
  readonly content?: ViewExpr | undefined;
}

export interface ViewSpinnerNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "spinner";
  readonly label?: ViewExpr | undefined;
  readonly size?: "sm" | "default" | "lg" | undefined;
}

export interface ViewSeparatorNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "separator";
  readonly orientation?: "horizontal" | "vertical" | undefined;
}

export interface ViewTabsNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "tabs";
  readonly children: readonly (ViewTabPanelNode)[];
}

export interface ViewTabPanelNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "tab-panel";
  readonly label?: ViewExpr | undefined;
  readonly title?: ViewExpr | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewAccordionNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "accordion";
  readonly mode?: "single" | "multiple" | undefined;
  readonly children: readonly (ViewAccordionItemNode)[];
}

export interface ViewAccordionItemNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "accordion-item";
  readonly title?: ViewExpr | undefined;
  readonly defaultOpen?: boolean | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewGridNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "grid";
  readonly columns?: number | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewAspectRatioNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "aspect-ratio";
  readonly ratio?: number | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewSpacerNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "spacer";
  readonly height?: number | undefined;
}

export interface ViewSplitPaneNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "split-pane";
  readonly direction?: "horizontal" | "vertical" | undefined;
  readonly sizes?: readonly number[] | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewForEachNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "for-each";
  readonly bind: ViewExpr;
  readonly emptyText?: string | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewConditionNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "condition";
  readonly children: readonly (ViewCaseNode | ViewElseNode)[];
}

export interface ViewCaseNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "case";
  readonly when: ViewExpr;
  readonly children: readonly ViewNode[];
}

export interface ViewElseNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "else";
  readonly children: readonly ViewNode[];
}

export interface ViewSlotNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "slot";
  readonly bind?: ViewExpr | undefined;
  readonly name?: string | undefined;
  readonly children?: readonly ViewNode[] | undefined;
}

export interface ViewUseNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "use";
  readonly name: string;
  readonly overrides?: Record<string, unknown> | undefined;
  readonly children?: readonly ViewNode[] | undefined;
}

export interface ViewTooltipNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "tooltip";
  readonly content: ViewExpr;
  readonly side?: "top" | "right" | "bottom" | "left" | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewPopoverNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "popover";
  readonly trigger: readonly ViewNode[];
  readonly title?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly side?: "top" | "right" | "bottom" | "left" | undefined;
  readonly align?: "start" | "center" | "end" | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewHoverCardNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "hover-card";
  readonly trigger: readonly ViewNode[];
  readonly side?: "top" | "right" | "bottom" | "left" | undefined;
  readonly align?: "start" | "center" | "end" | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewDialogNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "dialog";
  readonly dialogId: string;
  readonly title?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly children: readonly ViewNode[];
  readonly events?: { readonly onOpenChange?: ViewActionOrList | undefined } | undefined;
}

export interface ViewTableNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "table";
  readonly bind: ViewExpr;
  readonly columns?: readonly (string | ViewTableColumn)[] | undefined;
  readonly filters?: readonly (string | ViewTableFilter)[] | undefined;
  readonly pageSize?: number | undefined;
  readonly defaultSort?: ViewTableSort | undefined;
  readonly emptyState?: string | undefined;
  readonly events?: { readonly onRowClick?: ViewActionOrList | undefined } | undefined;
}

export interface ViewTreeNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "tree";
  readonly bind?: ViewExpr | undefined;
  readonly idKey?: string | undefined;
  readonly parentIdKey?: string | undefined;
  readonly labelKey?: string | undefined;
  readonly defaultExpanded?: boolean | number | undefined;
  readonly children?: readonly ViewNode[] | undefined;
  readonly events?: { readonly onNodeClick?: ViewActionOrList | undefined } | undefined;
}

export interface ViewMetricNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "metric";
  readonly bind: ViewExpr;
  readonly label?: ViewExpr | undefined;
  readonly value?: ViewExpr | undefined;
  readonly valueKey?: string | undefined;
}

export interface ViewChartNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "chart";
  readonly bind?: ViewExpr | undefined;
  readonly title?: ViewExpr | undefined;
  readonly chartType?: "bar" | "line" | "area" | "pie" | "radar" | "radial" | "scatter" | undefined;
  readonly categoryKey?: string | undefined;
  readonly series?: readonly (string | ViewChartSeries)[] | undefined;
}

export interface ViewMarkdownNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "markdown";
  readonly bind?: ViewExpr | undefined;
  readonly content?: ViewExpr | undefined;
}

export interface ViewStatGroupNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "stat-group";
  readonly gap?: number | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewHeadingNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "heading";
  readonly text?: ViewExpr | undefined;
  readonly level?: number | undefined;
}

export interface ViewDividerNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "divider";
}

export interface ViewAlertNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "alert";
  readonly variant?: "default" | "warning" | "error" | "info" | undefined;
  readonly message: ViewExpr;
}

export interface ViewFormNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "form";
  readonly title?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly children: readonly ViewNode[];
  readonly events?: { readonly onSubmit?: ViewActionOrList | undefined } | undefined;
}

export interface ViewButtonGroupNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "button-group";
  readonly orientation?: "horizontal" | "vertical" | undefined;
  readonly children: readonly ViewNode[];
}

export interface ViewBreadcrumbNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "breadcrumb";
  readonly children: readonly (ViewBreadcrumbItemNode)[];
}

export interface ViewBreadcrumbItemNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "breadcrumb-item";
  readonly label: ViewExpr;
  readonly href?: ViewExpr | undefined;
  readonly current?: boolean | undefined;
  readonly events?: { readonly onClick?: ViewActionOrList | undefined } | undefined;
}

export interface ViewInputNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "input";
  readonly name: string;
  readonly defaultValue?: ViewExpr | undefined;
  readonly label?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly placeholder?: string | undefined;
  readonly inputType?: "text" | "email" | "password" | "number" | "url" | "date" | undefined;
  readonly prefix?: string | undefined;
  readonly suffix?: string | undefined;
  readonly events?: { readonly onChange?: ViewActionOrList | undefined } | undefined;
}

export interface ViewTextareaNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "textarea";
  readonly name: string;
  readonly defaultValue?: ViewExpr | undefined;
  readonly label?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly placeholder?: string | undefined;
  readonly events?: { readonly onChange?: ViewActionOrList | undefined } | undefined;
}

export interface ViewCheckboxNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "checkbox";
  readonly name: string;
  readonly defaultValue?: ViewExpr | undefined;
  readonly label?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly events?: { readonly onChange?: ViewActionOrList | undefined } | undefined;
}

export interface ViewSwitchNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "switch";
  readonly name: string;
  readonly defaultValue?: ViewExpr | undefined;
  readonly label?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly events?: { readonly onChange?: ViewActionOrList | undefined } | undefined;
}

export interface ViewSelectNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "select";
  readonly name: string;
  readonly defaultValue?: ViewExpr | undefined;
  readonly label?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly placeholder?: string | undefined;
  readonly options?: readonly (string | ViewSelectOptionValue)[] | undefined;
  readonly children?: readonly (ViewSelectOptionNode)[] | undefined;
  readonly events?: { readonly onChange?: ViewActionOrList | undefined } | undefined;
}

export interface ViewSelectOptionNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "select-option";
  readonly value: string;
  readonly label?: ViewExpr | undefined;
}

export interface ViewRadioGroupNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "radio-group";
  readonly name: string;
  readonly defaultValue?: ViewExpr | undefined;
  readonly label?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly options?: readonly (string | ViewSelectOptionValue)[] | undefined;
  readonly children?: readonly (ViewRadioOptionNode)[] | undefined;
  readonly events?: { readonly onChange?: ViewActionOrList | undefined } | undefined;
}

export interface ViewRadioOptionNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "radio-option";
  readonly value: string;
  readonly label?: ViewExpr | undefined;
}

export interface ViewSliderNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "slider";
  readonly name: string;
  readonly defaultValue?: ViewExpr | undefined;
  readonly label?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
  readonly events?: { readonly onChange?: ViewActionOrList | undefined } | undefined;
}

export interface ViewToggleGroupNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "toggle-group";
  readonly name: string;
  readonly defaultValue?: ViewExpr | undefined;
  readonly mode?: "single" | "multiple" | undefined;
  readonly variant?: "default" | "outline" | undefined;
  readonly options?: readonly (string | ViewSelectOptionValue)[] | undefined;
  readonly events?: { readonly onChange?: ViewActionOrList | undefined } | undefined;
}

export interface ViewSkeletonNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "skeleton";
  readonly lines?: number | undefined;
}

export interface ViewRawHtmlNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "raw-html";
  readonly content: ViewExpr;
}

export interface ViewRawCssNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "raw-css";
  readonly content: ViewExpr;
}

export interface ViewRawJsNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "raw-js";
  readonly code: ViewExpr;
}

export interface ViewCustomNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "custom";
  readonly componentName: string;
  readonly props?: Record<string, unknown> | undefined;
  readonly children?: readonly ViewNode[] | undefined;
}

export interface ViewComponentRefNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "component-ref";
}

export interface ViewCondNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "cond";
}

export interface ViewEntityBrowserNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "entity-browser";
  readonly bind?: ViewExpr | undefined;
  readonly title?: ViewExpr | undefined;
  readonly events?: { readonly onRowClick?: ViewActionOrList | undefined } | undefined;
}

export interface ViewActionButtonNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "action-button";
  readonly label?: ViewExpr | undefined;
  readonly variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | undefined;
  readonly actionRef?: string | undefined;
  readonly entityId?: ViewExpr | undefined;
  readonly parameters?: Record<string, unknown> | undefined;
  readonly events?: { readonly onClick?: ViewActionOrList | undefined; readonly onSuccess?: ViewActionOrList | undefined } | undefined;
}

export interface ViewCreateEntityButtonNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "create-entity-button";
  readonly label?: ViewExpr | undefined;
  readonly entityType: string;
  readonly variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | undefined;
  readonly events?: { readonly onClick?: ViewActionOrList | undefined; readonly onSuccess?: ViewActionOrList | undefined } | undefined;
}

export interface ViewEntityPickerNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "entity-picker";
  readonly name: string;
  readonly label?: ViewExpr | undefined;
  readonly description?: ViewExpr | undefined;
  readonly placeholder?: string | undefined;
  readonly entityType?: string | undefined;
  readonly events?: { readonly onChange?: ViewActionOrList | undefined } | undefined;
}

export interface ViewQueryConsoleNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "query-console";
  readonly title?: ViewExpr | undefined;
}

export interface ViewRefNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "view-ref";
  readonly name: string;
  readonly input?: Record<string, unknown> | undefined;
}

export interface ViewActionFormNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "action-form";
}

export interface ViewEntityTableNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "entity-table";
}

export interface ViewEntityDetailNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "entity-detail";
}

export interface ViewEntityFormNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "entity-form";
}

export interface ViewTaskQueueNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "task-queue";
}

export interface ViewTaskDetailNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "task-detail";
}

export interface ViewTaskSummaryNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "task-summary";
}

export interface ViewTaskStatusEditorNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "task-status-editor";
}

export interface ViewTaskDocumentLinksNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "task-document-links";
}

export interface ViewTaskMetadataNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "task-metadata";
}

export interface ViewViolationListNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "violation-list";
}

export interface ViewViolationDetailNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "violation-detail";
}

export interface ViewViolationSummaryNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "violation-summary";
}

export interface ViewViolationStatusEditorNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "violation-status-editor";
}

export interface ViewViolationRelatedRecordsNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "violation-related-records";
}

export interface ViewViolationTimelineNode extends ViewNodeBase, ViewStyleFields {
  readonly type: "violation-timeline";
}

export type ViewNode =
  | ViewTextNode
  | ViewRowsNode
  | ViewColumnsNode
  | ViewCardNode
  | ViewItemGroupNode
  | ViewItemNode
  | ViewButtonNode
  | ViewProgressNode
  | ViewWorkflowStripNode
  | ViewWorkflowStepNode
  | ViewEmptyStateNode
  | ViewBadgeNode
  | ViewAvatarNode
  | ViewKbdNode
  | ViewSpinnerNode
  | ViewSeparatorNode
  | ViewTabsNode
  | ViewTabPanelNode
  | ViewAccordionNode
  | ViewAccordionItemNode
  | ViewGridNode
  | ViewAspectRatioNode
  | ViewSpacerNode
  | ViewSplitPaneNode
  | ViewForEachNode
  | ViewConditionNode
  | ViewCaseNode
  | ViewElseNode
  | ViewSlotNode
  | ViewUseNode
  | ViewTooltipNode
  | ViewPopoverNode
  | ViewHoverCardNode
  | ViewDialogNode
  | ViewTableNode
  | ViewTreeNode
  | ViewMetricNode
  | ViewChartNode
  | ViewMarkdownNode
  | ViewStatGroupNode
  | ViewHeadingNode
  | ViewDividerNode
  | ViewAlertNode
  | ViewFormNode
  | ViewButtonGroupNode
  | ViewBreadcrumbNode
  | ViewBreadcrumbItemNode
  | ViewInputNode
  | ViewTextareaNode
  | ViewCheckboxNode
  | ViewSwitchNode
  | ViewSelectNode
  | ViewSelectOptionNode
  | ViewRadioGroupNode
  | ViewRadioOptionNode
  | ViewSliderNode
  | ViewToggleGroupNode
  | ViewSkeletonNode
  | ViewRawHtmlNode
  | ViewRawCssNode
  | ViewRawJsNode
  | ViewCustomNode
  | ViewComponentRefNode
  | ViewCondNode
  | ViewEntityBrowserNode
  | ViewActionButtonNode
  | ViewCreateEntityButtonNode
  | ViewEntityPickerNode
  | ViewQueryConsoleNode
  | ViewRefNode
  | ViewActionFormNode
  | ViewEntityTableNode
  | ViewEntityDetailNode
  | ViewEntityFormNode
  | ViewTaskQueueNode
  | ViewTaskDetailNode
  | ViewTaskSummaryNode
  | ViewTaskStatusEditorNode
  | ViewTaskDocumentLinksNode
  | ViewTaskMetadataNode
  | ViewViolationListNode
  | ViewViolationDetailNode
  | ViewViolationSummaryNode
  | ViewViolationStatusEditorNode
  | ViewViolationRelatedRecordsNode
  | ViewViolationTimelineNode
;

const ViewNodeBaseFields = {
  visible: Schema.optional(ViewExpression),
} as const;

const ViewStyleFields = {
  width: Schema.optional(Schema.Number),
  height: Schema.optional(Schema.Number),
  minHeight: Schema.optional(Schema.Number),
  maxWidth: Schema.optional(Schema.Number),
} as const;

export const ViewTextNodeSchema = Schema.Struct({
  type: Schema.Literal("text"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  bind: Schema.optional(ViewExpression),
  content: Schema.optional(ViewExpression),
}) as unknown as Schema.Schema<ViewTextNode>;

export const ViewRowsNodeSchema = Schema.Struct({
  type: Schema.Literal("rows"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  gap: Schema.optional(Schema.Number),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewRowsNode>;

export const ViewColumnsNodeSchema = Schema.Struct({
  type: Schema.Literal("columns"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  gap: Schema.optional(Schema.Number),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewColumnsNode>;

export const ViewCardNodeSchema = Schema.Struct({
  type: Schema.Literal("card"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  title: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  subjectMode: Schema.optional(ViewExpression),
  action: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema))),
  footer: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema))),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewCardNode>;

export const ViewItemGroupNodeSchema = Schema.Struct({
  type: Schema.Literal("item-group"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  bind: Schema.optional(ViewExpression),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewItemGroupNode>;

export const ViewItemNodeSchema = Schema.Struct({
  type: Schema.Literal("item"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  variant: Schema.optional(Schema.Literal("default", "outline", "muted")),
  size: Schema.optional(Schema.Literal("default", "sm", "xs")),
  icon: Schema.optional(Schema.String),
  title: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  value: Schema.optional(ViewExpression),
  badge: Schema.optional(ViewExpression),
  badgeVariant: Schema.optional(Schema.Literal("default", "secondary", "outline", "destructive")),
  children: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema))),
  events: Schema.optional(Schema.Struct({ onClick: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewItemNode>;

export const ViewButtonNodeSchema = Schema.Struct({
  type: Schema.Literal("button"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  label: Schema.optional(ViewExpression),
  variant: Schema.optional(Schema.Literal("default", "destructive", "outline", "secondary", "ghost", "link")),
  size: Schema.optional(Schema.Literal("default", "sm", "lg", "icon")),
  disabled: Schema.optional(ViewExpression),
  buttonType: Schema.optional(Schema.Literal("button", "submit", "reset")),
  children: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema))),
  events: Schema.optional(Schema.Struct({ onClick: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewButtonNode>;

export const ViewProgressNodeSchema = Schema.Struct({
  type: Schema.Literal("progress"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  bind: Schema.optional(ViewExpression),
  value: Schema.optional(ViewExpression),
  label: Schema.optional(ViewExpression),
  hint: Schema.optional(ViewExpression),
}) as unknown as Schema.Schema<ViewProgressNode>;

export const ViewWorkflowStripNodeSchema = Schema.Struct({
  type: Schema.Literal("workflow-strip"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  title: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewWorkflowStripNode>;

export const ViewWorkflowStepNodeSchema = Schema.Struct({
  type: Schema.Literal("workflow-step"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  label: ViewExpression,
  description: Schema.optional(ViewExpression),
  status: Schema.optional(ViewExpression),
  icon: Schema.optional(Schema.String),
}) as unknown as Schema.Schema<ViewWorkflowStepNode>;

export const ViewEmptyStateNodeSchema = Schema.Struct({
  type: Schema.Literal("empty-state"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  icon: Schema.optional(Schema.String),
  title: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  children: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema))),
}) as unknown as Schema.Schema<ViewEmptyStateNode>;

export const ViewBadgeNodeSchema = Schema.Struct({
  type: Schema.Literal("badge"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  content: Schema.optional(ViewExpression),
  variant: Schema.optional(Schema.Literal("default", "secondary", "outline", "destructive")),
  dot: Schema.optional(Schema.Boolean),
  dotColor: Schema.optional(Schema.String),
}) as unknown as Schema.Schema<ViewBadgeNode>;

export const ViewAvatarNodeSchema = Schema.Struct({
  type: Schema.Literal("avatar"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  src: Schema.optional(ViewExpression),
  alt: Schema.optional(ViewExpression),
  fallback: Schema.optional(ViewExpression),
  size: Schema.optional(Schema.Literal("default", "sm", "lg")),
}) as unknown as Schema.Schema<ViewAvatarNode>;

export const ViewKbdNodeSchema = Schema.Struct({
  type: Schema.Literal("kbd"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  content: Schema.optional(ViewExpression),
}) as unknown as Schema.Schema<ViewKbdNode>;

export const ViewSpinnerNodeSchema = Schema.Struct({
  type: Schema.Literal("spinner"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  label: Schema.optional(ViewExpression),
  size: Schema.optional(Schema.Literal("sm", "default", "lg")),
}) as unknown as Schema.Schema<ViewSpinnerNode>;

export const ViewSeparatorNodeSchema = Schema.Struct({
  type: Schema.Literal("separator"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  orientation: Schema.optional(Schema.Literal("horizontal", "vertical")),
}) as unknown as Schema.Schema<ViewSeparatorNode>;

export const ViewTabsNodeSchema = Schema.Struct({
  type: Schema.Literal("tabs"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewTabsNode>;

export const ViewTabPanelNodeSchema = Schema.Struct({
  type: Schema.Literal("tab-panel"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  label: Schema.optional(ViewExpression),
  title: Schema.optional(ViewExpression),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewTabPanelNode>;

export const ViewAccordionNodeSchema = Schema.Struct({
  type: Schema.Literal("accordion"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  mode: Schema.optional(Schema.Literal("single", "multiple")),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewAccordionNode>;

export const ViewAccordionItemNodeSchema = Schema.Struct({
  type: Schema.Literal("accordion-item"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  title: Schema.optional(ViewExpression),
  defaultOpen: Schema.optional(Schema.Boolean),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewAccordionItemNode>;

export const ViewGridNodeSchema = Schema.Struct({
  type: Schema.Literal("grid"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  columns: Schema.optional(Schema.Number),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewGridNode>;

export const ViewAspectRatioNodeSchema = Schema.Struct({
  type: Schema.Literal("aspect-ratio"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  ratio: Schema.optional(Schema.Number),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewAspectRatioNode>;

export const ViewSpacerNodeSchema = Schema.Struct({
  type: Schema.Literal("spacer"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  height: Schema.optional(Schema.Number),
}) as unknown as Schema.Schema<ViewSpacerNode>;

export const ViewSplitPaneNodeSchema = Schema.Struct({
  type: Schema.Literal("split-pane"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  direction: Schema.optional(Schema.Literal("horizontal", "vertical")),
  sizes: Schema.optional(Schema.Array(Schema.Number)),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewSplitPaneNode>;

export const ViewForEachNodeSchema = Schema.Struct({
  type: Schema.Literal("for-each"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  bind: ViewExpression,
  emptyText: Schema.optional(Schema.String),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewForEachNode>;

export const ViewConditionNodeSchema = Schema.Struct({
  type: Schema.Literal("condition"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewConditionNode>;

export const ViewCaseNodeSchema = Schema.Struct({
  type: Schema.Literal("case"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  when: ViewExpression,
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewCaseNode>;

export const ViewElseNodeSchema = Schema.Struct({
  type: Schema.Literal("else"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewElseNode>;

export const ViewSlotNodeSchema = Schema.Struct({
  type: Schema.Literal("slot"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  bind: Schema.optional(ViewExpression),
  name: Schema.optional(Schema.String),
  children: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema))),
}) as unknown as Schema.Schema<ViewSlotNode>;

export const ViewUseNodeSchema = Schema.Struct({
  type: Schema.Literal("use"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  name: Schema.String,
  overrides: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  children: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema))),
}) as unknown as Schema.Schema<ViewUseNode>;

export const ViewTooltipNodeSchema = Schema.Struct({
  type: Schema.Literal("tooltip"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  content: ViewExpression,
  side: Schema.optional(Schema.Literal("top", "right", "bottom", "left")),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewTooltipNode>;

export const ViewPopoverNodeSchema = Schema.Struct({
  type: Schema.Literal("popover"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  trigger: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
  title: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  side: Schema.optional(Schema.Literal("top", "right", "bottom", "left")),
  align: Schema.optional(Schema.Literal("start", "center", "end")),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewPopoverNode>;

export const ViewHoverCardNodeSchema = Schema.Struct({
  type: Schema.Literal("hover-card"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  trigger: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
  side: Schema.optional(Schema.Literal("top", "right", "bottom", "left")),
  align: Schema.optional(Schema.Literal("start", "center", "end")),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewHoverCardNode>;

export const ViewDialogNodeSchema = Schema.Struct({
  type: Schema.Literal("dialog"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  dialogId: Schema.String,
  title: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
  events: Schema.optional(Schema.Struct({ onOpenChange: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewDialogNode>;

export const ViewTableNodeSchema = Schema.Struct({
  type: Schema.Literal("table"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  bind: ViewExpression,
  columns: Schema.optional(Schema.Array(Schema.Union(Schema.String, ViewTableColumnSchema))),
  filters: Schema.optional(Schema.Array(Schema.Union(Schema.String, ViewTableFilterSchema))),
  pageSize: Schema.optional(Schema.Number),
  defaultSort: Schema.optional(ViewTableSortSchema),
  emptyState: Schema.optional(Schema.String),
  events: Schema.optional(Schema.Struct({ onRowClick: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewTableNode>;

export const ViewTreeNodeSchema = Schema.Struct({
  type: Schema.Literal("tree"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  bind: Schema.optional(ViewExpression),
  idKey: Schema.optional(Schema.String),
  parentIdKey: Schema.optional(Schema.String),
  labelKey: Schema.optional(Schema.String),
  defaultExpanded: Schema.optional(Schema.Union(Schema.Boolean, Schema.Number)),
  children: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema))),
  events: Schema.optional(Schema.Struct({ onNodeClick: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewTreeNode>;

export const ViewMetricNodeSchema = Schema.Struct({
  type: Schema.Literal("metric"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  bind: ViewExpression,
  label: Schema.optional(ViewExpression),
  value: Schema.optional(ViewExpression),
  valueKey: Schema.optional(Schema.String),
}) as unknown as Schema.Schema<ViewMetricNode>;

export const ViewChartNodeSchema = Schema.Struct({
  type: Schema.Literal("chart"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  bind: Schema.optional(ViewExpression),
  title: Schema.optional(ViewExpression),
  chartType: Schema.optional(Schema.Literal("bar", "line", "area", "pie", "radar", "radial", "scatter")),
  categoryKey: Schema.optional(Schema.String),
  series: Schema.optional(Schema.Array(Schema.Union(Schema.String, ViewChartSeriesSchema))),
}) as unknown as Schema.Schema<ViewChartNode>;

export const ViewMarkdownNodeSchema = Schema.Struct({
  type: Schema.Literal("markdown"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  bind: Schema.optional(ViewExpression),
  content: Schema.optional(ViewExpression),
}) as unknown as Schema.Schema<ViewMarkdownNode>;

export const ViewStatGroupNodeSchema = Schema.Struct({
  type: Schema.Literal("stat-group"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  gap: Schema.optional(Schema.Number),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewStatGroupNode>;

export const ViewHeadingNodeSchema = Schema.Struct({
  type: Schema.Literal("heading"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  text: Schema.optional(ViewExpression),
  level: Schema.optional(Schema.Number),
}) as unknown as Schema.Schema<ViewHeadingNode>;

export const ViewDividerNodeSchema = Schema.Struct({
  type: Schema.Literal("divider"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewDividerNode>;

export const ViewAlertNodeSchema = Schema.Struct({
  type: Schema.Literal("alert"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  variant: Schema.optional(Schema.Literal("default", "warning", "error", "info")),
  message: ViewExpression,
}) as unknown as Schema.Schema<ViewAlertNode>;

export const ViewFormNodeSchema = Schema.Struct({
  type: Schema.Literal("form"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  title: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
  events: Schema.optional(Schema.Struct({ onSubmit: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewFormNode>;

export const ViewButtonGroupNodeSchema = Schema.Struct({
  type: Schema.Literal("button-group"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  orientation: Schema.optional(Schema.Literal("horizontal", "vertical")),
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewButtonGroupNode>;

export const ViewBreadcrumbNodeSchema = Schema.Struct({
  type: Schema.Literal("breadcrumb"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  children: Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema)),
}) as unknown as Schema.Schema<ViewBreadcrumbNode>;

export const ViewBreadcrumbItemNodeSchema = Schema.Struct({
  type: Schema.Literal("breadcrumb-item"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  label: ViewExpression,
  href: Schema.optional(ViewExpression),
  current: Schema.optional(Schema.Boolean),
  events: Schema.optional(Schema.Struct({ onClick: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewBreadcrumbItemNode>;

export const ViewInputNodeSchema = Schema.Struct({
  type: Schema.Literal("input"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  name: Schema.String,
  defaultValue: Schema.optional(ViewExpression),
  label: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  placeholder: Schema.optional(Schema.String),
  inputType: Schema.optional(Schema.Literal("text", "email", "password", "number", "url", "date")),
  prefix: Schema.optional(Schema.String),
  suffix: Schema.optional(Schema.String),
  events: Schema.optional(Schema.Struct({ onChange: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewInputNode>;

export const ViewTextareaNodeSchema = Schema.Struct({
  type: Schema.Literal("textarea"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  name: Schema.String,
  defaultValue: Schema.optional(ViewExpression),
  label: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  placeholder: Schema.optional(Schema.String),
  events: Schema.optional(Schema.Struct({ onChange: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewTextareaNode>;

export const ViewCheckboxNodeSchema = Schema.Struct({
  type: Schema.Literal("checkbox"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  name: Schema.String,
  defaultValue: Schema.optional(ViewExpression),
  label: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  events: Schema.optional(Schema.Struct({ onChange: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewCheckboxNode>;

export const ViewSwitchNodeSchema = Schema.Struct({
  type: Schema.Literal("switch"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  name: Schema.String,
  defaultValue: Schema.optional(ViewExpression),
  label: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  events: Schema.optional(Schema.Struct({ onChange: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewSwitchNode>;

export const ViewSelectNodeSchema = Schema.Struct({
  type: Schema.Literal("select"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  name: Schema.String,
  defaultValue: Schema.optional(ViewExpression),
  label: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  placeholder: Schema.optional(Schema.String),
  options: Schema.optional(Schema.Array(Schema.Union(Schema.String, ViewSelectOptionValueSchema))),
  children: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema))),
  events: Schema.optional(Schema.Struct({ onChange: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewSelectNode>;

export const ViewSelectOptionNodeSchema = Schema.Struct({
  type: Schema.Literal("select-option"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  value: Schema.String,
  label: Schema.optional(ViewExpression),
}) as unknown as Schema.Schema<ViewSelectOptionNode>;

export const ViewRadioGroupNodeSchema = Schema.Struct({
  type: Schema.Literal("radio-group"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  name: Schema.String,
  defaultValue: Schema.optional(ViewExpression),
  label: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  options: Schema.optional(Schema.Array(Schema.Union(Schema.String, ViewSelectOptionValueSchema))),
  children: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema))),
  events: Schema.optional(Schema.Struct({ onChange: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewRadioGroupNode>;

export const ViewRadioOptionNodeSchema = Schema.Struct({
  type: Schema.Literal("radio-option"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  value: Schema.String,
  label: Schema.optional(ViewExpression),
}) as unknown as Schema.Schema<ViewRadioOptionNode>;

export const ViewSliderNodeSchema = Schema.Struct({
  type: Schema.Literal("slider"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  name: Schema.String,
  defaultValue: Schema.optional(ViewExpression),
  label: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  min: Schema.optional(Schema.Number),
  max: Schema.optional(Schema.Number),
  step: Schema.optional(Schema.Number),
  events: Schema.optional(Schema.Struct({ onChange: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewSliderNode>;

export const ViewToggleGroupNodeSchema = Schema.Struct({
  type: Schema.Literal("toggle-group"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  name: Schema.String,
  defaultValue: Schema.optional(ViewExpression),
  mode: Schema.optional(Schema.Literal("single", "multiple")),
  variant: Schema.optional(Schema.Literal("default", "outline")),
  options: Schema.optional(Schema.Array(Schema.Union(Schema.String, ViewSelectOptionValueSchema))),
  events: Schema.optional(Schema.Struct({ onChange: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewToggleGroupNode>;

export const ViewSkeletonNodeSchema = Schema.Struct({
  type: Schema.Literal("skeleton"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  lines: Schema.optional(Schema.Number),
}) as unknown as Schema.Schema<ViewSkeletonNode>;

export const ViewRawHtmlNodeSchema = Schema.Struct({
  type: Schema.Literal("raw-html"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  content: ViewExpression,
}) as unknown as Schema.Schema<ViewRawHtmlNode>;

export const ViewRawCssNodeSchema = Schema.Struct({
  type: Schema.Literal("raw-css"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  content: ViewExpression,
}) as unknown as Schema.Schema<ViewRawCssNode>;

export const ViewRawJsNodeSchema = Schema.Struct({
  type: Schema.Literal("raw-js"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  code: ViewExpression,
}) as unknown as Schema.Schema<ViewRawJsNode>;

export const ViewCustomNodeSchema = Schema.Struct({
  type: Schema.Literal("custom"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  componentName: Schema.String,
  props: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  children: Schema.optional(Schema.Array(Schema.suspend((): Schema.Schema<ViewNode> => ViewNodeSchema))),
}) as unknown as Schema.Schema<ViewCustomNode>;

export const ViewComponentRefNodeSchema = Schema.Struct({
  type: Schema.Literal("component-ref"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewComponentRefNode>;

export const ViewCondNodeSchema = Schema.Struct({
  type: Schema.Literal("cond"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewCondNode>;

export const ViewEntityBrowserNodeSchema = Schema.Struct({
  type: Schema.Literal("entity-browser"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  bind: Schema.optional(ViewExpression),
  title: Schema.optional(ViewExpression),
  events: Schema.optional(Schema.Struct({ onRowClick: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewEntityBrowserNode>;

export const ViewActionButtonNodeSchema = Schema.Struct({
  type: Schema.Literal("action-button"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  label: Schema.optional(ViewExpression),
  variant: Schema.optional(Schema.Literal("default", "destructive", "outline", "secondary", "ghost")),
  actionRef: Schema.optional(Schema.String),
  entityId: Schema.optional(ViewExpression),
  parameters: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
  events: Schema.optional(Schema.Struct({ onClick: Schema.optional(ViewActionOrListSchema), onSuccess: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewActionButtonNode>;

export const ViewCreateEntityButtonNodeSchema = Schema.Struct({
  type: Schema.Literal("create-entity-button"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  label: Schema.optional(ViewExpression),
  entityType: Schema.String,
  variant: Schema.optional(Schema.Literal("default", "destructive", "outline", "secondary", "ghost")),
  events: Schema.optional(Schema.Struct({ onClick: Schema.optional(ViewActionOrListSchema), onSuccess: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewCreateEntityButtonNode>;

export const ViewEntityPickerNodeSchema = Schema.Struct({
  type: Schema.Literal("entity-picker"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  name: Schema.String,
  label: Schema.optional(ViewExpression),
  description: Schema.optional(ViewExpression),
  placeholder: Schema.optional(Schema.String),
  entityType: Schema.optional(Schema.String),
  events: Schema.optional(Schema.Struct({ onChange: Schema.optional(ViewActionOrListSchema) })),
}) as unknown as Schema.Schema<ViewEntityPickerNode>;

export const ViewQueryConsoleNodeSchema = Schema.Struct({
  type: Schema.Literal("query-console"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  title: Schema.optional(ViewExpression),
}) as unknown as Schema.Schema<ViewQueryConsoleNode>;

export const ViewRefNodeSchema = Schema.Struct({
  type: Schema.Literal("view-ref"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
  name: Schema.String,
  input: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) as unknown as Schema.Schema<ViewRefNode>;

export const ViewActionFormNodeSchema = Schema.Struct({
  type: Schema.Literal("action-form"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewActionFormNode>;

export const ViewEntityTableNodeSchema = Schema.Struct({
  type: Schema.Literal("entity-table"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewEntityTableNode>;

export const ViewEntityDetailNodeSchema = Schema.Struct({
  type: Schema.Literal("entity-detail"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewEntityDetailNode>;

export const ViewEntityFormNodeSchema = Schema.Struct({
  type: Schema.Literal("entity-form"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewEntityFormNode>;

export const ViewTaskQueueNodeSchema = Schema.Struct({
  type: Schema.Literal("task-queue"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewTaskQueueNode>;

export const ViewTaskDetailNodeSchema = Schema.Struct({
  type: Schema.Literal("task-detail"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewTaskDetailNode>;

export const ViewTaskSummaryNodeSchema = Schema.Struct({
  type: Schema.Literal("task-summary"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewTaskSummaryNode>;

export const ViewTaskStatusEditorNodeSchema = Schema.Struct({
  type: Schema.Literal("task-status-editor"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewTaskStatusEditorNode>;

export const ViewTaskDocumentLinksNodeSchema = Schema.Struct({
  type: Schema.Literal("task-document-links"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewTaskDocumentLinksNode>;

export const ViewTaskMetadataNodeSchema = Schema.Struct({
  type: Schema.Literal("task-metadata"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewTaskMetadataNode>;

export const ViewViolationListNodeSchema = Schema.Struct({
  type: Schema.Literal("violation-list"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewViolationListNode>;

export const ViewViolationDetailNodeSchema = Schema.Struct({
  type: Schema.Literal("violation-detail"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewViolationDetailNode>;

export const ViewViolationSummaryNodeSchema = Schema.Struct({
  type: Schema.Literal("violation-summary"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewViolationSummaryNode>;

export const ViewViolationStatusEditorNodeSchema = Schema.Struct({
  type: Schema.Literal("violation-status-editor"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewViolationStatusEditorNode>;

export const ViewViolationRelatedRecordsNodeSchema = Schema.Struct({
  type: Schema.Literal("violation-related-records"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewViolationRelatedRecordsNode>;

export const ViewViolationTimelineNodeSchema = Schema.Struct({
  type: Schema.Literal("violation-timeline"),
  ...ViewNodeBaseFields,
  ...ViewStyleFields,
}) as unknown as Schema.Schema<ViewViolationTimelineNode>;

export const ViewNodeSchema = Schema.Union(ViewTextNodeSchema, ViewRowsNodeSchema, ViewColumnsNodeSchema, ViewCardNodeSchema, ViewItemGroupNodeSchema, ViewItemNodeSchema, ViewButtonNodeSchema, ViewProgressNodeSchema, ViewWorkflowStripNodeSchema, ViewWorkflowStepNodeSchema, ViewEmptyStateNodeSchema, ViewBadgeNodeSchema, ViewAvatarNodeSchema, ViewKbdNodeSchema, ViewSpinnerNodeSchema, ViewSeparatorNodeSchema, ViewTabsNodeSchema, ViewTabPanelNodeSchema, ViewAccordionNodeSchema, ViewAccordionItemNodeSchema, ViewGridNodeSchema, ViewAspectRatioNodeSchema, ViewSpacerNodeSchema, ViewSplitPaneNodeSchema, ViewForEachNodeSchema, ViewConditionNodeSchema, ViewCaseNodeSchema, ViewElseNodeSchema, ViewSlotNodeSchema, ViewUseNodeSchema, ViewTooltipNodeSchema, ViewPopoverNodeSchema, ViewHoverCardNodeSchema, ViewDialogNodeSchema, ViewTableNodeSchema, ViewTreeNodeSchema, ViewMetricNodeSchema, ViewChartNodeSchema, ViewMarkdownNodeSchema, ViewStatGroupNodeSchema, ViewHeadingNodeSchema, ViewDividerNodeSchema, ViewAlertNodeSchema, ViewFormNodeSchema, ViewButtonGroupNodeSchema, ViewBreadcrumbNodeSchema, ViewBreadcrumbItemNodeSchema, ViewInputNodeSchema, ViewTextareaNodeSchema, ViewCheckboxNodeSchema, ViewSwitchNodeSchema, ViewSelectNodeSchema, ViewSelectOptionNodeSchema, ViewRadioGroupNodeSchema, ViewRadioOptionNodeSchema, ViewSliderNodeSchema, ViewToggleGroupNodeSchema, ViewSkeletonNodeSchema, ViewRawHtmlNodeSchema, ViewRawCssNodeSchema, ViewRawJsNodeSchema, ViewCustomNodeSchema, ViewComponentRefNodeSchema, ViewCondNodeSchema, ViewEntityBrowserNodeSchema, ViewActionButtonNodeSchema, ViewCreateEntityButtonNodeSchema, ViewEntityPickerNodeSchema, ViewQueryConsoleNodeSchema, ViewRefNodeSchema, ViewActionFormNodeSchema, ViewEntityTableNodeSchema, ViewEntityDetailNodeSchema, ViewEntityFormNodeSchema, ViewTaskQueueNodeSchema, ViewTaskDetailNodeSchema, ViewTaskSummaryNodeSchema, ViewTaskStatusEditorNodeSchema, ViewTaskDocumentLinksNodeSchema, ViewTaskMetadataNodeSchema, ViewViolationListNodeSchema, ViewViolationDetailNodeSchema, ViewViolationSummaryNodeSchema, ViewViolationStatusEditorNodeSchema, ViewViolationRelatedRecordsNodeSchema, ViewViolationTimelineNodeSchema).annotations({ identifier: "ViewNode" }) as unknown as Schema.Schema<ViewNode>;

export const ViewNode = ViewNodeSchema;

export const ViewNodeSpec = ViewNode;

type ViewNodeNormalizationSlotKind =
  | "expr"
  | "string"
  | "number"
  | "boolean"
  | "record"
  | "unknown-array"
  | "node-list"
  | "number-array"
  | "table-columns"
  | "table-filters"
  | "table-sort"
  | "chart-series"
  | "select-options"
  | "boolean-or-number";

type ViewNodeNormalizationDefault =
  | "empty-expr"
  | "false-expr-or-bind";

interface ViewNodeNormalizationSlotSpec {
  readonly field: string;
  readonly keys: readonly string[];
  readonly kind: ViewNodeNormalizationSlotKind;
  readonly required?: boolean | undefined;
  readonly default?: ViewNodeNormalizationDefault | undefined;
}

interface ViewNodeNormalizationChildrenSpec {
  readonly kind: "any" | "only";
  readonly required: boolean;
  readonly types?: readonly ViewComponentType[] | undefined;
}

interface ViewNodeNormalizationSpec {
  readonly allowsBind: boolean;
  readonly requiredBind: boolean;
  readonly slots: readonly ViewNodeNormalizationSlotSpec[];
  readonly extraFields?: readonly ViewNodeNormalizationSlotSpec[] | undefined;
  readonly children?: ViewNodeNormalizationChildrenSpec | undefined;
  readonly events: readonly string[];
  readonly unknownPropsKind?: "expr" | "json" | "node-list" | "value" | undefined;
}

const ViewNodeNormalizationSpecs: Record<ViewComponentType, ViewNodeNormalizationSpec> = {
  "text": { allowsBind: true, requiredBind: false, slots: [{ field: "content", keys: ["content", "text"], kind: "expr" }], events: [] },
  "rows": { allowsBind: false, requiredBind: false, slots: [{ field: "gap", keys: ["gap"], kind: "number" }], children: { kind: "any", required: true }, events: [] },
  "columns": { allowsBind: false, requiredBind: false, slots: [{ field: "gap", keys: ["gap"], kind: "number" }], children: { kind: "any", required: true }, events: [] },
  "card": { allowsBind: false, requiredBind: false, slots: [{ field: "title", keys: ["title"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }, { field: "subjectMode", keys: ["subjectMode", "subject-mode"], kind: "expr" }, { field: "action", keys: ["action"], kind: "node-list" }, { field: "footer", keys: ["footer"], kind: "node-list" }], children: { kind: "any", required: true }, events: [] },
  "item-group": { allowsBind: true, requiredBind: false, slots: [], children: { kind: "any", required: true }, events: [] },
  "item": { allowsBind: false, requiredBind: false, slots: [{ field: "variant", keys: ["variant"], kind: "string" }, { field: "size", keys: ["size"], kind: "string" }, { field: "icon", keys: ["icon"], kind: "string" }, { field: "title", keys: ["title", "text", "content"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }, { field: "value", keys: ["value"], kind: "expr" }, { field: "badge", keys: ["badge"], kind: "expr" }, { field: "badgeVariant", keys: ["badgeVariant", "badge-variant"], kind: "string" }], children: { kind: "any", required: false }, events: ["onClick"] },
  "button": { allowsBind: false, requiredBind: false, slots: [{ field: "label", keys: ["label", "text", "title", "content"], kind: "expr" }, { field: "variant", keys: ["variant"], kind: "string" }, { field: "size", keys: ["size"], kind: "string" }, { field: "disabled", keys: ["disabled"], kind: "expr" }, { field: "buttonType", keys: ["buttonType", "button-type", "type"], kind: "string" }], children: { kind: "any", required: false }, events: ["onClick"] },
  "progress": { allowsBind: true, requiredBind: false, slots: [{ field: "value", keys: ["value"], kind: "expr" }, { field: "label", keys: ["label", "title"], kind: "expr" }, { field: "hint", keys: ["hint", "description"], kind: "expr" }], events: [] },
  "workflow-strip": { allowsBind: false, requiredBind: false, slots: [{ field: "title", keys: ["title"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }], children: { kind: "only", required: true, types: ["workflow-step"] }, events: [] },
  "workflow-step": { allowsBind: false, requiredBind: false, slots: [{ field: "label", keys: ["label", "title"], kind: "expr", required: true }, { field: "description", keys: ["description"], kind: "expr" }, { field: "status", keys: ["status"], kind: "expr" }, { field: "icon", keys: ["icon"], kind: "string" }], events: [] },
  "empty-state": { allowsBind: false, requiredBind: false, slots: [{ field: "icon", keys: ["icon"], kind: "string" }, { field: "title", keys: ["title", "text", "content"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }], children: { kind: "any", required: false }, events: [] },
  "badge": { allowsBind: false, requiredBind: false, slots: [{ field: "content", keys: ["content", "text", "label", "value"], kind: "expr" }, { field: "variant", keys: ["variant"], kind: "string" }, { field: "dot", keys: ["dot"], kind: "boolean" }, { field: "dotColor", keys: ["dotColor", "dot-color"], kind: "string" }], events: [] },
  "avatar": { allowsBind: false, requiredBind: false, slots: [{ field: "src", keys: ["src"], kind: "expr" }, { field: "alt", keys: ["alt"], kind: "expr" }, { field: "fallback", keys: ["fallback", "text", "label"], kind: "expr" }, { field: "size", keys: ["size"], kind: "string" }], events: [] },
  "kbd": { allowsBind: false, requiredBind: false, slots: [{ field: "content", keys: ["content", "text", "label"], kind: "expr" }], events: [] },
  "spinner": { allowsBind: false, requiredBind: false, slots: [{ field: "label", keys: ["label"], kind: "expr" }, { field: "size", keys: ["size"], kind: "string" }], events: [] },
  "separator": { allowsBind: false, requiredBind: false, slots: [{ field: "orientation", keys: ["orientation"], kind: "string" }], events: [] },
  "tabs": { allowsBind: false, requiredBind: false, slots: [], children: { kind: "only", required: true, types: ["tab-panel"] }, events: [] },
  "tab-panel": { allowsBind: false, requiredBind: false, slots: [{ field: "label", keys: ["label", "title"], kind: "expr" }], extraFields: [{ field: "title", keys: ["title", "label"], kind: "expr" }], children: { kind: "any", required: true }, events: [] },
  "accordion": { allowsBind: false, requiredBind: false, slots: [{ field: "mode", keys: ["mode"], kind: "string" }], children: { kind: "only", required: true, types: ["accordion-item"] }, events: [] },
  "accordion-item": { allowsBind: false, requiredBind: false, slots: [{ field: "title", keys: ["title", "label", "text"], kind: "expr" }, { field: "defaultOpen", keys: ["defaultOpen", "default-open"], kind: "boolean" }], children: { kind: "any", required: true }, events: [] },
  "grid": { allowsBind: false, requiredBind: false, slots: [{ field: "columns", keys: ["columns"], kind: "number" }], children: { kind: "any", required: true }, events: [] },
  "aspect-ratio": { allowsBind: false, requiredBind: false, slots: [{ field: "ratio", keys: ["ratio"], kind: "number" }], children: { kind: "any", required: true }, events: [] },
  "spacer": { allowsBind: false, requiredBind: false, slots: [{ field: "height", keys: ["height"], kind: "number" }], events: [] },
  "split-pane": { allowsBind: false, requiredBind: false, slots: [{ field: "direction", keys: ["direction"], kind: "string" }, { field: "sizes", keys: ["sizes"], kind: "number-array" }], children: { kind: "any", required: true }, events: [] },
  "for-each": { allowsBind: true, requiredBind: true, slots: [{ field: "emptyText", keys: ["emptyText", "empty-text"], kind: "string" }], children: { kind: "any", required: true }, events: [] },
  "condition": { allowsBind: false, requiredBind: false, slots: [], children: { kind: "only", required: true, types: ["case", "else"] }, events: [] },
  "case": { allowsBind: false, requiredBind: false, slots: [{ field: "when", keys: ["when"], kind: "expr", required: true, default: "false-expr-or-bind" }], children: { kind: "any", required: true }, events: [] },
  "else": { allowsBind: false, requiredBind: false, slots: [], children: { kind: "any", required: true }, events: [] },
  "slot": { allowsBind: true, requiredBind: false, slots: [{ field: "name", keys: ["name", "ref"], kind: "string" }], children: { kind: "any", required: false }, events: [] },
  "use": { allowsBind: false, requiredBind: false, slots: [{ field: "name", keys: ["name", "ref", "def"], kind: "string", required: true }, { field: "overrides", keys: ["overrides", "params"], kind: "record" }], children: { kind: "any", required: false }, events: [] },
  "tooltip": { allowsBind: false, requiredBind: false, slots: [{ field: "content", keys: ["content", "text", "label"], kind: "expr", required: true }, { field: "side", keys: ["side"], kind: "string" }], children: { kind: "any", required: true }, events: [] },
  "popover": { allowsBind: false, requiredBind: false, slots: [{ field: "trigger", keys: ["trigger"], kind: "node-list", required: true }, { field: "title", keys: ["title"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }, { field: "side", keys: ["side"], kind: "string" }, { field: "align", keys: ["align"], kind: "string" }], children: { kind: "any", required: true }, events: [] },
  "hover-card": { allowsBind: false, requiredBind: false, slots: [{ field: "trigger", keys: ["trigger"], kind: "node-list", required: true }, { field: "side", keys: ["side"], kind: "string" }, { field: "align", keys: ["align"], kind: "string" }], children: { kind: "any", required: true }, events: [] },
  "dialog": { allowsBind: false, requiredBind: false, slots: [{ field: "dialogId", keys: ["dialogId", "dialog-id", "id", "name"], kind: "string", required: true }, { field: "title", keys: ["title"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }], children: { kind: "any", required: true }, events: ["onOpenChange"] },
  "table": { allowsBind: true, requiredBind: true, slots: [{ field: "columns", keys: ["columns"], kind: "table-columns" }, { field: "filters", keys: ["filters"], kind: "table-filters" }, { field: "pageSize", keys: ["pageSize", "page-size"], kind: "number" }, { field: "defaultSort", keys: ["defaultSort", "default-sort"], kind: "table-sort" }, { field: "emptyState", keys: ["emptyState", "empty-state"], kind: "string" }], events: ["onRowClick"] },
  "tree": { allowsBind: true, requiredBind: false, slots: [{ field: "idKey", keys: ["idKey", "id-key"], kind: "string" }, { field: "parentIdKey", keys: ["parentIdKey", "parent-id-key", "parent-key", "parentKey"], kind: "string" }, { field: "labelKey", keys: ["labelKey", "label-key"], kind: "string" }, { field: "defaultExpanded", keys: ["defaultExpanded", "default-expanded"], kind: "boolean-or-number" }], children: { kind: "any", required: false }, events: ["onNodeClick"] },
  "metric": { allowsBind: true, requiredBind: true, slots: [{ field: "label", keys: ["label", "title"], kind: "expr" }, { field: "value", keys: ["value"], kind: "expr" }, { field: "valueKey", keys: ["valueKey", "value-key"], kind: "string" }], events: [] },
  "chart": { allowsBind: true, requiredBind: false, slots: [{ field: "title", keys: ["title"], kind: "expr" }, { field: "chartType", keys: ["chartType", "chart-type", "variant"], kind: "string" }, { field: "categoryKey", keys: ["categoryKey", "category-key", "x-key", "xKey"], kind: "string" }, { field: "series", keys: ["series"], kind: "unknown-array" }], events: [] },
  "markdown": { allowsBind: true, requiredBind: false, slots: [{ field: "content", keys: ["content"], kind: "expr" }], events: [] },
  "stat-group": { allowsBind: false, requiredBind: false, slots: [{ field: "gap", keys: ["gap"], kind: "number" }], children: { kind: "any", required: true }, events: [] },
  "heading": { allowsBind: false, requiredBind: false, slots: [{ field: "text", keys: ["text", "title", "content"], kind: "expr" }, { field: "level", keys: ["level"], kind: "number" }], events: [] },
  "divider": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "alert": { allowsBind: false, requiredBind: false, slots: [{ field: "variant", keys: ["variant"], kind: "string" }, { field: "message", keys: ["message", "text"], kind: "expr", required: true, default: "empty-expr" }], events: [] },
  "form": { allowsBind: false, requiredBind: false, slots: [{ field: "title", keys: ["title"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }], children: { kind: "any", required: true }, events: ["onSubmit"] },
  "button-group": { allowsBind: false, requiredBind: false, slots: [{ field: "orientation", keys: ["orientation"], kind: "string" }], children: { kind: "any", required: true }, events: [] },
  "breadcrumb": { allowsBind: false, requiredBind: false, slots: [], children: { kind: "only", required: true, types: ["breadcrumb-item"] }, events: [] },
  "breadcrumb-item": { allowsBind: false, requiredBind: false, slots: [{ field: "label", keys: ["label", "text", "title"], kind: "expr", required: true }, { field: "href", keys: ["href"], kind: "expr" }, { field: "current", keys: ["current"], kind: "boolean" }], events: ["onClick"] },
  "input": { allowsBind: false, requiredBind: false, slots: [{ field: "name", keys: ["name", "state-key", "stateKey", "key"], kind: "string", required: true }, { field: "defaultValue", keys: ["defaultValue", "default-value"], kind: "expr" }, { field: "label", keys: ["label"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }, { field: "placeholder", keys: ["placeholder"], kind: "string" }, { field: "inputType", keys: ["inputType", "input-type", "type"], kind: "string" }, { field: "prefix", keys: ["prefix"], kind: "string" }, { field: "suffix", keys: ["suffix"], kind: "string" }], events: ["onChange"] },
  "textarea": { allowsBind: false, requiredBind: false, slots: [{ field: "name", keys: ["name", "state-key", "stateKey", "key"], kind: "string", required: true }, { field: "defaultValue", keys: ["defaultValue", "default-value"], kind: "expr" }, { field: "label", keys: ["label"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }, { field: "placeholder", keys: ["placeholder"], kind: "string" }], events: ["onChange"] },
  "checkbox": { allowsBind: false, requiredBind: false, slots: [{ field: "name", keys: ["name", "state-key", "stateKey", "key"], kind: "string", required: true }, { field: "defaultValue", keys: ["defaultValue", "default-value"], kind: "expr" }, { field: "label", keys: ["label", "text", "title"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }], events: ["onChange"] },
  "switch": { allowsBind: false, requiredBind: false, slots: [{ field: "name", keys: ["name", "state-key", "stateKey", "key"], kind: "string", required: true }, { field: "defaultValue", keys: ["defaultValue", "default-value"], kind: "expr" }, { field: "label", keys: ["label", "text", "title"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }], events: ["onChange"] },
  "select": { allowsBind: false, requiredBind: false, slots: [{ field: "name", keys: ["name", "state-key", "stateKey", "key"], kind: "string", required: true }, { field: "defaultValue", keys: ["defaultValue", "default-value"], kind: "expr" }, { field: "label", keys: ["label"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }, { field: "placeholder", keys: ["placeholder"], kind: "string" }, { field: "options", keys: ["options"], kind: "select-options" }], children: { kind: "only", required: false, types: ["select-option"] }, events: ["onChange"] },
  "select-option": { allowsBind: false, requiredBind: false, slots: [{ field: "value", keys: ["value", "key"], kind: "string", required: true }, { field: "label", keys: ["label", "text"], kind: "expr" }], extraFields: [{ field: "label", keys: ["label", "text", "value"], kind: "expr" }], events: [] },
  "radio-group": { allowsBind: false, requiredBind: false, slots: [{ field: "name", keys: ["name", "state-key", "stateKey", "key"], kind: "string", required: true }, { field: "defaultValue", keys: ["defaultValue", "default-value"], kind: "expr" }, { field: "label", keys: ["label"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }, { field: "options", keys: ["options"], kind: "select-options" }], children: { kind: "only", required: false, types: ["radio-option"] }, events: ["onChange"] },
  "radio-option": { allowsBind: false, requiredBind: false, slots: [{ field: "value", keys: ["value", "key"], kind: "string", required: true }, { field: "label", keys: ["label", "text"], kind: "expr" }], extraFields: [{ field: "label", keys: ["label", "text", "value"], kind: "expr" }], events: [] },
  "slider": { allowsBind: false, requiredBind: false, slots: [{ field: "name", keys: ["name", "state-key", "stateKey", "key"], kind: "string", required: true }, { field: "defaultValue", keys: ["defaultValue", "default-value"], kind: "expr" }, { field: "label", keys: ["label"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }, { field: "min", keys: ["min"], kind: "number" }, { field: "max", keys: ["max"], kind: "number" }, { field: "step", keys: ["step"], kind: "number" }], events: ["onChange"] },
  "toggle-group": { allowsBind: false, requiredBind: false, slots: [{ field: "name", keys: ["name", "state-key", "stateKey", "key"], kind: "string", required: true }, { field: "defaultValue", keys: ["defaultValue", "default-value"], kind: "expr" }, { field: "mode", keys: ["mode"], kind: "string" }, { field: "variant", keys: ["variant"], kind: "string" }, { field: "options", keys: ["options"], kind: "unknown-array" }], events: ["onChange"] },
  "skeleton": { allowsBind: false, requiredBind: false, slots: [{ field: "lines", keys: ["lines"], kind: "number" }], events: [] },
  "raw-html": { allowsBind: false, requiredBind: false, slots: [{ field: "content", keys: ["content", "html"], kind: "expr", required: true }], events: [] },
  "raw-css": { allowsBind: false, requiredBind: false, slots: [{ field: "content", keys: ["content", "css"], kind: "expr", required: true }], events: [] },
  "raw-js": { allowsBind: false, requiredBind: false, slots: [{ field: "code", keys: ["code", "js", "content"], kind: "expr", required: true }], events: [] },
  "custom": { allowsBind: false, requiredBind: false, slots: [{ field: "componentName", keys: ["componentName", "component-name"], kind: "string", required: true }, { field: "props", keys: ["props"], kind: "record" }], children: { kind: "any", required: false }, events: [], unknownPropsKind: "json" },
  "component-ref": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "cond": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "entity-browser": { allowsBind: true, requiredBind: false, slots: [{ field: "title", keys: ["title"], kind: "expr" }], events: ["onRowClick"] },
  "action-button": { allowsBind: false, requiredBind: false, slots: [{ field: "label", keys: ["label", "text"], kind: "expr" }, { field: "variant", keys: ["variant"], kind: "string" }, { field: "actionRef", keys: ["actionRef", "action-ref", "action-name", "actionName"], kind: "string" }, { field: "entityId", keys: ["entityId", "entity-id", "entity-id-bind", "entityIdBind"], kind: "expr" }, { field: "parameters", keys: ["parameters"], kind: "record" }], events: ["onClick", "onSuccess"] },
  "create-entity-button": { allowsBind: false, requiredBind: false, slots: [{ field: "label", keys: ["label", "text"], kind: "expr" }, { field: "entityType", keys: ["entityType", "entity-type", "entity"], kind: "string", required: true }, { field: "variant", keys: ["variant"], kind: "string" }], events: ["onClick", "onSuccess"] },
  "entity-picker": { allowsBind: false, requiredBind: false, slots: [{ field: "name", keys: ["name", "state-key", "stateKey", "key"], kind: "string", required: true }, { field: "label", keys: ["label"], kind: "expr" }, { field: "description", keys: ["description"], kind: "expr" }, { field: "placeholder", keys: ["placeholder"], kind: "string" }, { field: "entityType", keys: ["entityType", "entity-type", "entity"], kind: "string" }], events: ["onChange"] },
  "query-console": { allowsBind: false, requiredBind: false, slots: [{ field: "title", keys: ["title"], kind: "expr" }], events: [] },
  "view-ref": { allowsBind: false, requiredBind: false, slots: [{ field: "name", keys: ["name", "ref"], kind: "string", required: true }, { field: "input", keys: ["input"], kind: "record" }], events: [] },
  "action-form": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "entity-table": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "entity-detail": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "entity-form": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "task-queue": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "task-detail": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "task-summary": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "task-status-editor": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "task-document-links": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "task-metadata": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "violation-list": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "violation-detail": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "violation-summary": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "violation-status-editor": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "violation-related-records": { allowsBind: false, requiredBind: false, slots: [], events: [] },
  "violation-timeline": { allowsBind: false, requiredBind: false, slots: [], events: [] },
};

const EMPTY_LIST_EXPR: ViewExpr = { kind: "literal", value: [] };
const FALSE_EXPR: ViewExpr = { kind: "literal", value: false };
const EMPTY_EXPR: ViewExpr = { kind: "literal", value: "" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getNodeProps(input: Record<string, unknown>): Record<string, unknown> {
  return isRecord(input["props"]) ? input["props"] : {};
}

function pickField(
  input: Record<string, unknown>,
  props: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  for (const key of keys) {
    if (input[key] !== undefined) return input[key];
    if (props[key] !== undefined) return props[key];
  }
  return undefined;
}

function unwrapLiteralValue(value: unknown): unknown {
  if (isRecord(value) && value["kind"] === "literal") {
    return unwrapLiteralValue(value["value"]);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => unwrapLiteralValue(entry));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, unwrapLiteralValue(entry)]),
    );
  }
  return value;
}

function pickLiteralField(
  input: Record<string, unknown>,
  props: Record<string, unknown>,
  keys: readonly string[],
): unknown {
  const value = pickField(input, props, keys);
  return value === undefined ? undefined : unwrapLiteralValue(value);
}

function isViewExpr(value: unknown): value is ViewExpr {
  if (!isRecord(value) || typeof value["kind"] !== "string") return false;
  switch (value["kind"]) {
    case "literal":
    case "var":
    case "binary":
    case "unary":
    case "conditional":
    case "pipe":
      return true;
    default:
      return false;
  }
}

function normalizeExprValue(value: unknown): ViewExpr {
  return isViewExpr(value) ? value : { kind: "literal", value: unwrapLiteralValue(value) };
}

function pickExpr(
  input: Record<string, unknown>,
  props: Record<string, unknown>,
  keys: readonly string[],
): ViewExpr | undefined {
  const value = pickField(input, props, keys);
  return value === undefined ? undefined : normalizeExprValue(value);
}

function pickString(
  input: Record<string, unknown>,
  props: Record<string, unknown>,
  keys: readonly string[],
): string | undefined {
  const value = pickLiteralField(input, props, keys);
  return typeof value === "string" ? value : undefined;
}

function pickNumber(
  input: Record<string, unknown>,
  props: Record<string, unknown>,
  keys: readonly string[],
): number | undefined {
  const value = pickLiteralField(input, props, keys);
  return typeof value === "number" ? value : undefined;
}

function pickBoolean(
  input: Record<string, unknown>,
  props: Record<string, unknown>,
  keys: readonly string[],
): boolean | undefined {
  const value = pickLiteralField(input, props, keys);
  return typeof value === "boolean" ? value : undefined;
}

function normalizeChildren(input: Record<string, unknown>): readonly ViewNode[] {
  return Array.isArray(input["children"])
    ? input["children"].map((child) => normalizeGeneratedViewNode(child))
    : [];
}

function normalizeNodeListField(
  input: Record<string, unknown>,
  props: Record<string, unknown>,
  keys: readonly string[],
): readonly ViewNode[] | undefined {
  const value = pickField(input, props, keys);
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeGeneratedViewNode(entry));
  }
  if (isRecord(value) && value["type"] !== undefined) {
    return [normalizeGeneratedViewNode(value)];
  }
  return undefined;
}

function baseNodeFields(
  input: Record<string, unknown>,
  props: Record<string, unknown>,
): ViewNodeBase & ViewStyleFields {
  return {
    ...(input["visible"] !== undefined ? { visible: normalizeExprValue(input["visible"]) } : {}),
    ...(pickNumber(input, props, ["width"]) !== undefined
      ? { width: pickNumber(input, props, ["width"]) }
      : {}),
    ...(pickNumber(input, props, ["height"]) !== undefined
      ? { height: pickNumber(input, props, ["height"]) }
      : {}),
    ...(pickNumber(input, props, ["minHeight"]) !== undefined
      ? { minHeight: pickNumber(input, props, ["minHeight"]) }
      : {}),
    ...(pickNumber(input, props, ["maxWidth"]) !== undefined
      ? { maxWidth: pickNumber(input, props, ["maxWidth"]) }
      : {}),
  };
}

function normalizeScopedEvents(
  input: unknown,
  allowedKeys: readonly string[],
): Record<string, ViewActionOrList> | undefined {
  if (!isRecord(input)) return undefined;
  const events: Record<string, ViewActionOrList> = {};
  for (const key of allowedKeys) {
    if (input[key] !== undefined) events[key] = input[key] as ViewActionOrList;
  }
  return Object.keys(events).length > 0 ? events : undefined;
}

function normalizeTableColumns(value: unknown): readonly (string | ViewTableColumn)[] | undefined {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string | ViewTableColumn =>
          typeof entry === "string" || (isRecord(entry) && typeof entry["key"] === "string"),
      )
    : undefined;
}

function normalizeTableFilters(value: unknown): readonly (string | ViewTableFilter)[] | undefined {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string | ViewTableFilter =>
          typeof entry === "string" || (isRecord(entry) && typeof entry["key"] === "string"),
      )
    : undefined;
}

function normalizeTableSort(value: unknown): ViewTableSort | undefined {
  if (!isRecord(value) || typeof value["key"] !== "string") return undefined;
  return {
    key: value["key"],
    ...(typeof value["direction"] === "string"
      ? { direction: value["direction"] as "asc" | "desc" }
      : {}),
  };
}

function normalizeChartSeries(value: unknown): readonly (string | ViewChartSeries)[] | undefined {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string | ViewChartSeries =>
          typeof entry === "string" ||
          (isRecord(entry) && typeof entry["dataKey"] === "string"),
      )
    : undefined;
}

function normalizeSelectOptions(
  value: unknown,
): readonly (string | ViewSelectOptionValue)[] | undefined {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is string | ViewSelectOptionValue =>
          typeof entry === "string" ||
          (isRecord(entry) && typeof entry["value"] === "string"),
      )
    : undefined;
}

function normalizeSlotValue(
  input: Record<string, unknown>,
  props: Record<string, unknown>,
  slot: ViewNodeNormalizationSlotSpec,
): unknown {
  const literalValue = pickLiteralField(input, props, slot.keys);
  switch (slot.kind) {
    case "expr":
      return pickExpr(input, props, slot.keys);
    case "string":
      return pickString(input, props, slot.keys);
    case "number":
      return pickNumber(input, props, slot.keys);
    case "boolean":
      return pickBoolean(input, props, slot.keys);
    case "record": {
      const value = pickField(input, props, slot.keys);
      return isRecord(value) ? value : undefined;
    }
    case "unknown-array":
      return Array.isArray(literalValue) ? literalValue : undefined;
    case "node-list":
      return normalizeNodeListField(input, props, slot.keys);
    case "number-array":
      return Array.isArray(literalValue)
        ? literalValue.filter((entry): entry is number => typeof entry === "number")
        : undefined;
    case "table-columns":
      return normalizeTableColumns(literalValue);
    case "table-filters":
      return normalizeTableFilters(literalValue);
    case "table-sort":
      return normalizeTableSort(literalValue);
    case "chart-series":
      return normalizeChartSeries(literalValue);
    case "select-options":
      return normalizeSelectOptions(literalValue);
    case "boolean-or-number":
      return typeof literalValue === "boolean" || typeof literalValue === "number"
        ? literalValue
        : undefined;
  }
}

function normalizeSlotDefault(
  input: Record<string, unknown>,
  slot: ViewNodeNormalizationSlotSpec,
): unknown {
  if (slot.default === "empty-expr") return EMPTY_EXPR;
  if (slot.default === "false-expr-or-bind") {
    return input["bind"] !== undefined ? normalizeExprValue(input["bind"]) : FALSE_EXPR;
  }
  if (slot.required && slot.kind === "string") return "";
  return undefined;
}

function normalizeSpecChildren(
  children: readonly ViewNode[],
  spec: ViewNodeNormalizationSpec,
): readonly ViewNode[] | undefined {
  if (!spec.children) return undefined;
  if (spec.children.kind === "only") {
    const allowed = spec.children.types ?? [];
    return children.filter((child) => allowed.includes(child.type));
  }
  return children;
}

function normalizeUseOverrides(
  output: Record<string, unknown>,
  props: Record<string, unknown>,
): void {
  if (output["overrides"] !== undefined) return;
  const overrides = Object.fromEntries(
    Object.entries(props).filter(
      ([key]) =>
        key !== "name" &&
        key !== "ref" &&
        key !== "def" &&
        key !== "overrides" &&
        key !== "params",
    ),
  );
  if (Object.keys(overrides).length > 0) output["overrides"] = overrides;
}

export function normalizeGeneratedViewNode(node: unknown): ViewNode {
  const input = isRecord(node) ? node : {};
  const props = getNodeProps(input);
  const rawType = String(input["type"] ?? "rows");
  const spec = ViewNodeNormalizationSpecs[rawType as ViewComponentType];
  const base = baseNodeFields(input, props);
  const children = normalizeChildren(input);

  if (!spec) {
    return { type: "rows", ...base, children } as ViewNode;
  }

  const output: Record<string, unknown> = { type: rawType, ...base };

  if (spec.allowsBind) {
    if (input["bind"] !== undefined) output["bind"] = normalizeExprValue(input["bind"]);
    else if (spec.requiredBind) output["bind"] = EMPTY_LIST_EXPR;
  }

  for (const slot of spec.slots) {
    const value = normalizeSlotValue(input, props, slot);
    if (value !== undefined) {
      output[slot.field] = value;
      continue;
    }
    const defaultValue = normalizeSlotDefault(input, slot);
    if (defaultValue !== undefined) output[slot.field] = defaultValue;
  }

  for (const slot of spec.extraFields ?? []) {
    const value = normalizeSlotValue(input, props, slot);
    if (value !== undefined) output[slot.field] = value;
  }

  const filteredChildren = normalizeSpecChildren(children, spec);
  if (filteredChildren && (spec.children?.required || filteredChildren.length > 0)) {
    output["children"] = filteredChildren;
  }

  const eventSource = isRecord(input["events"]) ? input["events"] : {};
  const events = normalizeScopedEvents(eventSource, spec.events);
  if (events) output["events"] = events;

  if (rawType === "use") normalizeUseOverrides(output, props);

  return output as unknown as ViewNode;
}
