import {
  readDescriptorTreeCompileSpec,
  toCamelCase,
  type DescriptorTreeCompileSpec,
  type DescriptorTreeSlotCompileSpec,
} from "./descriptor-tree-metadata.js";
import type { FormDescriptor } from "./FormDescriptor.js";
import { headSym, tail, type SExpr } from "../reader/types.js";
export type {
  DescriptorTreeCompileSpec,
  DescriptorTreeSlotCompileKind,
  DescriptorTreeSlotCompileSpec,
} from "./descriptor-tree-metadata.js";

export interface DescriptorTreeCompileInput {
  readonly layout: SExpr;
  readonly descriptors: readonly FormDescriptor[];
  readonly extensionKey: string;
  readonly compileExpr: (expr: SExpr) => unknown;
  readonly compileActionOrArray: (expr: SExpr) => unknown;
  readonly compileJsonValue: (expr: SExpr) => unknown;
  readonly normalizeLiteralValue: (expr: SExpr) => unknown;
}

export { readDescriptorTreeCompileSpec } from "./descriptor-tree-metadata.js";

export function buildDescriptorTreeCompileSpecs(
  descriptors: readonly FormDescriptor[],
  extensionKey: string,
): ReadonlyMap<string, DescriptorTreeCompileSpec> {
  return new Map(
    descriptors.flatMap((descriptor) => {
      const spec = readDescriptorTreeCompileSpec(descriptor, extensionKey);
      return spec ? ([[descriptor.name, spec]] as const) : [];
    }),
  );
}

export function compileDescriptorTree(input: DescriptorTreeCompileInput): unknown {
  const specs = buildDescriptorTreeCompileSpecs(input.descriptors, input.extensionKey);

  function normalizeSymbolName(name: string): string {
    return name.replace(/^:/, "");
  }

  function normalizeComponentType(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    return raw === "cond" ? "condition" : raw;
  }

  function isKeywordForm(expr: SExpr): boolean {
    const head = headSym(expr);
    return head !== undefined && head.startsWith(":");
  }

  function keyToString(expr: SExpr): string {
    return expr._tag === "Sym"
      ? normalizeSymbolName(expr.name)
      : String(input.normalizeLiteralValue(expr));
  }

  function compileNodeSlotValue(value: SExpr): unknown {
    if (value._tag === "Vector") {
      return value.items
        .map(compileNode)
        .filter((item): item is NonNullable<unknown> => item != null);
    }
    const single = compileNode(value);
    return single ? [single] : null;
  }

  function resolveSlot(
    spec: DescriptorTreeCompileSpec | undefined,
    key: string,
  ): DescriptorTreeSlotCompileSpec | undefined {
    if (!spec) return undefined;
    const camelKey = toCamelCase(key);
    const canonical = spec.aliases.get(camelKey) ?? camelKey;
    return spec.slots.get(canonical);
  }

  function compileSlotValue(slot: DescriptorTreeSlotCompileSpec, value: SExpr): unknown {
    switch (slot.kind) {
      case "json":
        return input.compileJsonValue(value);
      case "node-list":
        return compileNodeSlotValue(value);
      case "value":
        return input.normalizeLiteralValue(value);
      case "expr":
        return input.compileExpr(value);
    }
  }

  function compileUnknownPropValue(
    kind: DescriptorTreeCompileSpec["unknownPropsKind"],
    value: SExpr,
  ): unknown {
    switch (kind ?? "json") {
      case "json":
        return input.compileJsonValue(value);
      case "node-list":
        return compileNodeSlotValue(value);
      case "value":
        return input.normalizeLiteralValue(value);
      case "expr":
        return input.compileExpr(value);
    }
  }

  function routeProp(
    node: Map<string, unknown>,
    props: Map<string, unknown>,
    events: Map<string, unknown>,
    spec: DescriptorTreeCompileSpec | undefined,
    rawKey: string,
    value: SExpr,
  ): void {
    const camelKey = toCamelCase(rawKey);
    const eventField = spec?.events.get(rawKey);
    if (eventField) {
      events.set(eventField, input.compileActionOrArray(value));
      return;
    }

    const slot = resolveSlot(spec, rawKey);
    if (slot) {
      const slotValue = compileSlotValue(slot, value);
      if (slotValue !== null) node.set(slot.field, slotValue);
      return;
    }

    if (spec?.exprProps.has(camelKey)) {
      node.set(camelKey, input.compileExpr(value));
      return;
    }

    props.set(camelKey, compileUnknownPropValue(spec?.unknownPropsKind, value));
  }

  function routePositional(
    node: Map<string, unknown>,
    spec: DescriptorTreeCompileSpec | undefined,
    value: SExpr,
  ): boolean {
    const positionalProp = spec?.component.positionalProp;
    if (!positionalProp) return false;

    const slot = resolveSlot(spec, positionalProp);
    if (slot) {
      const slotValue = compileSlotValue(slot, value);
      if (slotValue !== null) node.set(slot.field, slotValue);
      return true;
    }

    return false;
  }

  function compileNode(expr: SExpr): unknown | null {
    if (expr._tag !== "List") return null;

    const head = headSym(expr);
    if (!head || head.startsWith(":")) return null;

    const componentType = normalizeComponentType(head)!;
    const spec = specs.get(componentType);
    const node = new Map<string, unknown>();
    const props = new Map<string, unknown>();
    const events = new Map<string, unknown>();
    const children: unknown[] = [];

    node.set("type", componentType);

    for (const item of tail(expr)) {
      if (
        item._tag === "Str" ||
        item._tag === "Num" ||
        item._tag === "Bool" ||
        item._tag === "Sym"
      ) {
        if (!routePositional(node, spec, item)) {
          node.set("text", input.normalizeLiteralValue(item));
        }
        continue;
      }

      if (item._tag === "Map") {
        for (const [key, value] of item.pairs) {
          routeProp(node, props, events, spec, keyToString(key), value);
        }
        continue;
      }

      if (item._tag === "List" && isKeywordForm(item)) {
        const keyword = normalizeSymbolName(headSym(item)!);
        const values = tail(item);
        const value = values.length === 1 ? values[0]! : undefined;
        if (value) routeProp(node, props, events, spec, keyword, value);
        continue;
      }

      if (item._tag === "List") {
        const childHead = headSym(item);
        if (childHead && !childHead.startsWith(":")) {
          const child = compileNode(item);
          if (child) children.push(child);
        }
      }
    }

    if (props.size > 0) node.set("props", props);
    if (events.size > 0) node.set("events", events);
    if (children.length > 0) node.set("children", children);

    return node;
  }

  return compileNode(input.layout);
}
