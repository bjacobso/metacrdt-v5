// Schema-as-facts conventions. The schema (attribute definitions, entity-type
// definitions, type→attribute membership) is modeled as ordinary bitemporal
// triples in the same store as the data — so it inherits history, tombstoning,
// and as-of queries for free. This module holds the naming conventions and the
// bootstrap that breaks the chicken-and-egg of "cardinality is itself an
// attribute".

export const META = {
  attrPrefix: "attr:",
  typePrefix: "type:",
  /** Value of the `type` attribute on an attribute-definition entity. */
  attributeType: "Attribute",
  /** Value of the `type` attribute on an entity-type-definition entity. */
  entityType: "EntityType",
} as const;

/** Entity id for an attribute definition, e.g. "salary" → "attr:salary". */
export function attrId(name: string): string {
  return META.attrPrefix + name;
}

/** Entity id for an entity-type definition, e.g. "Employee" → "type:Employee". */
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

// The meta-attributes (predicates used to describe schema). Their cardinality
// is hardcoded so that asserting schema facts works before any schema exists —
// without this, looking up the cardinality of "cardinality" would recurse.
// Data attributes get their cardinality from facts; anything unknown is "many".
export const BUILTIN_CARDINALITY: Record<string, "one" | "many"> = {
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
  // Action-definition predicates (schema-as-facts in convex/actions.ts) — single
  // valued so redefining an action (e.g. on an applyConfig rerun) supersedes
  // rather than accumulates.
  appliesTo: "one",
  asserts: "one",
  label: "one",
};

/** The meta-attributes themselves, for self-description / bootstrap. */
export const META_ATTRIBUTES: Array<{
  name: string;
  valueType: "string" | "number" | "boolean" | "entityRef";
  cardinality: "one" | "many";
  description: string;
}> = [
  { name: "type", valueType: "string", cardinality: "many", description: "Entity type(s) this entity belongs to." },
  { name: "name", valueType: "string", cardinality: "one", description: "Human-readable name of a schema entity." },
  { name: "valueType", valueType: "string", cardinality: "one", description: "Declared value type of an attribute." },
  { name: "cardinality", valueType: "string", cardinality: "one", description: "one | many." },
  { name: "unique", valueType: "boolean", cardinality: "one", description: "Whether values must be unique." },
  { name: "indexed", valueType: "boolean", cardinality: "one", description: "Whether the attribute is indexed." },
  { name: "materialized", valueType: "boolean", cardinality: "one", description: "Whether the attribute is materialized." },
  { name: "inverseAttribute", valueType: "string", cardinality: "one", description: "Name of the inverse attribute." },
  { name: "description", valueType: "string", cardinality: "one", description: "Free-text description." },
  { name: "hasAttribute", valueType: "entityRef", cardinality: "many", description: "An attribute belonging to an entity type." },
];
