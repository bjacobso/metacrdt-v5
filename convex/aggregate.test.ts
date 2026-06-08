/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function person(
  t: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  e: string,
  dept: string,
  salary: number,
) {
  await t.mutation(api.facts.assertFact, { e, a: "type", value: "Person" });
  await t.mutation(api.facts.assertFact, { e, a: "dept", value: dept });
  await t.mutation(api.facts.assertFact, { e, a: "salary", value: salary });
}

describe("aggregation", () => {
  test("group-by with count, sum, avg", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await person(t, "p:1", "eng", 100);
    await person(t, "p:2", "eng", 200);
    await person(t, "p:3", "sales", 50);

    const rows = await t.query(api.datalog.aggregate, {
      where: [
        ["?e", "type", "Person"],
        ["?e", "dept", "?d"],
        ["?e", "salary", "?s"],
      ],
      groupBy: ["?d"],
      aggregates: [
        { op: "count", as: "headcount" },
        { op: "sum", var: "?s", as: "payroll" },
        { op: "avg", var: "?s", as: "avgSalary" },
      ],
    });

    const byDept = Object.fromEntries(rows.map((r) => [r.d, r]));
    expect(byDept["eng"]).toMatchObject({ headcount: 2, payroll: 300, avgSalary: 150 });
    expect(byDept["sales"]).toMatchObject({ headcount: 1, payroll: 50, avgSalary: 50 });
  });

  test("no groupBy aggregates over all rows; min/max/countDistinct", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await person(t, "p:1", "eng", 100);
    await person(t, "p:2", "eng", 200);
    await person(t, "p:3", "sales", 50);

    const rows = await t.query(api.datalog.aggregate, {
      where: [
        ["?e", "type", "Person"],
        ["?e", "dept", "?d"],
        ["?e", "salary", "?s"],
      ],
      aggregates: [
        { op: "count", as: "total" },
        { op: "min", var: "?s", as: "lowest" },
        { op: "max", var: "?s", as: "highest" },
        { op: "countDistinct", var: "?d", as: "depts" },
      ],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      total: 3,
      lowest: 50,
      highest: 200,
      depts: 2,
    });
  });

  test("aggregation composes with comparison filters", async () => {
    const t = convexTest(schema, modules).withIdentity({ tokenIdentifier: "system" });
    await person(t, "p:1", "eng", 100);
    await person(t, "p:2", "eng", 200);
    await person(t, "p:3", "eng", 40);

    // Only salaries over 50 count.
    const rows = await t.query(api.datalog.aggregate, {
      where: [
        ["?e", "dept", "?d"],
        ["?e", "salary", "?s"],
        ["?s", ">", 50],
      ],
      groupBy: ["?d"],
      aggregates: [{ op: "count", as: "n" }],
    });
    expect(rows).toEqual([{ d: "eng", n: 2 }]);
  });
});
