export interface AbiRequest {
  readonly op: string;
  readonly sourceId?: string;
  readonly sourceIds?: readonly string[];
  readonly source?: string;
  readonly sourceBundle?: readonly SourceBundleItem[];
  readonly sessionId?: string;
  readonly backend?: string;
  readonly token?: number;
  readonly offset?: number;
}

export interface SourceBundleItem {
  readonly kind: string;
  readonly sourceId: string;
  readonly source: string;
}

export interface AbiResponse {
  readonly ok?: boolean;
  readonly value?: unknown;
  readonly type?: string;
  readonly diagnostics?: readonly AbiDiagnostic[];
  readonly [key: string]: unknown;
}

export interface AbiDiagnostic {
  readonly span?: AbiSpan | null;
  readonly severity?: "error" | "warning" | "information" | "hint" | string;
  readonly code?: string;
  readonly message?: string;
}

export interface AbiSpan {
  readonly sourceId?: string;
  readonly startOffset?: number;
  readonly endOffset?: number;
}

export interface CstSpan {
  readonly sourceId: string;
  readonly startOffset: number;
  readonly endOffset: number;
}

export type CstExpr =
  | {
      readonly kind: "nil";
      readonly span: CstSpan;
    }
  | {
      readonly kind: "bool" | "int" | "float" | "string" | "symbol" | "keyword";
      readonly span: CstSpan;
      readonly value: boolean | number | string;
    }
  | {
      readonly kind: "list" | "vector";
      readonly span: CstSpan;
      readonly items: readonly CstExpr[];
    }
  | {
      readonly kind: "map";
      readonly span: CstSpan;
      readonly entries: readonly {
        readonly key: CstExpr;
        readonly value: CstExpr;
      }[];
    };

export interface SymbolDefinition {
  readonly name: string;
  readonly uri: string;
  readonly span: CstSpan;
  readonly detail: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readString(object: Record<string, unknown>, key: string): string | undefined {
  const value = object[key];
  return typeof value === "string" ? value : undefined;
}

export function readNestedString(
  object: Record<string, unknown>,
  path: readonly [string, string],
): string | undefined {
  const container = object[path[0]];
  if (!isRecord(container)) return undefined;
  return readString(container, path[1]);
}

export function asCstExprArray(value: unknown): readonly CstExpr[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isCstExpr);
}

export function isCstExpr(value: unknown): value is CstExpr {
  if (!isRecord(value)) return false;
  const kind = value["kind"];
  const span = value["span"];
  if (typeof kind !== "string" || !isSpan(span)) return false;
  switch (kind) {
    case "nil":
      return true;
    case "bool":
      return typeof value["value"] === "boolean";
    case "int":
    case "float":
      return typeof value["value"] === "number";
    case "string":
    case "symbol":
    case "keyword":
      return typeof value["value"] === "string";
    case "list":
    case "vector":
      return Array.isArray(value["items"]) && value["items"].every(isCstExpr);
    case "map":
      return (
        Array.isArray(value["entries"]) &&
        value["entries"].every(
          (entry) => isRecord(entry) && isCstExpr(entry["key"]) && isCstExpr(entry["value"]),
        )
      );
    default:
      return false;
  }
}

function isSpan(value: unknown): value is CstSpan {
  return (
    isRecord(value) &&
    typeof value["sourceId"] === "string" &&
    typeof value["startOffset"] === "number" &&
    typeof value["endOffset"] === "number"
  );
}
