import { describe, expect, it } from "vitest";

import { editorAnalysisResultFromOcamlResponse } from "../src/editor-host.js";

describe("OCaml editor analysis host adapter", () => {
  it("translates typed-core annotations into editor typed spans", () => {
    const analysis = editorAnalysisResultFromOcamlResponse({
      sourceId: "fixture",
      source: "(define answer 42)",
      responseValue: {
        typedCore: {
          resultType: "Int",
          annotations: [
            {
              nodeId: 1,
              span: { sourceId: "fixture", startOffset: 8, endOffset: 14 },
              type: "Int",
              expr: { kind: "definition", name: "answer" },
            },
          ],
        },
      },
      diagnostics: [],
    });

    expect(analysis.success).toBe(true);
    expect(analysis.resultTypeDisplay).toBe("Int");
    expect(analysis.typedSpans).toEqual([
      expect.objectContaining({
        id: "ocaml:1",
        display: "Int",
        code: "answer",
        exprTag: "definition",
      }),
    ]);
  });

  it("translates OCaml diagnostics into existing editor diagnostics", () => {
    const analysis = editorAnalysisResultFromOcamlResponse({
      sourceId: "fixture",
      source: "(define broken)",
      responseValue: { typedCore: null },
      diagnostics: [
        {
          code: "type/mismatch",
          severity: "error",
          message: "Type mismatch",
          span: { sourceId: "fixture", startOffset: 0, endOffset: 15 },
        },
      ],
    });

    expect(analysis.success).toBe(false);
    expect(analysis.diagnostics).toEqual([
      expect.objectContaining({
        code: "ocaml/type/mismatch",
        severity: "error",
        message: "Type mismatch",
      }),
    ]);
  });
});
