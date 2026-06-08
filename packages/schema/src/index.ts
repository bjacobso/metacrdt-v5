// @metacrdt/schema — pure schema-as-facts conventions.
//
// This package owns the stable naming and bootstrap rules for describing schema
// as ordinary MetaCRDT facts. It deliberately does not know how a target stores
// or queries those facts; Convex, Cloudflare, local, and future targets import
// these constants/helpers and then fold their own event logs.

export type Cardinality = "one" | "many";

export type ValueType =
  | "string"
  | "number"
  | "boolean"
  | "entityRef"
  | "date"
  | "json";

export type MetaAttribute = {
  name: string;
  valueType: Exclude<ValueType, "date" | "json">;
  cardinality: Cardinality;
  description: string;
};

export const META = {
  attrPrefix: "attr:",
  typePrefix: "type:",
  /** Value of the `type` attribute on an attribute-definition entity. */
  attributeType: "Attribute",
  /** Value of the `type` attribute on an entity-type-definition entity. */
  entityType: "EntityType",
} as const;

/** Entity id for an attribute definition, e.g. "salary" -> "attr:salary". */
export function attrId(name: string): string {
  return META.attrPrefix + name;
}

/** Entity id for an entity-type definition, e.g. "Employee" -> "type:Employee". */
export function typeId(name: string): string {
  return META.typePrefix + name;
}

export function isAttrId(e: string): boolean {
  return e.startsWith(META.attrPrefix);
}

export function attrNameOf(e: string): string {
  return e.slice(META.attrPrefix.length);
}

export function isTypeId(e: string): boolean {
  return e.startsWith(META.typePrefix);
}

export function typeNameOf(e: string): string {
  return e.slice(META.typePrefix.length);
}

export function isCardinality(v: unknown): v is Cardinality {
  return v === "one" || v === "many";
}

export function isValueType(v: unknown): v is ValueType {
  return (
    v === "string" ||
    v === "number" ||
    v === "boolean" ||
    v === "entityRef" ||
    v === "date" ||
    v === "json"
  );
}

// The meta-attributes (predicates used to describe schema). Their cardinality
// is hardcoded so that asserting schema facts works before any schema exists:
// without this, looking up the cardinality of "cardinality" would recurse.
// Data attributes get cardinality from facts; anything unknown is "many".
export const BUILTIN_CARDINALITY: Record<string, Cardinality> = {
  type: "many",
  name: "one",
  valueType: "one",
  cardinality: "one",
  unique: "one",
  indexed: "one",
  materialized: "one",
  inverseAttribute: "one",
  description: "one",
  hasAttribute: "many",
  // Action-definition predicates: single-valued so redefining an action
  // supersedes rather than accumulates.
  appliesTo: "one",
  asserts: "one",
  label: "one",
  // Operational process facts mirrored from host process tables.
  "flow.run.status": "one",
};

export function builtinCardinality(a: string): Cardinality | undefined {
  return BUILTIN_CARDINALITY[a];
}

export function cardinalityOrMany(a: string): Cardinality {
  return builtinCardinality(a) ?? "many";
}

/** The meta-attributes themselves, for self-description / bootstrap. */
export const META_ATTRIBUTES: MetaAttribute[] = [
  {
    name: "type",
    valueType: "string",
    cardinality: "many",
    description: "Entity type(s) this entity belongs to.",
  },
  {
    name: "name",
    valueType: "string",
    cardinality: "one",
    description: "Human-readable name of a schema entity.",
  },
  {
    name: "valueType",
    valueType: "string",
    cardinality: "one",
    description: "Declared value type of an attribute.",
  },
  {
    name: "cardinality",
    valueType: "string",
    cardinality: "one",
    description: "one | many.",
  },
  {
    name: "unique",
    valueType: "boolean",
    cardinality: "one",
    description: "Whether values must be unique.",
  },
  {
    name: "indexed",
    valueType: "boolean",
    cardinality: "one",
    description: "Whether the attribute is indexed.",
  },
  {
    name: "materialized",
    valueType: "boolean",
    cardinality: "one",
    description: "Whether the attribute is materialized.",
  },
  {
    name: "inverseAttribute",
    valueType: "string",
    cardinality: "one",
    description: "Name of the inverse attribute.",
  },
  {
    name: "description",
    valueType: "string",
    cardinality: "one",
    description: "Free-text description.",
  },
  {
    name: "hasAttribute",
    valueType: "entityRef",
    cardinality: "many",
    description: "An attribute belonging to an entity type.",
  },
];
