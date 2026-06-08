import { headSym, List, SMap, Str, Sym, type SExpr } from "../reader/types.js";
import type { DescriptorExtensionValue, FormDescriptor } from "./FormDescriptor.js";

export interface DescriptorTreeAliasTarget {
  readonly to: string;
  readonly componentName?: string;
}

export interface DescriptorTreeAliasOptions {
  readonly extensionKey?: string;
  readonly defaultTo?: string;
}

export function buildDescriptorTreeLayoutAliases(
  descriptors: readonly FormDescriptor[],
  options: DescriptorTreeAliasOptions = {},
): ReadonlyMap<string, DescriptorTreeAliasTarget> {
  const aliases = new Map<string, DescriptorTreeAliasTarget>();
  const { extensionKey, defaultTo } = options;

  for (const descriptor of descriptors) {
    const extensions = descriptor.extensions ?? {};
    const extensionEntries =
      extensionKey !== undefined
        ? ([[extensionKey, extensions[extensionKey]]] as const)
        : Object.entries(extensions);

    for (const [, extension] of extensionEntries) {
      const alias = readAliasTarget(extension, defaultTo);
      if (!alias) continue;
      aliases.set(alias.formName, {
        to: alias.to,
        ...(alias.componentName ? { componentName: alias.componentName } : {}),
      });
    }
  }

  return aliases;
}

export function rewriteDescriptorTreeLayoutAliases(
  expr: SExpr,
  aliases: ReadonlyMap<string, DescriptorTreeAliasTarget>,
): SExpr {
  function rewriteTree(node: SExpr): SExpr {
    switch (node._tag) {
      case "List": {
        const head = headSym(node);
        const rewrittenItems = node.items.map((item) => rewriteTreeChild(item));
        if (!head) return List(rewrittenItems, node.loc);

        const alias = aliases.get(head);
        if (!alias) return List(rewrittenItems, node.loc);

        const [, ...tailItems] = rewrittenItems;
        if (alias.componentName) {
          const existingMapIndex = tailItems.findIndex((item) => item._tag === "Map");
          if (existingMapIndex >= 0) {
            const existingMap = tailItems[existingMapIndex] as SExpr & { _tag: "Map" };
            const propPairs = existingMap.pairs.filter(
              ([key]) => !(key._tag === "Sym" && key.name === ":component-name"),
            );
            tailItems[existingMapIndex] = SMap(
              [
                [
                  Sym(":component-name", existingMap.loc),
                  Str(alias.componentName, existingMap.loc),
                ] as const,
                ...propPairs,
              ],
              existingMap.loc,
            );
          } else {
            tailItems.unshift(
              SMap(
                [[Sym(":component-name", node.loc), Str(alias.componentName, node.loc)]],
                node.loc,
              ),
            );
          }
        }

        return List([Sym(alias.to, node.loc), ...tailItems], node.loc);
      }
      case "Vector":
        return { ...node, items: node.items.map((item) => rewriteTree(item)) };
      case "Set":
        return { ...node, items: node.items.map((item) => rewriteTree(item)) };
      default:
        return node;
    }
  }

  function rewriteTreeChild(node: SExpr): SExpr {
    // Prop maps carry JSON/expression data. Alias lowering is a layout-tree
    // transform, so do not rewrite list-shaped values nested inside maps.
    if (node._tag === "Map") return node;
    return rewriteTree(node);
  }

  return rewriteTree(expr);
}

function isExtensionRecord(
  value: DescriptorExtensionValue | undefined,
): value is Readonly<Record<string, DescriptorExtensionValue>> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readAliasTarget(
  value: DescriptorExtensionValue | undefined,
  defaultTo: string | undefined,
): { readonly formName: string; readonly to: string; readonly componentName?: string } | undefined {
  if (!isExtensionRecord(value)) return undefined;

  const formName = typeof value["form"] === "string" ? value["form"] : undefined;
  if (!formName) return undefined;

  const to = typeof value["to"] === "string" ? value["to"] : undefined;
  const target = to ?? defaultTo;
  const componentName =
    typeof value["component-name"] === "string" ? value["component-name"] : undefined;
  if (!target) return undefined;

  return {
    formName,
    to: target,
    ...(componentName ? { componentName } : {}),
  };
}
