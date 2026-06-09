import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  DescriptorExtensionValue,
  DescriptorTreeCompileSpec,
  DescriptorTreeProtocolRegistry,
  DescriptorTreeSlotCompileSpec,
  FormDescriptor as DescriptorFormDescriptor,
  SlotSpec as DescriptorSlotSpec,
  ValidationCheck as DescriptorValidationCheck,
} from "@forma/ts/descriptor";
import {
  buildProtocolEnumDescriptors,
  buildProtocolModuleDescriptors,
  buildProtocolObjectDescriptors,
  buildProtocolTypeAliasDescriptors,
  buildProtocolUnionDescriptors,
  createProtocolSchemaRefResolver,
  emitProtocolInterface,
  emitProtocolModule,
  emitProtocolModuleImports,
  emitProtocolObjectSchema,
  findDescriptorTreeProtocolRegistry,
  parsePrelude as parseDescriptorPrelude,
  parseProtocolType,
  protocolEnumsForModule,
  protocolObjectsForModule,
  protocolTypeAliasesForModule,
  protocolUnionsForModule,
  readDescriptorTreeCompileSpec,
  requiredProtocolObject,
  requiredProtocolModule,
  safeProtocolFieldName as safeFieldName,
  schemaProtocolType,
  tsProtocolType,
  type ProtocolTypeDescriptor,
} from "@forma/ts/descriptor";

const PACKAGE_DIR = resolve(import.meta.dirname, "..");
// Preludes live inside this package (packages/views/preludes), so the prelude
// base is the package directory itself.
const REPO_ROOT = PACKAGE_DIR;
const UI_PRELUDE_FILE = resolve(REPO_ROOT, "preludes/ui.lisp");
const VIEWSPEC_PRELUDE_FILE = resolve(REPO_ROOT, "preludes/viewspec.lisp");
const VIEWSPEC_PROTOCOL_PRELUDE_FILE = resolve(REPO_ROOT, "preludes/viewspec-protocol.lisp");
const OUTPUT_FILE = resolve(PACKAGE_DIR, "src/generated/view-node.generated.ts");
const EXPRESSION_OUTPUT_FILE = resolve(PACKAGE_DIR, "src/generated/view-expression.generated.ts");
const ACTION_OUTPUT_FILE = resolve(PACKAGE_DIR, "src/generated/view-action.generated.ts");
const EVENT_OUTPUT_FILE = resolve(PACKAGE_DIR, "src/generated/view-event.generated.ts");
const STATE_OUTPUT_FILE = resolve(PACKAGE_DIR, "src/generated/view-state.generated.ts");
const SPEC_OUTPUT_FILE = resolve(PACKAGE_DIR, "src/generated/view-spec.generated.ts");
const NODE_TYPE = "ViewNode";
const NODE_SCHEMA = "ViewNodeSchema";

interface ViewSpecExtraField {
  readonly name: string;
  readonly optional: boolean;
  readonly ts: string;
  readonly schema: string;
}

interface ViewSpecExtraNormalizeField {
  readonly field: string;
  readonly keys: readonly string[];
  readonly kind: string;
}

interface ViewSpecCompileMetadata {
  readonly requiredChildren: boolean;
  readonly requiredBind: boolean;
  readonly slotNormalizeKinds: ReadonlyMap<string, string>;
  readonly slotDefaults: ReadonlyMap<string, string>;
  readonly slotTypeOverrides: ReadonlyMap<string, ProtocolTypeDescriptor>;
  readonly extraFields: readonly ViewSpecExtraField[];
  readonly extraNormalizeFields: readonly ViewSpecExtraNormalizeField[];
}

let cachedViewSpecDescriptors: readonly DescriptorFormDescriptor[] | undefined;
let cachedProtocolDescriptors: readonly DescriptorFormDescriptor[] | undefined;
let cachedProtocolRegistry: DescriptorTreeProtocolRegistry | undefined;

function loadDescriptors(): readonly DescriptorFormDescriptor[] {
  cachedViewSpecDescriptors ??= parseDescriptorPrelude(
    [UI_PRELUDE_FILE, VIEWSPEC_PRELUDE_FILE].map((file) => readFileSync(file, "utf8")).join("\n\n"),
  ).forms;
  return cachedViewSpecDescriptors;
}

function loadProtocolDescriptors(): readonly DescriptorFormDescriptor[] {
  cachedProtocolDescriptors ??= parseDescriptorPrelude(
    readFileSync(VIEWSPEC_PROTOCOL_PRELUDE_FILE, "utf8"),
  ).forms;
  return cachedProtocolDescriptors;
}

function viewProtocolRegistry(): DescriptorTreeProtocolRegistry {
  cachedProtocolRegistry ??= findDescriptorTreeProtocolRegistry(loadProtocolDescriptors());
  if (!cachedProtocolRegistry) throw new Error("missing descriptor tree protocol registry");
  return cachedProtocolRegistry;
}

function viewComponentExtensionKey(): string {
  return viewProtocolRegistry().componentExtension;
}

function isRecord(
  value: DescriptorExtensionValue | undefined,
): value is Readonly<Record<string, DescriptorExtensionValue>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: DescriptorExtensionValue | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanValue(value: DescriptorExtensionValue | undefined): boolean {
  return typeof value === "boolean" ? value : false;
}

function stringArray(value: DescriptorExtensionValue | undefined): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stringRecord(value: DescriptorExtensionValue | undefined): ReadonlyMap<string, string> {
  if (!isRecord(value)) return new Map();
  return new Map(
    Object.entries(value).flatMap(([key, entry]) =>
      typeof entry === "string" ? ([[key, entry]] as const) : [],
    ),
  );
}

function viewSpecCompileMetadata(descriptor: DescriptorFormDescriptor): ViewSpecCompileMetadata {
  const raw = descriptor.extensions?.[viewComponentExtensionKey()];
  const compile = isRecord(raw) && isRecord(raw["compile"]) ? raw["compile"] : {};

  return {
    requiredChildren: booleanValue(compile["required-children"]),
    requiredBind: booleanValue(compile["required-bind"]),
    slotNormalizeKinds: stringRecord(compile["slot-normalize-kinds"]),
    slotDefaults: stringRecord(compile["slot-defaults"]),
    slotTypeOverrides: slotTypeOverrides(compile["slot-types"]),
    extraFields: extraFields(compile["extra-fields"]),
    extraNormalizeFields: extraNormalizeFields(compile["extra-normalize-fields"]),
  };
}

function slotTypeOverrides(
  value: DescriptorExtensionValue | undefined,
): ReadonlyMap<string, ProtocolTypeDescriptor> {
  if (!isRecord(value)) return new Map();
  return new Map(
    Object.entries(value).map(([slotName, entry]) => [slotName, parseProtocolType(entry)]),
  );
}

function extraFields(value: DescriptorExtensionValue | undefined): readonly ViewSpecExtraField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const name = stringValue(entry["name"]);
    const ts = stringValue(entry["ts"]);
    const schema = stringValue(entry["schema"]);
    if (!name || !ts || !schema) return [];
    return [
      {
        name,
        ts,
        schema,
        optional: booleanValue(entry["optional"]),
      },
    ];
  });
}

function extraNormalizeFields(
  value: DescriptorExtensionValue | undefined,
): readonly ViewSpecExtraNormalizeField[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const field = stringValue(entry["field"]);
    const kind = stringValue(entry["kind"]);
    if (!field || !kind) return [];
    return [
      {
        field,
        kind,
        keys: stringArray(entry["keys"]),
      },
    ];
  });
}

export function generateViewSpecExpressionModule(): string {
  const descriptors = loadProtocolDescriptors();
  const typeAliases = buildProtocolTypeAliasDescriptors(descriptors);
  const enums = buildProtocolEnumDescriptors(descriptors);
  const objects = buildProtocolObjectDescriptors(descriptors);
  const unions = buildProtocolUnionDescriptors(descriptors);
  const module = requiredProtocolModule(
    buildProtocolModuleDescriptors(descriptors),
    "ViewExpression",
  );

  return emitProtocolModule({
    header: [
      "/**",
      " * AUTO-GENERATED FILE - DO NOT EDIT",
      " *",
      " * Generated from the hosted ViewSpec expression protocol descriptors in preludes/viewspec-protocol.lisp.",
      " * Run: npm run generate --workspace @metacrdt/views",
      " */",
    ],
    imports: ['import { Schema } from "effect";'],
    typeAliases: protocolTypeAliasesForModule(module, typeAliases),
    enums: protocolEnumsForModule(module, enums),
    objects: protocolObjectsForModule(module, objects),
    unions: protocolUnionsForModule(module, unions),
    schemaOptions: {
      exportSchema: true,
      resolveSchemaRef: createProtocolSchemaRefResolver({
        module,
        objects,
        unions,
        typeAliases,
        enums,
      }),
    },
    unionDescriptions: {
      ViewExpr: "A structured ViewSpec expression AST node.",
    },
  });
}

export function generateViewSpecActionModule(): string {
  const descriptors = loadProtocolDescriptors();
  const typeAliases = buildProtocolTypeAliasDescriptors(descriptors);
  const objects = buildProtocolObjectDescriptors(descriptors);
  const unions = buildProtocolUnionDescriptors(descriptors);
  const module = requiredProtocolModule(buildProtocolModuleDescriptors(descriptors), "ViewAction");

  return emitProtocolModule({
    header: [
      "/**",
      " * AUTO-GENERATED FILE - DO NOT EDIT",
      " *",
      " * Generated from the hosted ViewSpec protocol descriptors in preludes/viewspec-protocol.lisp.",
      " * Run: npm run generate --workspace @metacrdt/views",
      " */",
    ],
    imports: [
      'import { Schema } from "effect";',
      ...emitProtocolModuleImports(module, {
        moduleSpecifiers: {
          ViewExpression: "./view-expression.generated.js",
        },
      }),
    ],
    typeAliases: protocolTypeAliasesForModule(module, typeAliases),
    objects: protocolObjectsForModule(module, objects),
    unions: protocolUnionsForModule(module, unions),
    schemaOptions: {
      exportSchema: true,
      resolveSchemaRef: createProtocolSchemaRefResolver({
        module,
        objects,
        unions,
        typeAliases,
      }),
    },
    unionDescriptions: {
      ViewAction: "A declarative view action with optional success/error/finally callbacks.",
    },
    footer: [
      "export const ViewAction = ViewActionSchema;",
      "",
      "export const ViewActionSpec = ViewAction;",
    ],
  });
}

export function generateViewSpecStateModule(): string {
  const descriptors = loadProtocolDescriptors();
  const objects = buildProtocolObjectDescriptors(descriptors);
  const unions = buildProtocolUnionDescriptors(descriptors);
  const module = requiredProtocolModule(buildProtocolModuleDescriptors(descriptors), "ViewState");

  return emitProtocolModule({
    header: [
      "/**",
      " * AUTO-GENERATED FILE - DO NOT EDIT",
      " *",
      " * Generated from the hosted ViewSpec protocol descriptors in preludes/viewspec-protocol.lisp.",
      " * Run: npm run generate --workspace @metacrdt/views",
      " */",
    ],
    imports: [
      'import { Schema } from "effect";',
      ...emitProtocolModuleImports(module, {
        moduleSpecifiers: {
          ViewNode: "./view-node.generated.js",
        },
      }),
    ],
    objects: protocolObjectsForModule(module, objects),
    unions: protocolUnionsForModule(module, unions),
    schemaOptions: {
      exportSchema: true,
      resolveSchemaRef: createProtocolSchemaRefResolver({
        module,
        objects,
        unions,
      }),
    },
    unionDescriptions: {
      ViewStateDecl: "Typed state declaration for ViewSpec.",
    },
    footer: [
      "export const ViewStateDecl = ViewStateDeclSchema;",
      "",
      "export const ViewState = ViewStateDecl;",
    ],
  });
}

export function generateViewSpecEventModule(): string {
  const descriptors = loadProtocolDescriptors();
  const objects = buildProtocolObjectDescriptors(descriptors);
  const module = requiredProtocolModule(buildProtocolModuleDescriptors(descriptors), "ViewEvent");
  const eventObjects = protocolObjectsForModule(module, objects);

  const lines: string[] = [
    "/**",
    " * AUTO-GENERATED FILE - DO NOT EDIT",
    " *",
    " * Generated from the hosted ViewSpec protocol descriptors in preludes/viewspec-protocol.lisp.",
    " * Run: npm run generate --workspace @metacrdt/views",
    " */",
    "",
    'import { Schema } from "effect";',
    ...emitProtocolModuleImports(module, {
      moduleSpecifiers: {
        ViewAction: "./view-action.generated.js",
      },
    }),
    "",
  ];

  for (const object of eventObjects) {
    lines.push(...emitProtocolInterface(object), "");
  }

  lines.push(
    ...emitProtocolObjectSchema(requiredProtocolObject(objects, "ViewEventMap"), {
      exportSchema: false,
      resolveSchemaRef: createProtocolSchemaRefResolver({
        module,
        objects,
      }),
    }),
    "",
  );

  lines.push(
    "export const ViewEventMap = ViewEventMapSchema.annotations({",
    '  identifier: "ViewEventMap",',
    '  description: "ViewSpec event callback map.",',
    "});",
  );

  return lines.join("\n").trimEnd() + "\n";
}

export function generateViewSpecEnvelopeModule(): string {
  const descriptors = loadProtocolDescriptors();
  const objects = buildProtocolObjectDescriptors(descriptors);
  const unions = buildProtocolUnionDescriptors(descriptors);
  const module = requiredProtocolModule(buildProtocolModuleDescriptors(descriptors), "ViewSpec");

  return emitProtocolModule({
    header: [
      "/**",
      " * AUTO-GENERATED FILE - DO NOT EDIT",
      " *",
      " * Generated from the hosted ViewSpec envelope protocol descriptors in preludes/viewspec-protocol.lisp.",
      " * Run: npm run generate --workspace @metacrdt/views",
      " */",
    ],
    imports: [
      'import { Schema } from "effect";',
      ...emitProtocolModuleImports(module, {
        moduleSpecifiers: {
          ViewAction: "./view-action.generated.js",
          ViewNode: "./view-node.generated.js",
          ViewState: "./view-state.generated.js",
        },
      }),
    ],
    objects: protocolObjectsForModule(module, objects),
    unions: protocolUnionsForModule(module, unions),
    schemaOptions: {
      exportSchema: true,
      resolveSchemaRef: createProtocolSchemaRefResolver({
        module,
        objects,
        unions,
      }),
    },
    unionDescriptions: {
      ViewQueryBinding:
        "A ViewSpec query binding backed by an inline query or a named query reference.",
    },
    footer: [],
  });
}

function schemaProtocolRef(ref: string): string {
  switch (ref) {
    case "ViewExpr":
      return "ViewExpression";
    case "ViewAction":
      return "Schema.suspend(() => ViewActionSchema)";
    case "ViewActionOrList":
      return "Schema.suspend(() => ViewActionOrListSchema)";
    case "ViewStateDecl":
      return "Schema.suspend(() => ViewStateDeclSchema)";
    case "ViewNode":
      return "Schema.suspend(() => ViewNode)";
    default:
      return `${ref}Schema`;
  }
}

export function generateViewSpecViewNodeModule(): string {
  const descriptors = loadDescriptors();
  const protocolDescriptors = loadProtocolDescriptors();
  const protocolObjects = buildProtocolObjectDescriptors(protocolDescriptors);
  const supportModule = requiredProtocolModule(
    buildProtocolModuleDescriptors(protocolDescriptors),
    "ViewNodeSupport",
  );
  const supportObjects = protocolObjectsForModule(supportModule, protocolObjects);
  const supportSchemaResolver = createProtocolSchemaRefResolver({
    module: supportModule,
    objects: protocolObjects,
  });
  const lines: string[] = [
    "/**",
    " * AUTO-GENERATED FILE - DO NOT EDIT",
    " *",
    " * Generated from the hosted ViewSpec descriptors in preludes/viewspec.lisp.",
    " * Run: npm run generate --workspace @metacrdt/views",
    " */",
    "",
    'import { Schema } from "effect";',
    'import { type ViewExpr, ViewExpression } from "./view-expression.generated.js";',
    'import { type ViewActionOrList, ViewActionOrListSchema } from "./view-action.generated.js";',
    "",
  ];

  for (const object of supportObjects) {
    lines.push(...emitProtocolInterface(object), "");
  }

  for (const object of supportObjects) {
    lines.push(
      ...emitProtocolObjectSchema(object, {
        exportSchema: true,
        resolveSchemaRef: supportSchemaResolver,
      }),
      "",
    );
  }

  lines.push(
    "export interface ViewNodeBase {",
    "  readonly visible?: ViewExpr | undefined;",
    "}",
    "",
    "export interface ViewStyleFields {",
    "  readonly width?: number | undefined;",
    "  readonly height?: number | undefined;",
    "  readonly minHeight?: number | undefined;",
    "  readonly maxWidth?: number | undefined;",
    "}",
    "",
    `export const GENERATED_VIEW_COMPONENT_TYPES = [${descriptors
      .map((descriptor) => JSON.stringify(descriptor.name))
      .join(", ")}] as const;`,
    "",
    "export const VIEW_COMPONENT_TYPES = GENERATED_VIEW_COMPONENT_TYPES;",
    "",
    "export type ViewComponentType = (typeof VIEW_COMPONENT_TYPES)[number];",
    "",
    "export const ViewComponentType = Schema.Literal(...VIEW_COMPONENT_TYPES).annotations({",
    '  identifier: "ViewComponentType",',
    "});",
    "",
    "export type ViewSpecComponentSlotKind =",
    '  | "expr"',
    '  | "string"',
    '  | "number"',
    '  | "boolean"',
    '  | "record"',
    '  | "unknown-array"',
    '  | "node-list"',
    '  | "number-array"',
    '  | "table-columns"',
    '  | "table-filters"',
    '  | "table-sort"',
    '  | "chart-series"',
    '  | "select-options"',
    '  | "boolean-or-number";',
    "",
    "export interface ViewSpecComponentCatalogSlot {",
    "  readonly name: string;",
    "  readonly field: string;",
    "  readonly kind: ViewSpecComponentSlotKind;",
    "  readonly required: boolean;",
    "  readonly many: boolean;",
    "  readonly aliases: readonly string[];",
    "  readonly values?: readonly string[] | undefined;",
    "  readonly description?: string | undefined;",
    "}",
    "",
    "export interface ViewSpecComponentCatalogChildren {",
    '  readonly kind: "any" | "none" | "only";',
    "  readonly required: boolean;",
    "  readonly types?: readonly ViewComponentType[] | undefined;",
    "}",
    "",
    "export interface ViewSpecComponentCatalogEntry {",
    "  readonly type: ViewComponentType;",
    "  readonly description?: string | undefined;",
    "  readonly allowsBind: boolean;",
    "  readonly requiredBind: boolean;",
    "  readonly positionalProp?: string | undefined;",
    "  readonly slots: readonly ViewSpecComponentCatalogSlot[];",
    "  readonly children: ViewSpecComponentCatalogChildren;",
    "  readonly parents: readonly ViewComponentType[];",
    "  readonly events: readonly string[];",
    '  readonly unknownPropsKind?: "expr" | "json" | "node-list" | "value" | undefined;',
    "}",
    "",
    `export const VIEW_SPEC_COMPONENT_CATALOG: Record<ViewComponentType, ViewSpecComponentCatalogEntry> = ${catalogCode(descriptors)};`,
    "",
  );

  for (const descriptor of descriptors) {
    lines.push(...emitInterface(descriptor), "");
  }

  lines.push("export type ViewNode =");
  for (const descriptor of descriptors) {
    lines.push(`  | ${interfaceName(descriptor.name)}`);
  }
  lines.push(";", "");

  lines.push("const ViewNodeBaseFields = {");
  lines.push("  visible: Schema.optional(ViewExpression),");
  lines.push("} as const;", "");
  lines.push("const ViewStyleFields = {");
  lines.push("  width: Schema.optional(Schema.Number),");
  lines.push("  height: Schema.optional(Schema.Number),");
  lines.push("  minHeight: Schema.optional(Schema.Number),");
  lines.push("  maxWidth: Schema.optional(Schema.Number),");
  lines.push("} as const;", "");

  for (const descriptor of descriptors) {
    lines.push(...emitSchema(descriptor), "");
  }

  lines.push(
    `export const ${NODE_SCHEMA} = Schema.Union(${descriptors
      .map((descriptor) => schemaName(descriptor.name))
      .join(
        ", ",
      )}).annotations({ identifier: "ViewNode" }) as unknown as Schema.Schema<${NODE_TYPE}>;`,
  );
  lines.push("");
  lines.push(`export const ViewNode = ${NODE_SCHEMA};`);
  lines.push("");
  lines.push(`export const ViewNodeSpec = ViewNode;`);
  lines.push("");
  lines.push(...emitNormalizer(descriptors));

  return lines.join("\n").trimEnd() + "\n";
}

function emitInterface(descriptor: DescriptorFormDescriptor): string[] {
  const compileSpec = readDescriptorTreeCompileSpec(descriptor, viewComponentExtensionKey());
  const metadata = viewSpecCompileMetadata(descriptor);
  const lines = [
    `export interface ${interfaceName(descriptor.name)} extends ViewNodeBase, ViewStyleFields {`,
    `  readonly type: ${JSON.stringify(descriptor.name)};`,
  ];

  if (compileSpec?.component.allowsBind) {
    lines.push(
      metadata.requiredBind
        ? "  readonly bind: ViewExpr;"
        : "  readonly bind?: ViewExpr | undefined;",
    );
  }

  for (const field of interfaceSlotFields(descriptor, compileSpec)) {
    lines.push(`  ${field}`);
  }

  for (const field of metadata.extraFields) {
    lines.push(
      field.optional
        ? `  readonly ${safeFieldName(field.name)}?: ${field.ts} | undefined;`
        : `  readonly ${safeFieldName(field.name)}: ${field.ts};`,
    );
  }

  if (compileSpec) {
    const children = childrenType(compileSpec);
    if (children) {
      lines.push(
        metadata.requiredChildren
          ? `  readonly children: ${children};`
          : `  readonly children?: ${children} | undefined;`,
      );
    }

    const events = eventMapType(compileSpec);
    if (events) lines.push(`  readonly events?: ${events} | undefined;`);

    if (
      compileSpec?.unknownPropsKind === "json" &&
      !hasEmittedField(descriptor, "props", compileSpec)
    ) {
      lines.push("  readonly props?: Record<string, unknown> | undefined;");
    }
  }

  lines.push("}");
  return lines;
}

function emitSchema(descriptor: DescriptorFormDescriptor): string[] {
  const compileSpec = readDescriptorTreeCompileSpec(descriptor, viewComponentExtensionKey());
  const metadata = viewSpecCompileMetadata(descriptor);
  const lines = [`export const ${schemaName(descriptor.name)} = Schema.Struct({`];
  lines.push(`  type: Schema.Literal(${JSON.stringify(descriptor.name)}),`);
  lines.push("  ...ViewNodeBaseFields,");
  lines.push("  ...ViewStyleFields,");

  if (compileSpec?.component.allowsBind) {
    lines.push(
      metadata.requiredBind
        ? "  bind: ViewExpression,"
        : "  bind: Schema.optional(ViewExpression),",
    );
  }

  for (const field of schemaSlotFields(descriptor, compileSpec)) {
    lines.push(`  ${field}`);
  }

  for (const field of metadata.extraFields) {
    lines.push(
      field.optional
        ? `  ${safeFieldName(field.name)}: Schema.optional(${field.schema}),`
        : `  ${safeFieldName(field.name)}: ${field.schema},`,
    );
  }

  if (compileSpec) {
    const children = childrenSchema(compileSpec);
    if (children) {
      lines.push(
        metadata.requiredChildren
          ? `  children: ${children},`
          : `  children: Schema.optional(${children}),`,
      );
    }

    const events = eventMapSchema(compileSpec);
    if (events) lines.push(`  events: Schema.optional(${events}),`);

    if (
      compileSpec?.unknownPropsKind === "json" &&
      !hasEmittedField(descriptor, "props", compileSpec)
    ) {
      lines.push(
        "  props: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),",
      );
    }
  }

  lines.push(`}) as unknown as Schema.Schema<${interfaceName(descriptor.name)}>;`);
  return lines;
}

function emitNormalizer(descriptors: readonly DescriptorFormDescriptor[]): string[] {
  return [
    "type ViewNodeNormalizationSlotKind =",
    '  | "expr"',
    '  | "string"',
    '  | "number"',
    '  | "boolean"',
    '  | "record"',
    '  | "unknown-array"',
    '  | "node-list"',
    '  | "number-array"',
    '  | "table-columns"',
    '  | "table-filters"',
    '  | "table-sort"',
    '  | "chart-series"',
    '  | "select-options"',
    '  | "boolean-or-number";',
    "",
    "type ViewNodeNormalizationDefault =",
    '  | "empty-expr"',
    '  | "false-expr-or-bind";',
    "",
    "interface ViewNodeNormalizationSlotSpec {",
    "  readonly field: string;",
    "  readonly keys: readonly string[];",
    "  readonly kind: ViewNodeNormalizationSlotKind;",
    "  readonly required?: boolean | undefined;",
    "  readonly default?: ViewNodeNormalizationDefault | undefined;",
    "}",
    "",
    "interface ViewNodeNormalizationChildrenSpec {",
    '  readonly kind: "any" | "only";',
    "  readonly required: boolean;",
    "  readonly types?: readonly ViewComponentType[] | undefined;",
    "}",
    "",
    "interface ViewNodeNormalizationSpec {",
    "  readonly allowsBind: boolean;",
    "  readonly requiredBind: boolean;",
    "  readonly slots: readonly ViewNodeNormalizationSlotSpec[];",
    "  readonly extraFields?: readonly ViewNodeNormalizationSlotSpec[] | undefined;",
    "  readonly children?: ViewNodeNormalizationChildrenSpec | undefined;",
    "  readonly events: readonly string[];",
    '  readonly unknownPropsKind?: "expr" | "json" | "node-list" | "value" | undefined;',
    "}",
    "",
    `const ViewNodeNormalizationSpecs: Record<ViewComponentType, ViewNodeNormalizationSpec> = ${normalizationSpecsCode(descriptors)};`,
    "",
    'const EMPTY_LIST_EXPR: ViewExpr = { kind: "literal", value: [] };',
    'const FALSE_EXPR: ViewExpr = { kind: "literal", value: false };',
    'const EMPTY_EXPR: ViewExpr = { kind: "literal", value: "" };',
    "",
    "function isRecord(value: unknown): value is Record<string, unknown> {",
    '  return typeof value === "object" && value !== null && !Array.isArray(value);',
    "}",
    "",
    "function getNodeProps(input: Record<string, unknown>): Record<string, unknown> {",
    '  return isRecord(input["props"]) ? input["props"] : {};',
    "}",
    "",
    "function pickField(",
    "  input: Record<string, unknown>,",
    "  props: Record<string, unknown>,",
    "  keys: readonly string[],",
    "): unknown {",
    "  for (const key of keys) {",
    "    if (input[key] !== undefined) return input[key];",
    "    if (props[key] !== undefined) return props[key];",
    "  }",
    "  return undefined;",
    "}",
    "",
    "function unwrapLiteralValue(value: unknown): unknown {",
    '  if (isRecord(value) && value["kind"] === "literal") {',
    '    return unwrapLiteralValue(value["value"]);',
    "  }",
    "  if (Array.isArray(value)) {",
    "    return value.map((entry) => unwrapLiteralValue(entry));",
    "  }",
    "  if (isRecord(value)) {",
    "    return Object.fromEntries(",
    "      Object.entries(value).map(([key, entry]) => [key, unwrapLiteralValue(entry)]),",
    "    );",
    "  }",
    "  return value;",
    "}",
    "",
    "function pickLiteralField(",
    "  input: Record<string, unknown>,",
    "  props: Record<string, unknown>,",
    "  keys: readonly string[],",
    "): unknown {",
    "  const value = pickField(input, props, keys);",
    "  return value === undefined ? undefined : unwrapLiteralValue(value);",
    "}",
    "",
    "function isViewExpr(value: unknown): value is ViewExpr {",
    '  if (!isRecord(value) || typeof value["kind"] !== "string") return false;',
    '  switch (value["kind"]) {',
    '    case "literal":',
    '    case "var":',
    '    case "binary":',
    '    case "unary":',
    '    case "conditional":',
    '    case "pipe":',
    "      return true;",
    "    default:",
    "      return false;",
    "  }",
    "}",
    "",
    "function normalizeExprValue(value: unknown): ViewExpr {",
    '  return isViewExpr(value) ? value : { kind: "literal", value: unwrapLiteralValue(value) };',
    "}",
    "",
    "function pickExpr(",
    "  input: Record<string, unknown>,",
    "  props: Record<string, unknown>,",
    "  keys: readonly string[],",
    "): ViewExpr | undefined {",
    "  const value = pickField(input, props, keys);",
    "  return value === undefined ? undefined : normalizeExprValue(value);",
    "}",
    "",
    "function pickString(",
    "  input: Record<string, unknown>,",
    "  props: Record<string, unknown>,",
    "  keys: readonly string[],",
    "): string | undefined {",
    "  const value = pickLiteralField(input, props, keys);",
    '  return typeof value === "string" ? value : undefined;',
    "}",
    "",
    "function pickNumber(",
    "  input: Record<string, unknown>,",
    "  props: Record<string, unknown>,",
    "  keys: readonly string[],",
    "): number | undefined {",
    "  const value = pickLiteralField(input, props, keys);",
    '  return typeof value === "number" ? value : undefined;',
    "}",
    "",
    "function pickBoolean(",
    "  input: Record<string, unknown>,",
    "  props: Record<string, unknown>,",
    "  keys: readonly string[],",
    "): boolean | undefined {",
    "  const value = pickLiteralField(input, props, keys);",
    '  return typeof value === "boolean" ? value : undefined;',
    "}",
    "",
    "function normalizeChildren(input: Record<string, unknown>): readonly ViewNode[] {",
    '  return Array.isArray(input["children"])',
    '    ? input["children"].map((child) => normalizeGeneratedViewNode(child))',
    "    : [];",
    "}",
    "",
    "function normalizeNodeListField(",
    "  input: Record<string, unknown>,",
    "  props: Record<string, unknown>,",
    "  keys: readonly string[],",
    "): readonly ViewNode[] | undefined {",
    "  const value = pickField(input, props, keys);",
    "  if (Array.isArray(value)) {",
    "    return value.map((entry) => normalizeGeneratedViewNode(entry));",
    "  }",
    '  if (isRecord(value) && value["type"] !== undefined) {',
    "    return [normalizeGeneratedViewNode(value)];",
    "  }",
    "  return undefined;",
    "}",
    "",
    "function baseNodeFields(",
    "  input: Record<string, unknown>,",
    "  props: Record<string, unknown>,",
    "): ViewNodeBase & ViewStyleFields {",
    "  return {",
    '    ...(input["visible"] !== undefined ? { visible: normalizeExprValue(input["visible"]) } : {}),',
    '    ...(pickNumber(input, props, ["width"]) !== undefined',
    '      ? { width: pickNumber(input, props, ["width"]) }',
    "      : {}),",
    '    ...(pickNumber(input, props, ["height"]) !== undefined',
    '      ? { height: pickNumber(input, props, ["height"]) }',
    "      : {}),",
    '    ...(pickNumber(input, props, ["minHeight"]) !== undefined',
    '      ? { minHeight: pickNumber(input, props, ["minHeight"]) }',
    "      : {}),",
    '    ...(pickNumber(input, props, ["maxWidth"]) !== undefined',
    '      ? { maxWidth: pickNumber(input, props, ["maxWidth"]) }',
    "      : {}),",
    "  };",
    "}",
    "",
    "function normalizeScopedEvents(",
    "  input: unknown,",
    "  allowedKeys: readonly string[],",
    "): Record<string, ViewActionOrList> | undefined {",
    "  if (!isRecord(input)) return undefined;",
    "  const events: Record<string, ViewActionOrList> = {};",
    "  for (const key of allowedKeys) {",
    "    if (input[key] !== undefined) events[key] = input[key] as ViewActionOrList;",
    "  }",
    "  return Object.keys(events).length > 0 ? events : undefined;",
    "}",
    "",
    "function normalizeTableColumns(value: unknown): readonly (string | ViewTableColumn)[] | undefined {",
    "  return Array.isArray(value)",
    "    ? value.filter(",
    "        (entry): entry is string | ViewTableColumn =>",
    '          typeof entry === "string" || (isRecord(entry) && typeof entry["key"] === "string"),',
    "      )",
    "    : undefined;",
    "}",
    "",
    "function normalizeTableFilters(value: unknown): readonly (string | ViewTableFilter)[] | undefined {",
    "  return Array.isArray(value)",
    "    ? value.filter(",
    "        (entry): entry is string | ViewTableFilter =>",
    '          typeof entry === "string" || (isRecord(entry) && typeof entry["key"] === "string"),',
    "      )",
    "    : undefined;",
    "}",
    "",
    "function normalizeTableSort(value: unknown): ViewTableSort | undefined {",
    '  if (!isRecord(value) || typeof value["key"] !== "string") return undefined;',
    "  return {",
    '    key: value["key"],',
    '    ...(typeof value["direction"] === "string"',
    '      ? { direction: value["direction"] as "asc" | "desc" }',
    "      : {}),",
    "  };",
    "}",
    "",
    "function normalizeChartSeries(value: unknown): readonly (string | ViewChartSeries)[] | undefined {",
    "  return Array.isArray(value)",
    "    ? value.filter(",
    "        (entry): entry is string | ViewChartSeries =>",
    '          typeof entry === "string" ||',
    '          (isRecord(entry) && typeof entry["dataKey"] === "string"),',
    "      )",
    "    : undefined;",
    "}",
    "",
    "function normalizeSelectOptions(",
    "  value: unknown,",
    "): readonly (string | ViewSelectOptionValue)[] | undefined {",
    "  return Array.isArray(value)",
    "    ? value.filter(",
    "        (entry): entry is string | ViewSelectOptionValue =>",
    '          typeof entry === "string" ||',
    '          (isRecord(entry) && typeof entry["value"] === "string"),',
    "      )",
    "    : undefined;",
    "}",
    "",
    "function normalizeSlotValue(",
    "  input: Record<string, unknown>,",
    "  props: Record<string, unknown>,",
    "  slot: ViewNodeNormalizationSlotSpec,",
    "): unknown {",
    "  const literalValue = pickLiteralField(input, props, slot.keys);",
    "  switch (slot.kind) {",
    '    case "expr":',
    "      return pickExpr(input, props, slot.keys);",
    '    case "string":',
    "      return pickString(input, props, slot.keys);",
    '    case "number":',
    "      return pickNumber(input, props, slot.keys);",
    '    case "boolean":',
    "      return pickBoolean(input, props, slot.keys);",
    '    case "record": {',
    "      const value = pickField(input, props, slot.keys);",
    "      return isRecord(value) ? value : undefined;",
    "    }",
    '    case "unknown-array":',
    "      return Array.isArray(literalValue) ? literalValue : undefined;",
    '    case "node-list":',
    "      return normalizeNodeListField(input, props, slot.keys);",
    '    case "number-array":',
    "      return Array.isArray(literalValue)",
    '        ? literalValue.filter((entry): entry is number => typeof entry === "number")',
    "        : undefined;",
    '    case "table-columns":',
    "      return normalizeTableColumns(literalValue);",
    '    case "table-filters":',
    "      return normalizeTableFilters(literalValue);",
    '    case "table-sort":',
    "      return normalizeTableSort(literalValue);",
    '    case "chart-series":',
    "      return normalizeChartSeries(literalValue);",
    '    case "select-options":',
    "      return normalizeSelectOptions(literalValue);",
    '    case "boolean-or-number":',
    '      return typeof literalValue === "boolean" || typeof literalValue === "number"',
    "        ? literalValue",
    "        : undefined;",
    "  }",
    "}",
    "",
    "function normalizeSlotDefault(",
    "  input: Record<string, unknown>,",
    "  slot: ViewNodeNormalizationSlotSpec,",
    "): unknown {",
    '  if (slot.default === "empty-expr") return EMPTY_EXPR;',
    '  if (slot.default === "false-expr-or-bind") {',
    '    return input["bind"] !== undefined ? normalizeExprValue(input["bind"]) : FALSE_EXPR;',
    "  }",
    '  if (slot.required && slot.kind === "string") return "";',
    "  return undefined;",
    "}",
    "",
    "function normalizeSpecChildren(",
    "  children: readonly ViewNode[],",
    "  spec: ViewNodeNormalizationSpec,",
    "): readonly ViewNode[] | undefined {",
    "  if (!spec.children) return undefined;",
    '  if (spec.children.kind === "only") {',
    "    const allowed = spec.children.types ?? [];",
    "    return children.filter((child) => allowed.includes(child.type));",
    "  }",
    "  return children;",
    "}",
    "",
    "function normalizeUseOverrides(",
    "  output: Record<string, unknown>,",
    "  props: Record<string, unknown>,",
    "): void {",
    '  if (output["overrides"] !== undefined) return;',
    "  const overrides = Object.fromEntries(",
    "    Object.entries(props).filter(",
    "      ([key]) =>",
    '        key !== "name" &&',
    '        key !== "ref" &&',
    '        key !== "def" &&',
    '        key !== "overrides" &&',
    '        key !== "params",',
    "    ),",
    "  );",
    '  if (Object.keys(overrides).length > 0) output["overrides"] = overrides;',
    "}",
    "",
    "export function normalizeGeneratedViewNode(node: unknown): ViewNode {",
    "  const input = isRecord(node) ? node : {};",
    "  const props = getNodeProps(input);",
    '  const rawType = String(input["type"] ?? "rows");',
    "  const spec = ViewNodeNormalizationSpecs[rawType as ViewComponentType];",
    "  const base = baseNodeFields(input, props);",
    "  const children = normalizeChildren(input);",
    "",
    "  if (!spec) {",
    '    return { type: "rows", ...base, children } as ViewNode;',
    "  }",
    "",
    "  const output: Record<string, unknown> = { type: rawType, ...base };",
    "",
    "  if (spec.allowsBind) {",
    '    if (input["bind"] !== undefined) output["bind"] = normalizeExprValue(input["bind"]);',
    '    else if (spec.requiredBind) output["bind"] = EMPTY_LIST_EXPR;',
    "  }",
    "",
    "  for (const slot of spec.slots) {",
    "    const value = normalizeSlotValue(input, props, slot);",
    "    if (value !== undefined) {",
    "      output[slot.field] = value;",
    "      continue;",
    "    }",
    "    const defaultValue = normalizeSlotDefault(input, slot);",
    "    if (defaultValue !== undefined) output[slot.field] = defaultValue;",
    "  }",
    "",
    "  for (const slot of spec.extraFields ?? []) {",
    "    const value = normalizeSlotValue(input, props, slot);",
    "    if (value !== undefined) output[slot.field] = value;",
    "  }",
    "",
    "  const filteredChildren = normalizeSpecChildren(children, spec);",
    "  if (filteredChildren && (spec.children?.required || filteredChildren.length > 0)) {",
    '    output["children"] = filteredChildren;',
    "  }",
    "",
    '  const eventSource = isRecord(input["events"]) ? input["events"] : {};',
    "  const events = normalizeScopedEvents(eventSource, spec.events);",
    '  if (events) output["events"] = events;',
    "",
    '  if (rawType === "use") normalizeUseOverrides(output, props);',
    "",
    "  return output as unknown as ViewNode;",
    "}",
  ];
}

function normalizationSpecsCode(descriptors: readonly DescriptorFormDescriptor[]): string {
  const entries = descriptors.map((descriptor) => {
    const compileSpec = readDescriptorTreeCompileSpec(descriptor, viewComponentExtensionKey());
    const metadata = viewSpecCompileMetadata(descriptor);
    const children = compileSpec ? normalizationChildrenCode(compileSpec, metadata) : undefined;
    const slots = descriptor.slots.map((slot) =>
      normalizationSlotCode(slot, compileSpec, metadata),
    );
    const extraFields = metadata.extraNormalizeFields.map((field) =>
      objectLiteralCode({
        field: field.field,
        keys: field.keys,
        kind: field.kind,
      }),
    );

    const spec = {
      allowsBind: compileSpec?.component.allowsBind === true,
      requiredBind: metadata.requiredBind,
      slots: `[${slots.join(", ")}]`,
      ...(extraFields.length > 0 ? { extraFields: `[${extraFields.join(", ")}]` } : {}),
      ...(children ? { children } : {}),
      events: `[${[...(compileSpec?.events.values() ?? [])].map((event) => JSON.stringify(event)).join(", ")}]`,
      ...(compileSpec?.unknownPropsKind ? { unknownPropsKind: compileSpec.unknownPropsKind } : {}),
    };

    return `${JSON.stringify(descriptor.name)}: ${objectLiteralCode(spec)}`;
  });

  return `{\n${entries.map((entry) => `  ${entry},`).join("\n")}\n}`;
}

function catalogCode(descriptors: readonly DescriptorFormDescriptor[]): string {
  const entries = descriptors.map((descriptor) => {
    const compileSpec = readDescriptorTreeCompileSpec(descriptor, viewComponentExtensionKey());
    const metadata = viewSpecCompileMetadata(descriptor);
    const spec = {
      type: descriptor.name,
      ...(descriptor.doc ? { description: descriptor.doc } : {}),
      allowsBind: compileSpec?.component.allowsBind === true,
      requiredBind: metadata.requiredBind,
      ...(compileSpec?.component.positionalProp
        ? { positionalProp: compileSpec.component.positionalProp }
        : {}),
      slots: `[${descriptor.slots
        .map((slot) => catalogSlotCode(slot, descriptor, compileSpec, metadata))
        .join(", ")}]`,
      children: catalogChildrenCode(compileSpec, metadata),
      parents: `[${(compileSpec?.component.parents ?? [])
        .map((parent) => JSON.stringify(parent))
        .join(", ")}]`,
      events: `[${[...(compileSpec?.events.values() ?? [])]
        .map((event) => JSON.stringify(event))
        .join(", ")}]`,
      ...(compileSpec?.unknownPropsKind ? { unknownPropsKind: compileSpec.unknownPropsKind } : {}),
    };

    return `${JSON.stringify(descriptor.name)}: ${objectLiteralCode(spec)}`;
  });

  return `{\n${entries.map((entry) => `  ${entry},`).join("\n")}\n}`;
}

function catalogSlotCode(
  slot: DescriptorSlotSpec,
  descriptor: DescriptorFormDescriptor,
  compileSpec: DescriptorTreeCompileSpec | undefined,
  metadata: ViewSpecCompileMetadata,
): string {
  const slotCompileSpec = compileSpec?.slots.get(toCamelCase(slot.name));
  const field = slotCompileSpec?.field ?? toCamelCase(slot.name);
  const aliases = new Set<string>([...(slot.aliases ?? []), ...(slotCompileSpec?.aliases ?? [])]);
  const values = literalValuesForSlot(slot, descriptor);
  return objectLiteralCode({
    name: slot.name,
    field,
    kind: normalizationSlotKind(slot, slotCompileSpec, metadata),
    required: slot.required === true,
    many: slot.many === true,
    aliases: [...aliases],
    ...(values ? { values: [...values] } : {}),
    ...(slot.doc ? { description: slot.doc } : {}),
  });
}

function catalogChildrenCode(
  compileSpec: DescriptorTreeCompileSpec | undefined,
  metadata: ViewSpecCompileMetadata,
): string {
  const children = compileSpec?.component.children;
  if (!children || children.kind === "none") {
    return objectLiteralCode({ kind: "none", required: false });
  }
  if (children.kind === "only") {
    return objectLiteralCode({
      kind: "only",
      required: metadata.requiredChildren,
      types: `[${children.types.map((type) => JSON.stringify(type)).join(", ")}]`,
    });
  }
  return objectLiteralCode({ kind: "any", required: metadata.requiredChildren });
}

function normalizationChildrenCode(
  compileSpec: DescriptorTreeCompileSpec,
  metadata: ViewSpecCompileMetadata,
): string | undefined {
  const children = compileSpec.component.children;
  if (!children || children.kind === "none") return undefined;

  const spec: Record<string, unknown> = {
    kind: children.kind,
    required: metadata.requiredChildren,
  };
  if (children.kind === "only") {
    spec["types"] = `[${children.types.map((type) => JSON.stringify(type)).join(", ")}]`;
  }
  return objectLiteralCode(spec);
}

function normalizationSlotCode(
  slot: DescriptorSlotSpec,
  compileSpec: DescriptorTreeCompileSpec | undefined,
  metadata: ViewSpecCompileMetadata,
): string {
  const slotCompileSpec = compileSpec?.slots.get(toCamelCase(slot.name));
  const field = slotCompileSpec?.field ?? toCamelCase(slot.name);
  const defaultKind = metadata.slotDefaults.get(slot.name);
  return objectLiteralCode({
    field,
    keys: normalizationKeys(field, slot, slotCompileSpec),
    kind: normalizationSlotKind(slot, slotCompileSpec, metadata),
    ...(slot.required ? { required: true } : {}),
    ...(defaultKind ? { default: defaultKind } : {}),
  });
}

function normalizationKeys(
  field: string,
  slot: DescriptorSlotSpec,
  slotCompileSpec: DescriptorTreeSlotCompileSpec | undefined,
): readonly string[] {
  const keys = new Set<string>();
  keys.add(field);
  keys.add(slot.name);
  keys.add(toCamelCase(slot.name));
  for (const alias of slot.aliases ?? []) {
    keys.add(alias);
    keys.add(toCamelCase(alias));
  }
  for (const alias of slotCompileSpec?.aliases ?? []) {
    keys.add(alias);
    keys.add(toCamelCase(alias));
  }
  return [...keys];
}

function normalizationSlotKind(
  slot: DescriptorSlotSpec,
  slotCompileSpec: DescriptorTreeSlotCompileSpec | undefined,
  metadata: ViewSpecCompileMetadata,
): string {
  const override = metadata.slotNormalizeKinds.get(slot.name);
  if (override) return override;
  if (slotCompileSpec?.kind === "node-list") return "node-list";
  if (slot.mode === "expr") return "expr";
  if (slotCompileSpec?.kind === "json" || slot.type === "Object") return "record";

  switch (slot.type ?? slot.typeFrom) {
    case "String":
    case "Str":
    case "Symbol":
      return "string";
    case "Number":
    case "Num":
    case "Int":
    case "Float":
      return "number";
    case "Boolean":
    case "Bool":
      return "boolean";
    case "Array":
      return "unknown-array";
    case "Object":
      return "record";
    default:
      return "expr";
  }
}

function objectLiteralCode(value: Readonly<Record<string, unknown>>): string {
  return `{ ${Object.entries(value)
    .map(([key, entry]) => `${safeFieldName(key)}: ${literalCode(entry)}`)
    .join(", ")} }`;
}

function literalCode(value: unknown): string {
  if (typeof value === "string") {
    if (value.startsWith("[") || value.startsWith("{")) return value;
    return JSON.stringify(value);
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => literalCode(entry)).join(", ")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return objectLiteralCode(value as Readonly<Record<string, unknown>>);
  }
  return "undefined";
}

function interfaceSlotFields(
  descriptor: DescriptorFormDescriptor,
  compileSpec: DescriptorTreeCompileSpec | undefined,
): string[] {
  return descriptor.slots.map((slot) => {
    const slotCompileSpec = compileSpec?.slots.get(toCamelCase(slot.name));
    const field = slotCompileSpec?.field ?? toCamelCase(slot.name);
    const type = tsSlotType(slot, descriptor, slotCompileSpec);
    return slot.required
      ? `readonly ${safeFieldName(field)}: ${type};`
      : `readonly ${safeFieldName(field)}?: ${type} | undefined;`;
  });
}

function schemaSlotFields(
  descriptor: DescriptorFormDescriptor,
  compileSpec: DescriptorTreeCompileSpec | undefined,
): string[] {
  return descriptor.slots.map((slot) => {
    const slotCompileSpec = compileSpec?.slots.get(toCamelCase(slot.name));
    const field = slotCompileSpec?.field ?? toCamelCase(slot.name);
    const schema = schemaSlotType(slot, descriptor, slotCompileSpec);
    return slot.required
      ? `${safeFieldName(field)}: ${schema},`
      : `${safeFieldName(field)}: Schema.optional(${schema}),`;
  });
}

function tsSlotType(
  slot: DescriptorSlotSpec,
  descriptor: DescriptorFormDescriptor,
  slotCompileSpec: DescriptorTreeSlotCompileSpec | undefined,
): string {
  const override = viewSpecCompileMetadata(descriptor).slotTypeOverrides.get(slot.name);
  if (override) return tsProtocolType(override);

  const literalUnion = literalUnionType(slot, descriptor);
  if (literalUnion) return slot.many ? `readonly (${literalUnion})[]` : literalUnion;

  if (slotCompileSpec?.kind === "json") return "unknown";
  if (slotCompileSpec?.kind === "node-list") return `readonly ${NODE_TYPE}[]`;

  let type: string;
  if (slot.mode === "expr") {
    type = "ViewExpr";
  } else if (slot.mode === "form") {
    type = NODE_TYPE;
  } else {
    type = tsPrimitiveType(slot);
  }

  return slot.many ? `readonly ${type}[]` : type;
}

function schemaSlotType(
  slot: DescriptorSlotSpec,
  descriptor: DescriptorFormDescriptor,
  slotCompileSpec: DescriptorTreeSlotCompileSpec | undefined,
): string {
  const override = viewSpecCompileMetadata(descriptor).slotTypeOverrides.get(slot.name);
  if (override) return schemaProtocolType(override);

  const literalValues = literalValuesForSlot(slot, descriptor);
  if (literalValues) {
    const schema = `Schema.Literal(${literalValues.map((value) => JSON.stringify(value)).join(", ")})`;
    return slot.many ? `Schema.Array(${schema})` : schema;
  }

  if (slotCompileSpec?.kind === "json") return "Schema.Unknown";
  if (slotCompileSpec?.kind === "node-list") return nodeArraySchema();

  let schema: string;
  if (slot.mode === "expr") {
    schema = "ViewExpression";
  } else if (slot.mode === "form") {
    schema = nodeSchema();
  } else {
    schema = schemaPrimitiveType(slot);
  }

  return slot.many ? `Schema.Array(${schema})` : schema;
}

function tsPrimitiveType(slot: DescriptorSlotSpec): string {
  switch (slot.type ?? slot.typeFrom) {
    case "String":
    case "Str":
    case "Symbol":
      return "string";
    case "Number":
    case "Num":
    case "Int":
    case "Float":
      return "number";
    case "Boolean":
    case "Bool":
      return "boolean";
    case "Array":
      return "readonly unknown[]";
    case "Object":
      return "Record<string, unknown>";
    default:
      return "unknown";
  }
}

function schemaPrimitiveType(slot: DescriptorSlotSpec): string {
  switch (slot.type ?? slot.typeFrom) {
    case "String":
    case "Str":
    case "Symbol":
      return "Schema.String";
    case "Number":
    case "Num":
    case "Int":
    case "Float":
      return "Schema.Number";
    case "Boolean":
    case "Bool":
      return "Schema.Boolean";
    case "Array":
      return "Schema.Array(Schema.Unknown)";
    case "Object":
      return "Schema.Record({ key: Schema.String, value: Schema.Unknown })";
    default:
      return "Schema.Unknown";
  }
}

function childrenType(compileSpec: DescriptorTreeCompileSpec): string | undefined {
  const children = compileSpec.component.children;
  if (!children || children.kind === "none") return undefined;
  if (children.kind === "any") return `readonly ${NODE_TYPE}[]`;
  return `readonly (${children.types.map((type) => interfaceName(type)).join(" | ")})[]`;
}

function childrenSchema(compileSpec: DescriptorTreeCompileSpec): string | undefined {
  const children = compileSpec.component.children;
  if (!children || children.kind === "none") return undefined;
  return nodeArraySchema();
}

function eventMapType(compileSpec: DescriptorTreeCompileSpec): string | undefined {
  if (compileSpec.events.size === 0) return undefined;
  return `{ ${[...compileSpec.events.values()]
    .map((eventField) => `readonly ${safeFieldName(eventField)}?: ViewActionOrList | undefined`)
    .join("; ")} }`;
}

function eventMapSchema(compileSpec: DescriptorTreeCompileSpec): string | undefined {
  if (compileSpec.events.size === 0) return undefined;
  return `Schema.Struct({ ${[...compileSpec.events.values()]
    .map((eventField) => `${safeFieldName(eventField)}: Schema.optional(ViewActionOrListSchema)`)
    .join(", ")} })`;
}

function nodeSchema(): string {
  return `Schema.suspend((): Schema.Schema<${NODE_TYPE}> => ${NODE_SCHEMA})`;
}

function nodeArraySchema(): string {
  return `Schema.Array(${nodeSchema()})`;
}

function literalUnionType(
  slot: DescriptorSlotSpec,
  descriptor: DescriptorFormDescriptor,
): string | undefined {
  const values = literalValuesForSlot(slot, descriptor);
  return values?.map((value) => JSON.stringify(value)).join(" | ");
}

function literalValuesForSlot(
  slot: DescriptorSlotSpec,
  descriptor: DescriptorFormDescriptor,
): readonly string[] | undefined {
  if (descriptor.validation.kind !== "static" && descriptor.validation.kind !== "composite") {
    return undefined;
  }

  const check = descriptor.validation.checks.find(
    (candidate): candidate is DescriptorValidationCheck & { values: readonly string[] } =>
      candidate.kind === "one-of" &&
      candidate.slot === slot.name &&
      Array.isArray(candidate.values) &&
      candidate.values.length > 0,
  );

  return check?.values;
}

function interfaceName(name: string): string {
  if (name === "view-ref") return "ViewRefNode";
  return `View${toPascalCase(name)}Node`;
}

function schemaName(name: string): string {
  return `${interfaceName(name)}Schema`;
}

function toPascalCase(value: string): string {
  return value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

function toCamelCase(value: string): string {
  return value.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase());
}

function hasEmittedField(
  descriptor: DescriptorFormDescriptor,
  fieldName: string,
  compileSpec: DescriptorTreeCompileSpec | undefined,
): boolean {
  return descriptor.slots.some((slot) => {
    const slotCompileSpec = compileSpec?.slots.get(toCamelCase(slot.name));
    return (slotCompileSpec?.field ?? toCamelCase(slot.name)) === fieldName;
  });
}

export const VIEW_PROTOCOL_GENERATED_SOURCES = [
  {
    path: EXPRESSION_OUTPUT_FILE,
    render: generateViewSpecExpressionModule,
  },
  {
    path: ACTION_OUTPUT_FILE,
    render: generateViewSpecActionModule,
  },
  {
    path: EVENT_OUTPUT_FILE,
    render: generateViewSpecEventModule,
  },
  {
    path: OUTPUT_FILE,
    render: generateViewSpecViewNodeModule,
  },
  {
    path: STATE_OUTPUT_FILE,
    render: generateViewSpecStateModule,
  },
  {
    path: SPEC_OUTPUT_FILE,
    render: generateViewSpecEnvelopeModule,
  },
] as const;

export function writeGeneratedViewProtocolModules(): void {
  mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
  for (const source of VIEW_PROTOCOL_GENERATED_SOURCES) {
    writeFileSync(source.path, source.render(), "utf8");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeGeneratedViewProtocolModules();
}
