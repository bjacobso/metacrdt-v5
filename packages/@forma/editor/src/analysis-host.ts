import { createDefaultLanguageHost } from "@forma/host/default-host";
import { findEditorTypeAtOffset } from "@forma/host/editor";
import type {
  EditorAnalysisRequest,
  EditorAnalysisResult,
  EditorTypedSpan,
} from "@forma/host/types";

export interface EditorAnalysisHost {
  analyzeEditor(request: EditorAnalysisRequest): Promise<EditorAnalysisResult>;
  findTypeAtOffset(
    typedSpans: readonly EditorTypedSpan[],
    offset: number,
  ): EditorTypedSpan | undefined;
}

let defaultEditorAnalysisHost: EditorAnalysisHost | null = null;

export function createDefaultEditorAnalysisHost(): EditorAnalysisHost {
  const languageHost = createDefaultLanguageHost();
  return {
    analyzeEditor: (request) => languageHost.analyzeEditor(request),
    findTypeAtOffset: (typedSpans, offset) => findEditorTypeAtOffset(typedSpans, offset),
  };
}

export function getDefaultEditorAnalysisHost(): EditorAnalysisHost {
  defaultEditorAnalysisHost ??= createDefaultEditorAnalysisHost();
  return defaultEditorAnalysisHost;
}
