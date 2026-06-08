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

export type AttributeDefinition = {
  name: string;
  valueType: ValueType;
  cardinality: Cardinality;
  unique?: boolean;
  indexed?: boolean;
  materialized?: boolean;
  inverseAttribute?: string;
  description?: string;
};

export type EntityTypeDefinition = {
  name: string;
  attributes?: readonly string[];
  description?: string;
};

export type SchemaFact = {
  e: string;
  a: string;
  value: unknown;
};

export type FactRow = {
  a: string;
  v: unknown;
};

export type AttributeShape = {
  name: string;
  valueType: unknown;
  cardinality: unknown;
  unique: unknown;
  indexed: unknown;
  materialized: unknown;
  inverseAttribute: unknown;
  description: unknown;
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

export function attributeDefinitionFacts(def: AttributeDefinition): SchemaFact[] {
  const e = attrId(def.name);
  const facts: SchemaFact[] = [
    { e, a: "type", value: META.attributeType },
    { e, a: "name", value: def.name },
    { e, a: "valueType", value: def.valueType },
    { e, a: "cardinality", value: def.cardinality },
  ];
  if (def.unique !== undefined) facts.push({ e, a: "unique", value: def.unique });
  if (def.indexed !== undefined) {
    facts.push({ e, a: "indexed", value: def.indexed });
  }
  if (def.materialized !== undefined) {
    facts.push({ e, a: "materialized", value: def.materialized });
  }
  if (def.inverseAttribute !== undefined) {
    facts.push({ e, a: "inverseAttribute", value: def.inverseAttribute });
  }
  if (def.description !== undefined) {
    facts.push({ e, a: "description", value: def.description });
  }
  return facts;
}

export function entityTypeDefinitionFacts(def: EntityTypeDefinition): SchemaFact[] {
  const e = typeId(def.name);
  const facts: SchemaFact[] = [
    { e, a: "type", value: META.entityType },
    { e, a: "name", value: def.name },
  ];
  if (def.description !== undefined) {
    facts.push({ e, a: "description", value: def.description });
  }
  for (const attr of def.attributes ?? []) {
    facts.push({ e, a: "hasAttribute", value: attrId(attr) });
  }
  return facts;
}

export function metaAttributeFacts(meta: MetaAttribute): SchemaFact[] {
  return attributeDefinitionFacts(meta);
}

export function allMetaAttributeFacts(): SchemaFact[] {
  return META_ATTRIBUTES.flatMap((m) => metaAttributeFacts(m));
}

/** Reconstruct an attribute-definition shape from visible schema fact rows. */
export function shapeAttributeDefinition(
  name: string,
  rows: readonly FactRow[],
): AttributeShape {
  const attrs: Record<string, unknown[]> = {};
  for (const row of rows) (attrs[row.a] ??= []).push(row.v);
  const one = (k: string) => attrs[k]?.[0];
  return {
    name,
    valueType: one("valueType"),
    cardinality: one("cardinality"),
    unique: one("unique"),
    indexed: one("indexed"),
    materialized: one("materialized"),
    inverseAttribute: one("inverseAttribute"),
    description: one("description"),
  };
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
