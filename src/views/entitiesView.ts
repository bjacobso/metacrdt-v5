import type { ViewSpec } from "@metacrdt/views/runtime";
import { flattenEntityRows, type RawEntityRow } from "./entityRows";

// The Entities list as a ViewSpec, authored in the app (app content — the
// package owns the contract/runtime, not specific specs). Columns are dynamic
// per entity type, so the spec is built from the type's schema at runtime.
//
// We import from `@metacrdt/views/runtime` (effect-free) and author the spec in
// already-normalized shape rather than calling `normalizeViewSpec`, so the app
// bundle never pulls the Effect Schema IR.

/** Build the dynamic Entities ViewSpec for a type and its schema columns. */
export function buildEntitiesViewSpec(type: string, columnNames: readonly string[]): ViewSpec {
  const schemaColumns = columnNames
    .filter((name) => name !== "name")
    .slice(0, 5)
    .map((name) => ({
      key: name,
      label: name,
      ...(name === "status" ? { kind: "status" as const } : {}),
    }));

  return {
    $viewSpec: { version: "2" },
    description: `Entities of type ${type}`,
    queries: {
      entities: {
        queryRef: "entities.queryEntities",
        params: { type, pageSize: 50 },
      },
    },
    root: {
      type: "table",
      bind: { kind: "var", source: "query", path: ["entities", "page"] },
      emptyState: "No entities of this type.",
      columns: [
        { key: "name", label: "entity" },
        ...schemaColumns,
        { key: "id", label: "id", kind: "mono" },
      ],
      events: {
        onRowClick: {
          action: "navigate",
          path: { kind: "var", source: "row", path: ["id"] },
        },
      },
    },
  };
}

export { flattenEntityRows, type RawEntityRow };
