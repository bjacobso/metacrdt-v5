/**
 * @metacrdt/forma
 *
 * Lisp infrastructure v2: pipeline-oriented architecture.
 *
 * Subpath exports:
 * - `@metacrdt/forma/reader`       — S-expression parser
 * - `@metacrdt/forma/source`       — Source identity and provenance
 * - `@metacrdt/forma/session`      — Loaded source/session state
 * - `@metacrdt/forma/engine`       — Engine-owned host operations
 * - `@metacrdt/forma/artifact`     — Validated artifact packaging
 * - `@metacrdt/forma/mechanics`    — Mechanics artifacts + hosted runtime
 * - `@metacrdt/forma/sexpr`        — Core AST types
 * - `@metacrdt/forma/evaluator`    — Direct interpreter
 * - `@metacrdt/forma/expander`     — Macro expansion
 * - `@metacrdt/forma/vm`           — Bytecode compiler + executor
 * - `@metacrdt/forma/builtins`     — Primitive operations
 * - `@metacrdt/forma/type`         — Hindley-Milner type system
 * - `@metacrdt/forma/core-expr`    — Typed core expression AST
 * - `@metacrdt/forma/elaboration`  — DSL handler framework
 * - `@metacrdt/forma/form`         — Form/pattern/compiler framework
 * - `@metacrdt/forma/env`          — Value environment
 * - `@metacrdt/forma/diagnostic`   — Errors and diagnostics
 * - `@metacrdt/forma/formatter`    — Code formatter
 * - `@metacrdt/forma/editor`       — Structural editing
 * - `@metacrdt/forma/lsp`          — Language server support
 * - `@metacrdt/forma/codegen`      — S-expression builder for code gen
 * - `@metacrdt/forma/descriptor-codegen` — FormDescriptor → Effect Schema source generation
 * - `@metacrdt/forma/descriptor`   — Self-describing form system + bootstrap
 */

export * as SExpr from "./SExpr.js";
export * as Reader from "./Reader.js";
export * as Source from "./Source.js";
export * as Session from "./Session.js";
export * as Engine from "./Engine.js";
export * as Artifact from "./Artifact.js";
export * as Mechanics from "./Mechanics.js";
export * as Evaluator from "./Evaluator.js";
export * as Expander from "./Expander.js";
export * as VM from "./VM.js";
export * as Builtins from "./Builtins.js";
export * as Type from "./Type.js";
export * as CoreExpr from "./CoreExpr.js";
export * as Elaboration from "./Elaboration.js";
export * as Form from "./Form.js";
export * as Env from "./Env.js";
export * as Diagnostic from "./Diagnostic.js";
export * as Formatter from "./Formatter.js";
export * as Editor from "./Editor.js";
export * as LSP from "./LSP.js";
export * as CodeGen from "./CodeGen.js";
export * as DescriptorCodegen from "./DescriptorCodegen.js";
export * as Descriptor from "./Descriptor.js";
