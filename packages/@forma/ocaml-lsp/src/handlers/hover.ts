import { MarkupKind, type Hover, type HoverParams } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { positionToOffset, spanToRange } from "../document.js";
import { isRecord, type CstSpan } from "../protocol.js";
import type { OcamlWorkspaceSession } from "../session.js";
import { editorValue } from "../session.js";

export async function getHover(
  session: OcamlWorkspaceSession,
  document: TextDocument,
  params: HoverParams,
): Promise<Hover | null> {
  const offset = positionToOffset(document, params.position);
  const response = await session.editorHover(document, offset);
  const hover = editorValue(response)["hover"];
  if (!isRecord(hover)) return null;

  return {
    contents: {
      kind: MarkupKind.Markdown,
      value:
        typeof hover["contents"] === "string"
          ? hover["contents"]
          : typeof hover["type"] === "string"
            ? `**type:** \`${hover["type"]}\``
            : "",
    },
    ...(isSpan(hover["range"]) ? { range: spanToRange(document, hover["range"]) } : {}),
  };
}

function isSpan(value: unknown): value is CstSpan {
  return (
    isRecord(value) &&
    typeof value["sourceId"] === "string" &&
    typeof value["startOffset"] === "number" &&
    typeof value["endOffset"] === "number"
  );
}
