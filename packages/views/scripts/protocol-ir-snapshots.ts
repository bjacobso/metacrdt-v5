import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  buildProtocolEnumDescriptors,
  buildProtocolCatalogDescriptors,
  buildProtocolModuleDescriptors,
  buildProtocolObjectDescriptors,
  buildProtocolTypeAliasDescriptors,
  buildProtocolUnionDescriptors,
  parsePrelude as parseDescriptorPrelude,
  protocolEnumsForModule,
  protocolObjectsForModule,
  protocolTypeAliasesForModule,
  protocolUnionsForModule,
  requiredProtocolModule,
  type ProtocolEnumDescriptor,
  type ProtocolCatalogDescriptor,
  type ProtocolModuleDescriptor,
  type ProtocolObjectDescriptor,
  type ProtocolTypeAliasDescriptor,
  type ProtocolUnionDescriptor,
} from "@forma/ts/descriptor";

const PACKAGE_DIR = resolve(import.meta.dirname, "..");
// Preludes live inside this package (packages/views/preludes).
const REPO_ROOT = PACKAGE_DIR;
const VIEWSPEC_PROTOCOL_PRELUDE_FILE = resolve(REPO_ROOT, "preludes/viewspec-protocol.lisp");

export interface ProtocolIrSnapshotTarget {
  readonly name: string;
  readonly moduleName: string;
  readonly preludeFile: string;
  readonly snapshotFile: string;
}

export interface ProtocolIrSnapshot {
  readonly source: string;
  readonly module: ProtocolModuleDescriptor;
  readonly typeAliases: readonly ProtocolTypeAliasDescriptor[];
  readonly enums: readonly ProtocolEnumDescriptor[];
  readonly objects: readonly ProtocolObjectDescriptor[];
  readonly unions: readonly ProtocolUnionDescriptor[];
  readonly catalogs: readonly ProtocolCatalogDescriptor[];
}

export const PROTOCOL_IR_SNAPSHOT_TARGETS: readonly ProtocolIrSnapshotTarget[] = [
  {
    name: "view-expression",
    moduleName: "ViewExpression",
    preludeFile: VIEWSPEC_PROTOCOL_PRELUDE_FILE,
    snapshotFile: resolve(PACKAGE_DIR, "snapshots/protocol-ir/view-expression.protocol-ir.json"),
  },
  {
    name: "view-action",
    moduleName: "ViewAction",
    preludeFile: VIEWSPEC_PROTOCOL_PRELUDE_FILE,
    snapshotFile: resolve(PACKAGE_DIR, "snapshots/protocol-ir/view-action.protocol-ir.json"),
  },
  {
    name: "view-event",
    moduleName: "ViewEvent",
    preludeFile: VIEWSPEC_PROTOCOL_PRELUDE_FILE,
    snapshotFile: resolve(PACKAGE_DIR, "snapshots/protocol-ir/view-event.protocol-ir.json"),
  },
  {
    name: "view-state",
    moduleName: "ViewState",
    preludeFile: VIEWSPEC_PROTOCOL_PRELUDE_FILE,
    snapshotFile: resolve(PACKAGE_DIR, "snapshots/protocol-ir/view-state.protocol-ir.json"),
  },
  {
    name: "view-node-support",
    moduleName: "ViewNodeSupport",
    preludeFile: VIEWSPEC_PROTOCOL_PRELUDE_FILE,
    snapshotFile: resolve(PACKAGE_DIR, "snapshots/protocol-ir/view-node-support.protocol-ir.json"),
  },
  {
    name: "view-spec",
    moduleName: "ViewSpec",
    preludeFile: VIEWSPEC_PROTOCOL_PRELUDE_FILE,
    snapshotFile: resolve(PACKAGE_DIR, "snapshots/protocol-ir/view-spec.protocol-ir.json"),
  },
];

export function buildProtocolIrSnapshot(target: ProtocolIrSnapshotTarget): ProtocolIrSnapshot {
  const descriptors = parseDescriptorPrelude(readFileSync(target.preludeFile, "utf8")).forms;
  const typeAliases = buildProtocolTypeAliasDescriptors(descriptors);
  const enums = buildProtocolEnumDescriptors(descriptors);
  const objects = buildProtocolObjectDescriptors(descriptors);
  const unions = buildProtocolUnionDescriptors(descriptors);
  const catalogs = buildProtocolCatalogDescriptors(descriptors);
  const module = requiredProtocolModule(
    buildProtocolModuleDescriptors(descriptors),
    target.moduleName,
  );

  return {
    source: relative(REPO_ROOT, target.preludeFile),
    module,
    typeAliases: protocolTypeAliasesForModule(module, typeAliases),
    enums: protocolEnumsForModule(module, enums),
    objects: protocolObjectsForModule(module, objects),
    unions: protocolUnionsForModule(module, unions),
    catalogs,
  };
}

export function renderProtocolIrSnapshot(snapshot: ProtocolIrSnapshot): string {
  return JSON.stringify(snapshot, null, 2) + "\n";
}

export function writeProtocolIrSnapshot(target: ProtocolIrSnapshotTarget): void {
  mkdirSync(dirname(target.snapshotFile), { recursive: true });
  writeFileSync(target.snapshotFile, renderProtocolIrSnapshot(buildProtocolIrSnapshot(target)));
}
