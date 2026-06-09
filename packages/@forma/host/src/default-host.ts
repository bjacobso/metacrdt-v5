import { TsLanguageHost } from "./ts-host.js";
import type {
  EditorAnalysisRequest,
  EditorAnalysisResult,
  LanguageHost,
  ParseRequest,
  ParseResult,
  TypecheckRequest,
  TypecheckResult,
} from "./types.js";

export interface DefaultLanguageHost extends LanguageHost {
  parseSync(request: ParseRequest): ParseResult;
  typecheckSync(request: TypecheckRequest): TypecheckResult;
  analyzeEditor(request: EditorAnalysisRequest): Promise<EditorAnalysisResult>;
}

export function createDefaultLanguageHost(): DefaultLanguageHost {
  return new TsLanguageHost();
}
