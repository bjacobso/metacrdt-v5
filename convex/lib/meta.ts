// Compatibility adapter for the Convex reference runtime.
//
// Schema-as-facts conventions are now owned by the pure `@metacrdt/schema`
// package so other runtime targets can share the same carrier ids, bootstrap
// cardinalities, and meta-attribute definitions. Existing Convex modules keep
// importing from `./lib/meta` while the package boundary settles.

export {
  META,
  META_ATTRIBUTES,
  BUILTIN_CARDINALITY,
  allMetaAttributeFacts,
  attributeDefinitionFacts,
  attrId,
  typeId,
  entityTypeDefinitionFacts,
  isAttrId,
  attrNameOf,
  isTypeId,
  typeNameOf,
  metaAttributeFacts,
  shapeAttributeDefinition,
  builtinCardinality,
  cardinalityOrMany,
  isCardinality,
  isValueType,
  type AttributeDefinition,
  type AttributeShape,
  type Cardinality,
  type EntityTypeDefinition,
  type FactRow,
  type SchemaFact,
  type ValueType,
  type MetaAttribute,
} from "@metacrdt/schema";
