/**
 * @forma/ts
 *
 * Lisp infrastructure v2: pipeline-oriented architecture.
 *
 * Subpath exports:
 * - `@forma/ts/reader`       — S-expression parser
 * - `@forma/ts/source`       — Source identity and provenance
 * - `@forma/ts/session`      — Loaded source/session state
 * - `@forma/ts/engine`       — Engine-owned host operations
 * - `@forma/ts/artifact`     — Validated artifact packaging
 * - `@forma/ts/mechanics`    — Mechanics artifacts + hosted runtime
 * - `@forma/ts/sexpr`        — Core AST types
 * - `@forma/ts/evaluator`    — Direct interpreter
 * - `@forma/ts/expander`     — Macro expansion
 * - `@forma/ts/vm`           — Bytecode compiler + executor
 * - `@forma/ts/builtins`     — Primitive operations
 * - `@forma/ts/type`         — Hindley-Milner type system
 * - `@forma/ts/core-expr`    — Typed core expression AST
 * - `@forma/ts/elaboration`  — DSL handler framework
 * - `@forma/ts/form`         — Form/pattern/compiler framework
 * - `@forma/ts/env`          — Value environment
 * - `@forma/ts/diagnostic`   — Errors and diagnostics
 * - `@forma/ts/formatter`    — Code formatter
 * - `@forma/ts/editor`       — Structural editing
 * - `@forma/ts/lsp`          — Language server support
 * - `@forma/ts/codegen`      — S-expression builder for code gen
 * - `@forma/ts/descriptor-codegen` — FormDescriptor → Effect Schema source generation
 * - `@forma/ts/descriptor`   — Self-describing form system + bootstrap
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
