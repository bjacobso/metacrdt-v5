import { describe, expect, it } from "vitest";

import {
  createDefaultEditorAnalysisHost,
  getDefaultEditorAnalysisHost,
} from "../src/analysis-host.js";

describe("editor analysis host", () => {
  it("defaults to the TypeScript editor analysis behavior", async () => {
    const host = createDefaultEditorAnalysisHost();
    const analysis = await host.analyzeEditor({
      sourceId: "analysis-host-test",
      source: "(define answer 42)\nanswer",
    });

    expect(analysis.sourceId).toBe("analysis-host-test");
    expect(analysis.success).toBe(true);
    expect(analysis.parse.redTree).not.toBeNull();
  });

  it("uses the same smallest-span type lookup as the default language host", () => {
    const host = getDefaultEditorAnalysisHost();
    const typedSpan = host.findTypeAtOffset(
      [
        {
          id: "outer",
          span: { sourceId: "test", startOffset: 0, endOffset: 10 },
          display: "Outer",
          type: { kind: "display", display: "Outer" },
          code: "outer",
          exprTag: "List",
        },
        {
          id: "inner",
          span: { sourceId: "test", startOffset: 2, endOffset: 4 },
          display: "Inner",
          type: { kind: "display", display: "Inner" },
          code: "inner",
          exprTag: "Symbol",
        },
      ],
      3,
    );

    expect(typedSpan?.id).toBe("inner");
  });
});
