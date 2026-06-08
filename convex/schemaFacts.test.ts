/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

describe("schema-as-facts: attribute definitions", () => {
  test("defineAttribute is reconstructable via getAttribute", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.attributes.defineAttribute, {
      name: "salary",
      valueType: "number",
      cardinality: "one",
      description: "Annual salary",
    });
    const def = await t.query(api.attributes.getAttribute, { name: "salary" });
    expect(def).toMatchObject({
      name: "salary",
      valueType: "number",
      cardinality: "one",
      description: "Annual salary",
    });
  });

  test("redefining updates current and records the change in history", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.attributes.defineAttribute, {
      name: "salary",
      valueType: "number",
      cardinality: "one",
    });
    await t.mutation(api.attributes.defineAttribute, {
      name: "salary",
      valueType: "string",
      cardinality: "many",
    });

    const def = await t.query(api.attributes.getAttribute, { name: "salary" });
    expect(def).toMatchObject({ valueType: "string", cardinality: "many" });

    const lifecycle = await t.query(api.attributes.attributeLifecycle, {
      name: "salary",
    });
    // The cardinality change is recorded as a retract + a fresh assert.
    expect(
      lifecycle.some((e) => e.kind === "retract" && e.attribute === "cardinality"),
    ).toBe(true);
    expect(
      lifecycle.some(
        (e) =>
          e.kind === "assert" &&
          e.attribute === "cardinality" &&
          e.value === "many",
      ),
    ).toBe(true);
  });

  test("retireAttribute removes from current but keeps history", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.attributes.defineAttribute, {
      name: "ssn",
      valueType: "string",
      cardinality: "one",
    });
    await t.mutation(api.attributes.retireAttribute, { name: "ssn" });

    expect(await t.query(api.attributes.getAttribute, { name: "ssn" })).toBeNull();

    const lifecycle = await t.query(api.attributes.attributeLifecycle, {
      name: "ssn",
    });
    expect(lifecycle.some((e) => e.kind === "retract")).toBe(true);
    expect(lifecycle.some((e) => e.kind === "assert")).toBe(true);
  });
});

describe("schema-as-facts: bitemporal reconstruction", () => {
  test("attributeAsOf at txTime=0 predates the definition", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.attributes.defineAttribute, {
      name: "tier",
      valueType: "string",
      cardinality: "one",
    });
    const before = await t.query(api.attributes.attributeAsOf, {
      name: "tier",
      txTime: 0,
      validTime: 0,
    });
    expect(before.exists).toBe(false);

    const now = await t.query(api.attributes.attributeAsOf, { name: "tier" });
    expect(now).toMatchObject({ exists: true, valueType: "string" });
  });
});

describe("schema-as-facts: entity types", () => {
  test("defineType declares a shape queryable via typeSchemaAsOf", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.attributes.defineAttribute, {
      name: "salary",
      valueType: "number",
      cardinality: "one",
    });
    await t.mutation(api.attributes.defineType, {
      name: "Employee",
      attributes: ["salary", "title"],
    });
    const shape = await t.query(api.attributes.typeSchemaAsOf, {
      type: "Employee",
    });
    expect(shape.attributes.sort()).toEqual(["salary", "title"]);
    expect(shape.columns.find((c) => c.name === "salary")).toMatchObject({
      name: "salary",
      valueType: "number",
      cardinality: "one",
      declared: true,
    });
    expect(shape.columns.find((c) => c.name === "title")).toMatchObject({
      name: "title",
      declared: false,
    });
  });

  test("bootstrapSchema makes meta-attributes self-describing", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.attributes.bootstrapSchema, {});
    const cardinality = await t.query(api.attributes.getAttribute, {
      name: "cardinality",
    });
    expect(cardinality).toMatchObject({ valueType: "string", cardinality: "one" });
    // The meta-attributes show up as definitions.
    const all = await t.query(api.attributes.listAttributes, {});
    expect(all.map((a) => a.name)).toContain("hasAttribute");
  });
});
