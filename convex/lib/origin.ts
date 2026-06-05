// Origin: the user-vs-system seam. Everything in this store is facts — entities,
// schema, flow defs, rules. "User-defined vs intrinsic" is therefore not two
// storage locations but a provenance facet read off what's already there.
//
//   system     — the platform's own machinery: schema-as-facts (attr:/type:),
//                 form definitions, action definitions. Shipped/structural.
//   configured — a tenant's declared shape: entity types they defined (registered
//                 as type:<Name> schema entities), their flows/actions/rules.
//   data       — runtime instances: the actual Workers, Placements, etc.
//
// The split lets the product surface "your data / your workflows" by default and
// tuck the intrinsic plumbing (the reconciler, the schema entities) behind a
// "show system" affordance — the way Salesforce hides standard objects.

export type Origin = "system" | "configured" | "data";

/** Entity-`type` values that name the platform's own machinery, not tenant data. */
export const SYSTEM_ENTITY_TYPES = new Set([
  "Attribute",
  "EntityType",
  "Form",
  "Action",
]);

/** Entity-id prefixes reserved for system machinery. */
export const SYSTEM_PREFIXES = ["attr:", "type:", "form:", "action:", "system:"];

/**
 * Is this entity part of the system's own machinery (schema, forms, actions),
 * as opposed to tenant data? Classified by reserved id prefix or by carrying a
 * system entity-type.
 */
export function isSystemEntity(e: string, types: string[]): boolean {
  if (SYSTEM_PREFIXES.some((p) => e.startsWith(p))) return true;
  return types.some((t) => SYSTEM_ENTITY_TYPES.has(t));
}

/** Origin of a single entity instance (data unless it's system machinery). */
export function entityOrigin(e: string, types: string[]): Origin {
  return isSystemEntity(e, types) ? "system" : "data";
}

/**
 * Origin of an entity *type*. System types are the meta ones; a type that was
 * formally declared (a `type:<Name>` registry entry exists) is "configured";
 * a type only ever discovered from data is "data" (ad-hoc, never declared).
 */
export function typeOrigin(typeName: string, isConfigured: boolean): Origin {
  if (SYSTEM_ENTITY_TYPES.has(typeName)) return "system";
  return isConfigured ? "configured" : "data";
}
