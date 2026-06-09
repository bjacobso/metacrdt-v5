import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import {
  findDescriptorTreeProtocolRegistry,
  parsePrelude as parseDescriptorPrelude,
  readDescriptorTreeCompileSpec,
  type DescriptorTreeCompileSpec,
  type DescriptorTreeSlotCompileSpec,
  type FormDescriptor as DescriptorFormDescriptor,
} from "@forma/ts/descriptor";

const PACKAGE_DIR = resolve(import.meta.dirname, "..");
// Preludes live inside this package (packages/views/preludes).
const REPO_ROOT = PACKAGE_DIR;
const UI_PRELUDE_FILE = resolve(REPO_ROOT, "preludes/ui.lisp");
const VIEWSPEC_PRELUDE_FILE = resolve(REPO_ROOT, "preludes/viewspec.lisp");
const VIEWSPEC_PROTOCOL_PRELUDE_FILE = resolve(REPO_ROOT, "preludes/viewspec-protocol.lisp");

export interface ViewSpecIrSnapshotTarget {
  readonly name: string;
  readonly preludeFile: string;
  readonly snapshotFile: string;
}

export interface ViewSpecSlotCompileSnapshot extends DescriptorTreeSlotCompileSpec {
  readonly key: string;
}

export interface ViewSpecCompileSnapshot {
  readonly name: string;
  readonly component: DescriptorTreeCompileSpec["component"];
  readonly slots: readonly ViewSpecSlotCompileSnapshot[];
  readonly aliases: readonly [string, string][];
  readonly events: readonly [string, string][];
  readonly unknownPropsKind?: DescriptorTreeCompileSpec["unknownPropsKind"];
}

export interface ViewSpecIrSnapshot {
  readonly source: string;
  readonly descriptors: readonly DescriptorFormDescriptor[];
  readonly compileSpecs: readonly ViewSpecCompileSnapshot[];
}

export const VIEWSPEC_IR_SNAPSHOT_TARGETS: readonly ViewSpecIrSnapshotTarget[] = [
  {
    name: "view-node",
    preludeFile: `${UI_PRELUDE_FILE}:${VIEWSPEC_PRELUDE_FILE}`,
    snapshotFile: resolve(PACKAGE_DIR, "snapshots/viewspec-ir/view-node.viewspec-ir.json"),
  },
];

function readPreludeFiles(preludeFile: string): string {
  return preludeFile
    .split(":")
    .map((file) => readFileSync(file, "utf8"))
    .join("\n\n");
}

function formatPreludeFiles(preludeFile: string): string {
  return preludeFile
    .split(":")
    .map((file) => relative(REPO_ROOT, file))
    .join(" + ");
}

function viewComponentExtensionKey(): string {
  const registry = findDescriptorTreeProtocolRegistry(
    parseDescriptorPrelude(readFileSync(VIEWSPEC_PROTOCOL_PRELUDE_FILE, "utf8")).forms,
  );
  if (!registry) throw new Error("missing descriptor tree protocol registry");
  return registry.componentExtension;
}

export function buildViewSpecIrSnapshot(target: ViewSpecIrSnapshotTarget): ViewSpecIrSnapshot {
  const descriptors = parseDescriptorPrelude(readPreludeFiles(target.preludeFile)).forms;

  return {
    source: formatPreludeFiles(target.preludeFile),
    descriptors,
    compileSpecs: descriptors.flatMap((descriptor) => {
      const spec = readDescriptorTreeCompileSpec(descriptor, viewComponentExtensionKey());
      return spec ? [compileSpecSnapshot(descriptor.name, spec)] : [];
    }),
  };
}

export function renderViewSpecIrSnapshot(snapshot: ViewSpecIrSnapshot): string {
  return JSON.stringify(snapshot, null, 2) + "\n";
}

export function writeViewSpecIrSnapshot(target: ViewSpecIrSnapshotTarget): void {
  mkdirSync(dirname(target.snapshotFile), { recursive: true });
  writeFileSync(target.snapshotFile, renderViewSpecIrSnapshot(buildViewSpecIrSnapshot(target)));
}

function compileSpecSnapshot(
  name: string,
  spec: DescriptorTreeCompileSpec,
): ViewSpecCompileSnapshot {
  return {
    name,
    component: spec.component,
    slots: [...spec.slots.entries()].map(([key, slot]) => ({ key, ...slot })),
    aliases: [...spec.aliases.entries()],
    events: [...spec.events.entries()],
    ...(spec.unknownPropsKind !== undefined ? { unknownPropsKind: spec.unknownPropsKind } : {}),
  };
}
