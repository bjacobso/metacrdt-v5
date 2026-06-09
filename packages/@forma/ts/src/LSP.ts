/**
 * Language server protocol support: semantic tokens, hover, completions, analysis.
 *
 * @module LSP
 */

// Semantic tokens (from framework LSP)
export {
  generateSemanticTokens,
  TOKEN_TYPES,
  TOKEN_MODIFIERS,
  type SemanticToken,
  type SemanticTokensResult,
} from "./lsp/index.js";

// HM-based LSP analysis
export {
  analyzeLsp,
  findTypeAtOffset,
  type AnalyzeLspOptions,
  type LspResult,
  type TypedSpan,
  type LspError,
} from "./lsp/hm-lsp.js";

// DSL type provider (for LSP integration)
export type { DSLTypeProvider, DSLSlotInfo } from "./type/dsl-provider.js";
export {
  createDSLTypeProviderFromRegistry,
  type CreateDSLTypeProviderOptions,
} from "./type/dsl-provider-from-registry.js";
