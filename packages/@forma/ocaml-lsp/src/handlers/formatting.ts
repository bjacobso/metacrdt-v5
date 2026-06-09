import type { FormattingOptions, TextEdit } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { OcamlWorkspaceSession } from "../session.js";
import { editorValue } from "../session.js";

export async function formatDocument(
  session: OcamlWorkspaceSession,
  document: TextDocument,
  _options: FormattingOptions,
): Promise<TextEdit[]> {
  const response = await session.editorFormat(document);
  const formatted = editorValue(response)["text"];
  if (typeof formatted !== "string") return [];
  if (formatted === document.getText()) return [];

  return [
    {
      range: {
        start: document.positionAt(0),
        end: document.positionAt(document.getText().length),
      },
      newText: formatted,
    },
  ];
}
