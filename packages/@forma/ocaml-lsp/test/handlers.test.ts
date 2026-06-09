import { describe, expect, test } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";

import { getCompletions } from "../src/handlers/completion.js";
import { getDefinition } from "../src/handlers/definition.js";
import { formatDocument } from "../src/handlers/formatting.js";
import type { OcamlWorkspaceSession } from "../src/session.js";

const uri = "file:///workspace/source.lisp";

function fakeSession(document: TextDocument): OcamlWorkspaceSession {
  return {
    documents: new Map([[document.uri, document]]),
    editorCompletion: async () => ({
      ok: true,
      value: {
        items: [
          { label: "define", kind: "form", detail: "core form" },
          { label: "x", kind: "value", detail: "define" },
        ],
      },
    }),
    editorDefinition: async () => ({
      ok: true,
      value: {
        definition: {
          name: "x",
          uri: document.uri,
          span: { sourceId: "source.lisp", startOffset: 8, endOffset: 9 },
          detail: "define",
        },
      },
    }),
    editorFormat: async () => ({
      ok: true,
      value: {
        text: "(define x 1)\nx\n",
      },
    }),
  } as unknown as OcamlWorkspaceSession;
}

describe("OCaml LSP handlers", () => {
  test("completion combines core forms and document definitions", async () => {
    const document = TextDocument.create(uri, "lisp", 1, "(define x 1)\nx");
    const result = await getCompletions(fakeSession(document), document, {
      textDocument: { uri },
      position: { line: 1, character: 1 },
    });

    expect(result.items.map((item) => item.label)).toContain("define");
    expect(result.items.map((item) => item.label)).toContain("x");
  });

  test("definition resolves document symbols to parsed definition spans", async () => {
    const document = TextDocument.create(uri, "lisp", 1, "(define x 1)\nx");
    const result = await getDefinition(fakeSession(document), document, {
      textDocument: { uri },
      position: { line: 1, character: 0 },
    });

    expect(result).toMatchObject({
      uri,
      range: {
        start: { line: 0, character: 8 },
        end: { line: 0, character: 9 },
      },
    });
  });

  test("formatting returns one full-document edit", async () => {
    const document = TextDocument.create(uri, "lisp", 1, "(define   x   1)");
    const result = await formatDocument(fakeSession(document), document, {
      tabSize: 2,
      insertSpaces: true,
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.newText).toBe("(define x 1)\nx\n");
  });
});
