import { describe, expect, test } from "vitest";
import {
  BUILTIN_CARDINALITY,
  META,
  META_ATTRIBUTES,
  allMetaAttributeFacts,
  attributeDefinitionFacts,
  attrId,
  attrNameOf,
  builtinCardinality,
  cardinalityOrMany,
  entityTypeDefinitionFacts,
  isAttrId,
  isCardinality,
  isTypeId,
  isValueType,
  shapeAttributeDefinition,
  typeId,
  typeNameOf,
} from "./index";

describe("@metacrdt/schema identifiers", () => {
  test("constructs and parses schema carrier ids", () => {
    expect(META.attrPrefix).toBe("attr:");
    expect(META.typePrefix).toBe("type:");
    expect(attrId("salary")).toBe("attr:salary");
    expect(typeId("Worker")).toBe("type:Worker");
    expect(isAttrId("attr:salary")).toBe(true);
    expect(isAttrId("type:Worker")).toBe(false);
    expect(isTypeId("type:Worker")).toBe(true);
    expect(isTypeId("attr:salary")).toBe(false);
    expect(attrNameOf("attr:salary")).toBe("salary");
    expect(typeNameOf("type:Worker")).toBe("Worker");
  });
});

describe("@metacrdt/schema bootstrap facts", () => {
  test("keeps bootstrap cardinality finite and explicit", () => {
    expect(BUILTIN_CARDINALITY.cardinality).toBe("one");
    expect(BUILTIN_CARDINALITY.hasAttribute).toBe("many");
    expect(BUILTIN_CARDINALITY.appliesTo).toBe("one");
    expect(BUILTIN_CARDINALITY["flow.run.status"]).toBe("one");
    expect(builtinCardinality("missing")).toBeUndefined();
    expect(cardinalityOrMany("missing")).toBe("many");
  });

  test("self-describes every bootstrap predicate", () => {
    const names = META_ATTRIBUTES.map((m) => m.name);
    for (const name of Object.keys(BUILTIN_CARDINALITY)) {
      if (name.startsWith("flow.") || ["appliesTo", "asserts", "label"].includes(name)) {
        continue;
      }
      expect(names).toContain(name);
    }
    expect(META_ATTRIBUTES.find((m) => m.name === "hasAttribute")).toMatchObject({
      valueType: "entityRef",
      cardinality: "many",
    });
  });
});

describe("@metacrdt/schema validators", () => {
  test("recognizes value types and cardinalities", () => {
    expect(isCardinality("one")).toBe(true);
    expect(isCardinality("many")).toBe(true);
    expect(isCardinality("single")).toBe(false);
    expect(isValueType("entityRef")).toBe(true);
    expect(isValueType("date")).toBe(true);
    expect(isValueType("json")).toBe(true);
    expect(isValueType("object")).toBe(false);
  });
});

describe("@metacrdt/schema fact lowering", () => {
  test("lowers an attribute definition to canonical schema facts", () => {
    expect(
      attributeDefinitionFacts({
        name: "worker.status",
        valueType: "string",
        cardinality: "one",
        unique: false,
        indexed: true,
        materialized: true,
        inverseAttribute: "worker.statusOf",
        description: "Worker employment status.",
      }),
    ).toEqual([
      { e: "attr:worker.status", a: "type", value: "Attribute" },
      { e: "attr:worker.status", a: "name", value: "worker.status" },
      { e: "attr:worker.status", a: "valueType", value: "string" },
      { e: "attr:worker.status", a: "cardinality", value: "one" },
      { e: "attr:worker.status", a: "unique", value: false },
      { e: "attr:worker.status", a: "indexed", value: true },
      { e: "attr:worker.status", a: "materialized", value: true },
      {
        e: "attr:worker.status",
        a: "inverseAttribute",
        value: "worker.statusOf",
      },
      {
        e: "attr:worker.status",
        a: "description",
        value: "Worker employment status.",
      },
    ]);
  });

  test("lowers an entity type definition to canonical schema facts", () => {
    expect(
      entityTypeDefinitionFacts({
        name: "Worker",
        attributes: ["worker.status", "name"],
        description: "A worker.",
      }),
    ).toEqual([
      { e: "type:Worker", a: "type", value: "EntityType" },
      { e: "type:Worker", a: "name", value: "Worker" },
      { e: "type:Worker", a: "description", value: "A worker." },
      { e: "type:Worker", a: "hasAttribute", value: "attr:worker.status" },
      { e: "type:Worker", a: "hasAttribute", value: "attr:name" },
    ]);
  });

  test("lowers the meta-schema bootstrap through the same attribute lowering", () => {
    const facts = allMetaAttributeFacts();
    expect(facts).toContainEqual({
      e: "attr:cardinality",
      a: "cardinality",
      value: "one",
    });
    expect(facts).toContainEqual({
      e: "attr:hasAttribute",
      a: "valueType",
      value: "entityRef",
    });
  });
});

describe("@metacrdt/schema read-model shaping", () => {
  test("reconstructs the attribute definition shape from visible rows", () => {
    expect(
      shapeAttributeDefinition("worker.status", [
        { a: "type", v: "Attribute" },
        { a: "valueType", v: "string" },
        { a: "cardinality", v: "one" },
        { a: "indexed", v: true },
      ]),
    ).toEqual({
      name: "worker.status",
      valueType: "string",
      cardinality: "one",
      unique: undefined,
      indexed: true,
      materialized: undefined,
      inverseAttribute: undefined,
      description: undefined,
    });
  });
});
