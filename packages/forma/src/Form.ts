/**
 * Typed form/pattern/compiler framework and meta descriptors.
 *
 * @module Form
 */

// =============================================================================
// Pattern Matching
// =============================================================================

export {
  type Pattern,
  type PatternMeta,
  type ManyPattern,
  type PatternResult,
  type PatternRequirements,
  Keyword,
  Sym,
  Str,
  Num,
  Bool,
  Any,
  List,
  OneOf,
  Optional,
  Many,
  Clauses,
  Map,
  WithCompletions,
  getNodeText,
  getListHead,
  getContentChildren,
  getNodeLoc,
} from "./form/pattern.js";

// =============================================================================
// Core Types
// =============================================================================

export {
  type DSLType,
  type Ctx,
  type Completion,
  type CompletionKind,
  type HoverInfo,
  type Diagnostic,
  type CompletionPosition,
  type HoverPosition,
  type SemanticKind,
  type SemanticModifier,
  type SemanticClassification,
  DSLError,
  type MacroOrigin,
  emptyCtx,
  createCtx,
  typeName,
  levenshteinDistance,
  sortSuggestions,
  findClosestMatches,
} from "./form/core.js";

// =============================================================================
// Form Specification
// =============================================================================

export {
  type Form,
  type FormSpecWithPattern,
  type FormRegistry,
  type FormResult,
  createForm,
  createRegistry,
  structuralForm,
  extendForm,
  delegateType,
} from "./form/form.js";

// =============================================================================
// Compiler
// =============================================================================

export {
  type Compiler,
  type RegistryCompiler,
  createCompiler,
  createRegistryCompiler,
  createSynthesizer,
} from "./form/compiler.js";
