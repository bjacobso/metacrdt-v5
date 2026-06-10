import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  evaluateViewExpression,
  evaluateViewValue,
  formatViewSpecIssues,
  initializeViewState,
  normalizeViewSpec,
  validateViewSpecStructure,
  type ViewExpressionContext,
  type ViewNode,
  type ViewSpec,
} from "../src/index.js";

// Phase 2 of specs/plans/views.md — the raw-JSON model proof.
//
// Proves the @metacrdt/views runtime carries a real surface (a generic
// "Entities of type X" list) headlessly: no React, no query execution, no
// ontology coupling. The ViewSpec is authored as raw JSON; the runtime only
// normalizes/validates it and evaluates its expressions against a scope the
// *host* provides. Views never runs a query — it reads resolved data out of
// `ctx.query`, which is exactly the edge/binding-layer boundary.

const fixturePath = fileURLToPath(new URL("./fixtures/entities-view.json", import.meta.url));
const rawSpec: unknown = JSON.parse(readFileSync(fixturePath, "utf8"));

function findNode(node: ViewNode, type: string): ViewNode | undefined {
  if (node.type === type) return node;
  const children = (node as { children?: readonly ViewNode[] }).children ?? [];
  for (const child of children) {
    const found = findNode(child, type);
    if (found) return found;
  }
  return undefined;
}

// A flattened entity row, as the edge/binding layer would hand the view after
// resolving the `entities` query binding (one value per attribute).
interface EntityRow extends Record<string, unknown> {
  readonly id: string;
  readonly name: string;
  readonly status: string;
}

const personRows: readonly EntityRow[] = [
  { id: "person/ada", name: "Ada Lovelace", status: "active" },
  { id: "person/alan", name: "Alan Turing", status: "archived" },
];

function contextWith(rows: readonly EntityRow[]): ViewExpressionContext {
  return {
    state: initializeViewState(spec.state),
    input: { type: "person" },
    query: { entities: { page: rows } },
  };
}

const spec: ViewSpec = normalizeViewSpec(rawSpec);

describe("Entities ViewSpec — raw-JSON model proof", () => {
  it("normalizes into a versioned envelope with the authored shape", () => {
    expect(spec.$viewSpec).toEqual({ version: "2" });
    expect(spec.queries?.["entities"]).toMatchObject({ queryRef: "entities.queryEntities" });
    expect(spec.state?.["selectedId"]).toMatchObject({ kind: "string", initial: "" });
    expect(spec.root.type).toBe("rows");
  });

  it("passes structural validation with no errors", () => {
    const result = validateViewSpecStructure(spec);
    if (!result.valid) {
      throw new Error(`unexpected issues:\n${formatViewSpecIssues(result.issues)}`);
    }
    expect(result.valid).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("initializes view-local state deterministically", () => {
    expect(initializeViewState(spec.state)).toEqual({ selectedId: "" });
  });

  it("evaluates the heading text expression against input", () => {
    const heading = findNode(spec.root, "heading");
    expect(heading).toBeDefined();
    const text = evaluateViewExpression(
      (heading as { text?: unknown }).text,
      contextWith(personRows),
    );
    expect(text).toBe("Entities · person");
  });

  it("resolves the table bind from host-provided query data (does not run a query)", () => {
    const table = findNode(spec.root, "table");
    expect(table).toBeDefined();
    const bind = (table as { bind?: unknown }).bind;

    // With data in scope, the bind resolves to those rows verbatim.
    const rows = evaluateViewExpression(bind, contextWith(personRows));
    expect(rows).toEqual(personRows);

    // With nothing resolved into scope, the view yields no rows — proving views
    // never executes anything; it only reads what the edge placed in ctx.query.
    const empty = evaluateViewExpression(bind, {
      state: {},
      input: { type: "person" },
      query: {},
    });
    expect(empty).toBeNull();
  });

  it("drives the declared columns as a projection over the resolved rows", () => {
    const table = findNode(spec.root, "table") as {
      bind?: unknown;
      columns?: readonly (string | { key: string; label?: string })[];
    };
    const rows = evaluateViewValue(table.bind, contextWith(personRows)) as EntityRow[];
    const columns = (table.columns ?? []).map((col) => (typeof col === "string" ? col : col.key));

    expect(columns).toEqual(["id", "name", "status"]);

    // The renderer's job, simulated: select each declared column key per row.
    const projected = rows.map((row) =>
      Object.fromEntries(columns.map((key) => [key, row[key]])),
    );
    expect(projected).toEqual([
      { id: "person/ada", name: "Ada Lovelace", status: "active" },
      { id: "person/alan", name: "Alan Turing", status: "archived" },
    ]);
  });

  it("can derive a selected entity from live query rows by id", () => {
    const selectedNameExpr = {
      kind: "pipe",
      name: "path",
      value: {
        kind: "pipe",
        name: "findBy",
        value: { kind: "var", source: "query", path: ["entities", "page"] },
        args: [
          { kind: "literal", value: "id" },
          { kind: "var", source: "state", path: ["selectedId"] },
        ],
      },
      args: [{ kind: "literal", value: "name" }],
    };

    expect(
      evaluateViewExpression(selectedNameExpr, {
        ...contextWith(personRows),
        state: { selectedId: "person/alan" },
      }),
    ).toBe("Alan Turing");
  });

  it("supports an empty-state decision via a length expression", () => {
    const table = findNode(spec.root, "table") as { bind?: unknown; emptyState?: string };

    const isEmpty = (rows: readonly EntityRow[]): boolean => {
      const resolved = evaluateViewExpression(table.bind, contextWith(rows));
      return (Array.isArray(resolved) ? resolved.length : 0) === 0;
    };

    expect(isEmpty(personRows)).toBe(false);
    expect(isEmpty([])).toBe(true);
    expect(table.emptyState).toBe("No entities of this type yet.");
  });
});
