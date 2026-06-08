/**
 * LSP Features
 *
 * Language Server Protocol features derived from the DSL framework.
 * These use the semantic information from Forms to provide rich
 * editor integration.
 *
 * @module
 */

export {
  generateSemanticTokens,
  TOKEN_TYPES,
  TOKEN_MODIFIERS,
  type SemanticToken,
  type SemanticTokensResult,
} from "./semantic-tokens.js";
