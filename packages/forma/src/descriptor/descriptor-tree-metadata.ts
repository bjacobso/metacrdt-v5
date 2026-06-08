import type { DescriptorExtensionValue, FormDescriptor, SlotSpec } from "./FormDescriptor.js";

export type DescriptorTreeChildrenSpec =
  | { readonly kind: "any" }
  | { readonly kind: "none" }
  | { readonly kind: "only"; readonly types: readonly string[] };

export interface DescriptorTreeComponentSpec {
  readonly allowsBind?: boolean;
  readonly children?: DescriptorTreeChildrenSpec;
  readonly events?: readonly string[];
  readonly parents?: readonly string[];
  readonly positionalProp?: string;
}

export type DescriptorTreeSlotCompileKind = "expr" | "json" | "node-list" | "value";

export interface DescriptorTreeSlotCompileSpec {
  readonly field: string;
  readonly kind: DescriptorTreeSlotCompileKind;
  readonly aliases: readonly string[];
}

export interface DescriptorTreeCompileSpec {
  readonly component: DescriptorTreeComponentSpec;
  readonly slots: ReadonlyMap<string, DescriptorTreeSlotCompileSpec>;
  readonly aliases: ReadonlyMap<string, string>;
  readonly events: ReadonlyMap<string, string>;
  readonly exprProps: ReadonlySet<string>;
  readonly unknownPropsKind?: DescriptorTreeSlotCompileKind | undefined;
}

export interface DescriptorTreeProtocolRegistry {
  readonly compileLayoutTreeOp: string;
  readonly hostedDslName: string;
  readonly componentExtension: string;
  readonly layoutAliasExtension: string;
  readonly layoutAliasDefaultTo?: string | undefined;
  readonly allowDefaultComponentLayoutArgs: boolean;
  readonly allowHostedDslNameLayoutArgs: boolean;
}

function isRecord(
  value: DescriptorExtensionValue | undefined,
): value is Readonly<Record<string, DescriptorExtensionValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: DescriptorExtensionValue | undefined): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => typeof item === "string") ? value : undefined;
}

function stringValue(value: DescriptorExtensionValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function booleanValue(value: DescriptorExtensionValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringRecord(
  value: DescriptorExtensionValue | undefined,
): Readonly<Record<string, string>> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (!entries.every(([, entry]) => typeof entry === "string")) return undefined;
  return Object.fromEntries(entries) as Readonly<Record<string, string>>;
}

function stringArrayOrRecordKeys(
  value: DescriptorExtensionValue | undefined,
): readonly string[] | undefined {
  const array = stringArray(value);
  if (array) return array;
  if (!isRecord(value)) return undefined;
  const keys = Object.keys(value);
  return keys.every((key) => typeof key === "string") ? keys : undefined;
}

function eventFieldRecord(
  value: DescriptorExtensionValue | undefined,
): Readonly<Record<string, string>> | undefined {
  const record = stringRecord(value);
  if (record) return record;
  const array = stringArray(value);
  if (!array) return undefined;
  return Object.fromEntries(array.map((event) => [event, toCamelCase(event)]));
}

export function toCamelCase(key: string): string {
  return key.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());
}

function slotCompileKind(
  slot: SlotSpec,
  jsonSlots: ReadonlySet<string>,
  nodeSlots: ReadonlySet<string>,
): DescriptorTreeSlotCompileKind {
  if (slot.mode === "form" || nodeSlots.has(slot.name)) return "node-list";
  if (jsonSlots.has(slot.name)) return "json";
  if (slot.mode === "value") return "value";
  return "expr";
}

function parseSlotCompileKind(
  value: DescriptorExtensionValue | undefined,
): DescriptorTreeSlotCompileKind | undefined {
  return value === "expr" || value === "json" || value === "node-list" || value === "value"
    ? value
    : undefined;
}

export function readDescriptorTreeComponentSpec(
  descriptor: FormDescriptor,
  extensionKey: string,
): DescriptorTreeComponentSpec | undefined {
  const raw = descriptor.extensions?.[extensionKey];
  if (!isRecord(raw)) return undefined;

  const allowsBind = typeof raw["allows-bind"] === "boolean" ? raw["allows-bind"] : undefined;
  const events = stringArrayOrRecordKeys(raw["events"]);
  const positionalProp =
    typeof raw["positional-prop"] === "string" ? raw["positional-prop"] : undefined;
  const parents = stringArray(raw["parents"]);

  let children: DescriptorTreeChildrenSpec | undefined;
  const rawChildren = raw["children"];
  if (typeof rawChildren === "string" && (rawChildren === "any" || rawChildren === "none")) {
    children = { kind: rawChildren };
  } else if (
    Array.isArray(rawChildren) &&
    rawChildren[0] === "only" &&
    Array.isArray(rawChildren[1]) &&
    rawChildren[1].every((item) => typeof item === "string")
  ) {
    children = { kind: "only", types: rawChildren[1] as readonly string[] };
  }

  if (
    allowsBind === undefined &&
    children === undefined &&
    events === undefined &&
    parents === undefined &&
    positionalProp === undefined
  ) {
    return undefined;
  }

  return {
    ...(allowsBind !== undefined ? { allowsBind } : {}),
    ...(children !== undefined ? { children } : {}),
    ...(events !== undefined ? { events } : {}),
    ...(parents !== undefined ? { parents } : {}),
    ...(positionalProp !== undefined ? { positionalProp } : {}),
  };
}

export function readDescriptorTreeProtocolRegistry(
  descriptor: FormDescriptor,
  extensionKey = "protocol/registry",
): DescriptorTreeProtocolRegistry | undefined {
  const raw = descriptor.extensions?.[extensionKey];
  if (!isRecord(raw)) return undefined;

  const compileLayoutTreeOp = stringValue(raw["compile-layout-tree-op"]);
  const hostedDslName = stringValue(raw["hosted-dsl-name"]);
  const componentExtension = stringValue(raw["component-extension"]);
  const layoutAliasExtension = stringValue(raw["layout-alias-extension"]);
  const allowDefaultComponentLayoutArgs = booleanValue(raw["allow-default-component-layout-args"]);
  const allowHostedDslNameLayoutArgs = booleanValue(raw["allow-hosted-dsl-name-layout-args"]);

  if (
    !compileLayoutTreeOp ||
    !hostedDslName ||
    !componentExtension ||
    !layoutAliasExtension ||
    allowDefaultComponentLayoutArgs === undefined ||
    allowHostedDslNameLayoutArgs === undefined
  ) {
    return undefined;
  }

  return {
    compileLayoutTreeOp,
    hostedDslName,
    componentExtension,
    layoutAliasExtension,
    ...(stringValue(raw["layout-alias-default-to"])
      ? { layoutAliasDefaultTo: stringValue(raw["layout-alias-default-to"]) }
      : {}),
    allowDefaultComponentLayoutArgs,
    allowHostedDslNameLayoutArgs,
  };
}

export function findDescriptorTreeProtocolRegistry(
  descriptors: readonly FormDescriptor[],
  extensionKey = "protocol/registry",
): DescriptorTreeProtocolRegistry | undefined {
  for (const descriptor of descriptors) {
    const registry = readDescriptorTreeProtocolRegistry(descriptor, extensionKey);
    if (registry) return registry;
  }
  return undefined;
}

export function readDescriptorTreeCompileSpec(
  descriptor: FormDescriptor,
  extensionKey: string,
): DescriptorTreeCompileSpec | undefined {
  const component = readDescriptorTreeComponentSpec(descriptor, extensionKey);
  if (!component) return undefined;

  const raw = descriptor.extensions?.[extensionKey];
  const compile = isRecord(raw) && isRecord(raw["compile"]) ? raw["compile"] : {};
  const jsonSlots = new Set(stringArray(compile["json-slots"]) ?? []);
  const nodeSlots = new Set(stringArray(compile["node-slots"]) ?? []);
  const exprProps = new Set((stringArray(compile["expr-props"]) ?? []).map(toCamelCase));
  const fieldOverrides = stringRecord(compile["fields"]) ?? {};
  const eventOverrides = stringRecord(compile["events"]) ?? {};
  const eventFields = isRecord(raw) ? (eventFieldRecord(raw["events"]) ?? {}) : {};
  const unknownPropsKind = parseSlotCompileKind(compile["unknown-props"]);

  const slots = new Map<string, DescriptorTreeSlotCompileSpec>();
  const aliases = new Map<string, string>();

  for (const slot of descriptor.slots) {
    const canonicalName = toCamelCase(slot.name);
    const spec: DescriptorTreeSlotCompileSpec = {
      field: fieldOverrides[slot.name] ?? canonicalName,
      kind: slotCompileKind(slot, jsonSlots, nodeSlots),
      aliases: slot.aliases ?? [],
    };
    slots.set(canonicalName, spec);
    aliases.set(canonicalName, canonicalName);

    for (const alias of slot.aliases ?? []) {
      aliases.set(toCamelCase(alias), canonicalName);
    }
  }

  const events = new Map<string, string>();
  for (const event of component.events ?? []) {
    events.set(event, eventOverrides[event] ?? eventFields[event] ?? toCamelCase(event));
  }
  for (const [event, field] of Object.entries(eventFields)) {
    events.set(event, eventOverrides[event] ?? field);
  }
  for (const [event, field] of Object.entries(eventOverrides)) {
    events.set(event, field);
  }

  return {
    component,
    slots,
    aliases,
    events,
    exprProps,
    ...(unknownPropsKind !== undefined ? { unknownPropsKind } : {}),
  };
}
