import {
  CompletionItemKind,
  InsertTextFormat,
  type CompletionItem,
  type CompletionList,
  type CompletionParams,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { positionToOffset } from "../document.js";
import { isRecord } from "../protocol.js";
import type { OcamlWorkspaceSession } from "../session.js";
import { editorValue } from "../session.js";

export async function getCompletions(
  session: OcamlWorkspaceSession,
  document: TextDocument,
  params: CompletionParams,
): Promise<CompletionList> {
  const offset = positionToOffset(document, params.position);
  const response = await session.editorCompletion(document, offset);
  const rawItems = editorValue(response)["items"];
  const items = Array.isArray(rawItems) ? rawItems : [];

  return {
    isIncomplete: false,
    items: items.filter(isRecord).map(toCompletionItem),
  };
}

function toCompletionItem(item: Record<string, unknown>): CompletionItem {
  const label = typeof item["label"] === "string" ? item["label"] : String(item["label"]);
  return {
    label,
    kind: completionKind(item["kind"]),
    insertTextFormat: InsertTextFormat.PlainText,
    ...(typeof item["detail"] === "string" ? { detail: item["detail"] } : {}),
  };
}

function completionKind(kind: unknown): CompletionItemKind {
  switch (kind) {
    case "form":
    case "function":
      return CompletionItemKind.Function;
    case "keyword":
      return CompletionItemKind.EnumMember;
    case "type":
      return CompletionItemKind.TypeParameter;
    default:
      return CompletionItemKind.Variable;
  }
}
