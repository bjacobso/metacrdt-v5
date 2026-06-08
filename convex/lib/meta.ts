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
  attrId,
  typeId,
  isAttrId,
  attrNameOf,
  isTypeId,
  typeNameOf,
  builtinCardinality,
  cardinalityOrMany,
  isCardinality,
  isValueType,
  type Cardinality,
  type ValueType,
  type MetaAttribute,
} from "@metacrdt/schema";
