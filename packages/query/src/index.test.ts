import { describe, expect, test } from "vitest";
import {
  aggregateBindings,
  applyCompute,
  bindingKey,
  chooseNextClausePosition,
  dedupeProvenancedBindings,
  derivedRowsFromBindings,
  describeClauses,
  dynamicSelectivity,
  isEntityLocalRule,
  paginateRows,
  parseClause,
  parseClauses,
  patternInputForBinding,
  project,
  requiredVars,
  resolveEmitTerm,
  satisfiesCompare,
  unifyPattern,
  valueKey,
} from "./index";

describe("@metacrdt/query clause parsing", () => {
  test("classifies pattern, compare, compute, not, and or clauses", () => {
    expect(
      describeClauses([
        ["?e", "type", "Worker"],
        ["?salary", ">", 100],
        { compute: ["+", "?salary", 10], as: "?total" },
        { not: ["?e", "worker.status", "terminated"] },
        {
          or: [
            [["?e", "worker.status", "active"]],
            [["?e", "worker.status", "pending"]],
          ],
        },
      ]),
    ).toEqual([
      { kind: "pattern", e: "?e", a: "\"type\"", v: "\"Worker\"" },
      { kind: "compare", left: "?salary", op: ">", right: "100" },
      { kind: "compute", op: "+", args: ["?salary", "10"], as: "?total" },
      {
        kind: "not",
        e: "?e",
        a: "\"worker.status\"",
        v: "\"terminated\"",
      },
      {
        kind: "or",
        branches: [
          [{ kind: "pattern", e: "?e", a: "\"worker.status\"", v: "\"active\"" }],
          [{ kind: "pattern", e: "?e", a: "\"worker.status\"", v: "\"pending\"" }],
        ],
      },
    ]);
  });

  test("rejects nested disjunction and excessive clauses", () => {
    expect(() =>
      parseClause({ or: [[{ or: [[["?e", "a", "b"]]] }]] }),
    ).toThrow(/nested or/);
    expect(() =>
      parseClauses(Array.from({ length: 17 }, () => ["?e", "a", "?v"])),
    ).toThrow(/maxClauses/);
  });
});

describe("@metacrdt/query term and filter helpers", () => {
  test("reports required vars and selectivity", () => {
    const compare = parseClause(["?salary", ">", "?floor"]);
    expect(requiredVars(compare)).toEqual(["salary", "floor"]);

    const pattern = parseClause(["?e", "worker.status", "?status"]);
    expect(pattern.kind).toBe("pattern");
    if (pattern.kind === "pattern") {
      expect(dynamicSelectivity(pattern, new Set(["e"]))).toBe(6);
    }
  });

  test("unifies patterns against triples with typed value equality", () => {
    const pattern = parseClause(["?e", "n", "?v"]);
    expect(pattern.kind).toBe("pattern");
    if (pattern.kind !== "pattern") return;

    expect(unifyPattern(pattern, {}, { e: "x", a: "n", v: 1 })).toEqual({
      e: "x",
      v: 1,
    });
    expect(unifyPattern(pattern, { v: "1" }, { e: "x", a: "n", v: 1 })).toBeNull();
  });

  test("builds pattern inputs from constants and bound variables", () => {
    const pattern = parseClause(["?e", "worker.status", "?status"]);
    expect(pattern.kind).toBe("pattern");
    if (pattern.kind !== "pattern") return;

    expect(patternInputForBinding(pattern, { e: "worker:maria" })).toEqual({
      eConst: "worker:maria",
      aConst: "worker.status",
      vConst: undefined,
      vIsConst: false,
    });

    expect(
      patternInputForBinding(pattern, {
        e: "worker:maria",
        status: "active",
      }),
    ).toEqual({
      eConst: "worker:maria",
      aConst: "worker.status",
      vConst: "active",
      vIsConst: true,
    });
  });

  test("compares and computes against existing bindings", () => {
    const compare = parseClause(["?salary", ">=", 100]);
    expect(compare.kind).toBe("compare");
    if (compare.kind === "compare") {
      expect(satisfiesCompare(compare, { salary: 100 })).toBe(true);
    }

    const compute = parseClause({ compute: ["lower", "?name"], as: "?lower" });
    expect(compute.kind).toBe("compute");
    if (compute.kind === "compute") {
      expect(applyCompute(compute, { name: "MARIA" })).toEqual({
        name: "MARIA",
        lower: "maria",
      });
    }
  });

  test("chooses the next runnable clause deterministically", () => {
    const clauses = parseClauses([
      ["?e", "type", "Worker"],
      ["?e", "worker.status", "active"],
      ["?salary", ">", 100],
      { compute: ["lower", "?name"], as: "?lower" },
    ]);

    // With no variables bound, choose the most selective pattern first. Attribute
    // constants dominate the score, then entity/value knowledge.
    expect(chooseNextClausePosition(clauses, [0, 1, 2, 3], new Set())).toBe(0);

    // Once `salary` is bound, comparison can run before later patterns because
    // it is now a pure filter and can prune the row set.
    expect(
      chooseNextClausePosition(clauses, [1, 2, 3], new Set(["e", "salary"])),
    ).toBe(1);

    // Compute clauses follow the same rule: run as soon as their inputs exist.
    expect(
      chooseNextClausePosition(clauses, [1, 3], new Set(["e", "name"])),
    ).toBe(1);

    expect(() =>
      chooseNextClausePosition([parseClause(["?salary", ">", 100])], [0], new Set()),
    ).toThrow(/query is unsafe/);
  });
});

describe("@metacrdt/query rows", () => {
  test("projects with dedupe and typed keys", () => {
    expect(valueKey("1")).not.toBe(valueKey(1));
    expect(
      project(
        [
          { e: "w:1", status: "active" },
          { e: "w:1", status: "active" },
          { e: "w:2", status: "pending" },
        ],
        ["?e"],
      ),
    ).toEqual([{ e: "w:1" }, { e: "w:2" }]);
  });

  test("dedupes provenanced bindings and merges source ids", () => {
    expect(bindingKey({ b: 2, a: "1" })).toBe(bindingKey({ a: "1", b: 2 }));
    expect(bindingKey({ a: "1" })).not.toBe(bindingKey({ a: 1 }));

    expect(
      dedupeProvenancedBindings([
        {
          binding: { e: "w:1", status: "active" },
          sources: ["fact:1"],
          eventSources: ["event:1"],
        },
        {
          binding: { status: "active", e: "w:1" },
          sources: ["fact:2", "fact:1"],
          eventSources: ["event:2"],
        },
        {
          binding: { e: "w:1", status: "pending" },
          sources: ["fact:3"],
        },
      ]),
    ).toEqual([
      {
        binding: { e: "w:1", status: "active" },
        sources: ["fact:1", "fact:2"],
        eventSources: ["event:1", "event:2"],
      },
      {
        binding: { e: "w:1", status: "pending" },
        sources: ["fact:3"],
      },
    ]);
  });

  test("paginates deterministic rows with bounded page size", () => {
    const rows = Array.from({ length: 105 }, (_, i) => i);
    expect(paginateRows(rows, { numItems: 200 })).toEqual({
      page: rows.slice(0, 100),
      isDone: false,
      continueCursor: "100",
    });
    expect(paginateRows(rows, { numItems: 10, cursor: "100" })).toEqual({
      page: [100, 101, 102, 103, 104],
      isDone: true,
      continueCursor: null,
    });
  });

  test("aggregates grouped bindings", () => {
    expect(
      aggregateBindings(
        [
          { dept: "Ops", worker: "a", salary: 10 },
          { dept: "Ops", worker: "b", salary: 20 },
          { dept: "Field", worker: "c", salary: 5 },
        ],
        ["?dept"],
        [
          { op: "count", as: "headcount" },
          { op: "sum", var: "?salary", as: "payroll" },
          { op: "avg", var: "?salary", as: "avgSalary" },
        ],
      ),
    ).toEqual([
      { dept: "Ops", headcount: 2, payroll: 30, avgSalary: 15 },
      { dept: "Field", headcount: 1, payroll: 5, avgSalary: 5 },
    ]);
  });

  test("resolves emit terms and shapes deterministic derived rows", () => {
    expect(resolveEmitTerm("?entity", { entity: "w:1" })).toBe("w:1");
    expect(resolveEmitTerm("literal", { entity: "w:1" })).toBe("literal");

    expect(
      derivedRowsFromBindings(
        [
          { entity: "w:2", region: "north" },
          { entity: "w:1", region: "south" },
          { entity: "w:1", region: "south" },
          { region: "ignored" },
        ],
        { e: "?entity", a: "derived.region", v: "?region" },
      ),
    ).toEqual([
      { e: "w:1", a: "derived.region", v: "south" },
      { e: "w:2", a: "derived.region", v: "north" },
    ]);
  });
});

describe("@metacrdt/query rule locality", () => {
  test("detects entity-local rule bodies, including safe branch subjects", () => {
    expect(
      isEntityLocalRule(
        [
          ["?e", "worker.status", "active"],
          { not: ["?e", "status", "terminated"] },
          {
            or: [
              [["?e", "role", "driver"]],
              [["?e", "role", "forklift"]],
            ],
          },
        ],
        "?e",
      ),
    ).toBe(true);

    expect(
      isEntityLocalRule(
        [
          ["?placement", "worker", "?e"],
          ["?placement", "client", "?client"],
        ],
        "?e",
      ),
    ).toBe(false);
  });
});
