import { canonicalBytes, sha256, type Value } from "@metacrdt/core";
import { Data, Effect } from "effect";

export type JsonPrimitive = null | boolean | number | string;

export type JsonObject = {
  readonly [key: string]: JsonValue;
};

export type JsonArray = readonly JsonValue[];

export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export type JsonPathSegment = string | number;

export type JsonPath = readonly JsonPathSegment[];

export type MerkleHash = string;

export type MerkleNodeKind = "leaf" | "array" | "object";

export type MerkleLeafNode = {
  readonly kind: "leaf";
  readonly path: JsonPath;
  readonly pointer: string;
  readonly hash: MerkleHash;
  readonly value: JsonPrimitive;
};

export type MerkleArrayNode = {
  readonly kind: "array";
  readonly path: JsonPath;
  readonly pointer: string;
  readonly hash: MerkleHash;
  readonly length: number;
  readonly children: readonly JsonMerkleNode[];
};

export type MerkleObjectEntry = {
  readonly key: string;
  readonly node: JsonMerkleNode;
};

export type MerkleObjectNode = {
  readonly kind: "object";
  readonly path: JsonPath;
  readonly pointer: string;
  readonly hash: MerkleHash;
  readonly children: readonly MerkleObjectEntry[];
};

export type JsonMerkleNode = MerkleLeafNode | MerkleArrayNode | MerkleObjectNode;

export type MerklePiece = {
  readonly kind: MerkleNodeKind;
  readonly path: JsonPath;
  readonly pointer: string;
  readonly hash: MerkleHash;
  readonly childHashes: readonly MerkleChildHash[];
  readonly value?: JsonPrimitive;
};

export type MerkleChildHash =
  | {
      readonly kind: "index";
      readonly index: number;
      readonly hash: MerkleHash;
    }
  | {
      readonly kind: "key";
      readonly key: string;
      readonly hash: MerkleHash;
    };

export type MerkleDiffEntry = {
  readonly pointer: string;
  readonly path: JsonPath;
  readonly beforeHash?: MerkleHash;
  readonly afterHash?: MerkleHash;
};

export type MerkleValidationIssue = {
  readonly reason: "cycle" | "nonJsonValue" | "nonFiniteNumber" | "sparseArray";
  readonly path: JsonPath;
  readonly message: string;
};

export class MerkleTreeError extends Data.TaggedError("MerkleTreeError")<{
  readonly issue: MerkleValidationIssue;
}> {}

const DOMAIN = "metacrdt.effect-merktree.v1";

function hex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out;
}

function hashValue(value: Value): MerkleHash {
  return hex(sha256(canonicalBytes(value)));
}

function hashLeaf(value: JsonPrimitive): MerkleHash {
  return hashValue({
    domain: DOMAIN,
    kind: "leaf",
    value,
  });
}

function hashArray(children: readonly JsonMerkleNode[]): MerkleHash {
  return hashValue({
    domain: DOMAIN,
    kind: "array",
    children: children.map((child) => child.hash),
  });
}

function hashObject(children: readonly MerkleObjectEntry[]): MerkleHash {
  return hashValue({
    domain: DOMAIN,
    kind: "object",
    children: children.map(({ key, node }) => [key, node.hash]),
  });
}

function pathPointer(path: JsonPath): string {
  if (path.length === 0) return "";
  return path.map((segment) => `/${escapePointerSegment(String(segment))}`).join("");
}

function escapePointerSegment(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function isJsonObjectRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validationIssue(
  reason: MerkleValidationIssue["reason"],
  path: JsonPath,
  message: string,
): MerkleTreeError {
  return new MerkleTreeError({
    issue: {
      reason,
      path,
      message,
    },
  });
}

function validateJsonValue(
  input: unknown,
  path: JsonPath,
  seen: WeakSet<object>,
): MerkleTreeError | undefined {
  if (input === null) return undefined;

  switch (typeof input) {
    case "string":
    case "boolean":
      return undefined;
    case "number":
      return Number.isFinite(input)
        ? undefined
        : validationIssue("nonFiniteNumber", path, "JSON numbers must be finite.");
    case "object":
      break;
    default:
      return validationIssue(
        "nonJsonValue",
        path,
        `Unsupported JSON value type: ${typeof input}.`,
      );
  }

  if (seen.has(input)) {
    return validationIssue("cycle", path, "JSON documents cannot contain cycles.");
  }

  seen.add(input);

  if (Array.isArray(input)) {
    for (let index = 0; index < input.length; index++) {
      if (!(index in input)) {
        return validationIssue("sparseArray", [...path, index], "JSON arrays cannot be sparse.");
      }
      const issue = validateJsonValue(input[index], [...path, index], seen);
      if (issue !== undefined) return issue;
    }
    seen.delete(input);
    return undefined;
  }

  if (!isJsonObjectRecord(input)) {
    seen.delete(input);
    return validationIssue("nonJsonValue", path, "Unsupported object value.");
  }

  for (const key of Object.keys(input)) {
    const issue = validateJsonValue(input[key], [...path, key], seen);
    if (issue !== undefined) return issue;
  }

  seen.delete(input);
  return undefined;
}

function assertJsonValue(input: unknown): asserts input is JsonValue {
  const issue = validateJsonValue(input, [], new WeakSet<object>());
  if (issue !== undefined) throw issue;
}

function buildNode(value: JsonValue, path: JsonPath): JsonMerkleNode {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return {
      kind: "leaf",
      path,
      pointer: pathPointer(path),
      hash: hashLeaf(value),
      value,
    };
  }

  if (Array.isArray(value)) {
    const children = value.map((child, index) => buildNode(child, [...path, index]));
    return {
      kind: "array",
      path,
      pointer: pathPointer(path),
      hash: hashArray(children),
      length: children.length,
      children,
    };
  }

  const objectValue = value as JsonObject;
  const children = Object.keys(objectValue)
    .sort()
    .map((key) => ({
      key,
      node: buildNode(objectValue[key]!, [...path, key]),
    }));

  return {
    kind: "object",
    path,
    pointer: pathPointer(path),
    hash: hashObject(children),
    children,
  };
}

export function buildJsonMerkleTree(document: JsonValue): JsonMerkleNode {
  assertJsonValue(document);
  return buildNode(document, []);
}

export function buildJsonMerkleTreeFromUnknown(document: unknown): JsonMerkleNode {
  assertJsonValue(document);
  return buildJsonMerkleTree(document);
}

export function buildJsonMerkleTreeEffect(
  document: unknown,
): Effect.Effect<JsonMerkleNode, MerkleTreeError> {
  return Effect.try({
    try: () => buildJsonMerkleTreeFromUnknown(document),
    catch: (error) =>
      error instanceof MerkleTreeError
        ? error
        : validationIssue("nonJsonValue", [], String(error)),
  });
}

export function flattenMerkleTree(tree: JsonMerkleNode): readonly MerklePiece[] {
  const out: MerklePiece[] = [];
  visit(tree, out);
  return out;
}

function visit(node: JsonMerkleNode, out: MerklePiece[]): void {
  out.push(pieceOf(node));

  if (node.kind === "array") {
    for (const child of node.children) visit(child, out);
  } else if (node.kind === "object") {
    for (const child of node.children) visit(child.node, out);
  }
}

function pieceOf(node: JsonMerkleNode): MerklePiece {
  if (node.kind === "leaf") {
    return {
      kind: "leaf",
      path: node.path,
      pointer: node.pointer,
      hash: node.hash,
      childHashes: [],
      value: node.value,
    };
  }

  if (node.kind === "array") {
    return {
      kind: "array",
      path: node.path,
      pointer: node.pointer,
      hash: node.hash,
      childHashes: node.children.map((child, index) => ({
        kind: "index",
        index,
        hash: child.hash,
      })),
    };
  }

  return {
    kind: "object",
    path: node.path,
    pointer: node.pointer,
    hash: node.hash,
    childHashes: node.children.map(({ key, node: child }) => ({
      kind: "key",
      key,
      hash: child.hash,
    })),
  };
}

export function indexMerklePieces(
  pieces: readonly MerklePiece[],
): ReadonlyMap<string, MerklePiece> {
  return new Map(pieces.map((piece) => [piece.pointer, piece]));
}

export function diffMerkleTrees(
  before: JsonMerkleNode,
  after: JsonMerkleNode,
): readonly MerkleDiffEntry[] {
  if (before.hash === after.hash) return [];

  const changes: MerkleDiffEntry[] = [];
  diffNode(before, after, changes);
  return changes;
}

function diffNode(
  before: JsonMerkleNode | undefined,
  after: JsonMerkleNode | undefined,
  changes: MerkleDiffEntry[],
): void {
  if (before?.hash === after?.hash) return;
  if (before === undefined && after === undefined) return;

  if (before === undefined) {
    const inserted = after;
    if (inserted === undefined) return;
    changes.push({
      pointer: inserted.pointer,
      path: inserted.path,
      afterHash: inserted.hash,
    });
    return;
  }

  if (after === undefined) {
    changes.push({
      pointer: before.pointer,
      path: before.path,
      beforeHash: before.hash,
    });
    return;
  }

  if (before.kind !== after.kind) {
    changes.push({
      pointer: after.pointer,
      path: after.path,
      beforeHash: before.hash,
      afterHash: after.hash,
    });
    return;
  }

  if (before.kind === "leaf" || after.kind === "leaf") {
    changes.push({
      pointer: after.pointer,
      path: after.path,
      beforeHash: before.hash,
      afterHash: after.hash,
    });
    return;
  }

  if (before.kind === "array" && after.kind === "array") {
    const length = Math.max(before.children.length, after.children.length);
    for (let index = 0; index < length; index++) {
      diffNode(before.children[index], after.children[index], changes);
    }
    return;
  }

  if (before.kind === "object" && after.kind === "object") {
    const beforeChildren = new Map(before.children.map(({ key, node }) => [key, node]));
    const afterChildren = new Map(after.children.map(({ key, node }) => [key, node]));
    const keys = new Set([...beforeChildren.keys(), ...afterChildren.keys()]);

    for (const key of [...keys].sort()) {
      diffNode(beforeChildren.get(key), afterChildren.get(key), changes);
    }
  }
}
