import {
  DiagnosticSeverity,
  type Diagnostic,
  type PublishDiagnosticsParams,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { spanToRange } from "../document.js";
import type { AbiDiagnostic } from "../protocol.js";
import { isRecord } from "../protocol.js";
import type { OcamlWorkspaceSession } from "../session.js";

export async function getDiagnostics(
  session: OcamlWorkspaceSession,
  document: TextDocument,
): Promise<PublishDiagnosticsParams> {
  const result = await session.updateDocument(document);
  return {
    uri: document.uri,
    diagnostics: result.diagnostics.map((diagnostic) => toLspDiagnostic(document, diagnostic)),
  };
}

export function toLspDiagnostic(document: TextDocument, diagnostic: AbiDiagnostic): Diagnostic {
  const span = diagnostic.span;
  const range =
    span &&
    isRecord(span) &&
    typeof span["startOffset"] === "number" &&
    typeof span["endOffset"] === "number"
      ? spanToRange(document, {
          sourceId: typeof span["sourceId"] === "string" ? span["sourceId"] : document.uri,
          startOffset: span["startOffset"],
          endOffset: span["endOffset"],
        })
      : {
          start: { line: 0, character: 0 },
          end: { line: 0, character: Math.max(1, document.getText().split("\n")[0]?.length ?? 1) },
        };

  return {
    range,
    message: diagnostic.message ?? "OCaml language diagnostic",
    severity: severityToLsp(diagnostic.severity),
    source: "ocaml",
    ...(diagnostic.code ? { code: diagnostic.code } : {}),
  };
}

function severityToLsp(severity: string | undefined): DiagnosticSeverity {
  switch (severity) {
    case "warning":
      return DiagnosticSeverity.Warning;
    case "information":
      return DiagnosticSeverity.Information;
    case "hint":
      return DiagnosticSeverity.Hint;
    case "error":
    default:
      return DiagnosticSeverity.Error;
  }
}
