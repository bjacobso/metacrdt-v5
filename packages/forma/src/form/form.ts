/**
 * Form Specification
 *
 * A Form is a complete specification of a syntactic construct that unifies:
 * - Pattern matching (structure)
 * - Type rules (semantics)
 * - Binding rules (context changes)
 * - Validation rules (constraints)
 * - Completion rules (LSP)
 * - Hover rules (LSP)
 * - Extraction rules (output)
 *
 * @module
 */

import { Effect } from "effect";
import type { RedNode, Loc } from "../reader/index.js";
import type {
  DSLType,
  Ctx,
  DSLError,
  Completion,
  HoverInfo,
  CompletionPosition,
  HoverPosition,
  SemanticClassification,
} from "./core.js";
import type { Pattern, PatternResult, PatternRequirements } from "./pattern.js";

// =============================================================================
// Form Specification
// =============================================================================

/**
 * A complete form specification.
 *
 * Forms are the building blocks of a DSL. Each form specifies:
 * - How to recognize it (pattern)
 * - What type it has (type rule)
 * - How it affects context (bind rule)
 * - Additional validation (validate rule)
 * - LSP features (complete, hover rules)
 * - Output extraction (extract rule)
 *
 * @typeParam T - The DSL's type system
 * @typeParam Args - The captured arguments from pattern matching
 * @typeParam R - The extracted result type
 * @typeParam Req - Effect requirements from the pattern
 */
export interface Form<T extends DSLType, Args = unknown, R = Args, Req = never> {
  /** Unique name for this form */
  readonly name: string;

  /** Human-readable description */
  readonly description?: string;

  /** Pattern to match */
  readonly pattern: Pattern<Args, Req>;

  /**
   * Type rule: what type does this form synthesize?
   *
   * If not provided, the form doesn't contribute to type checking.
   * The function receives the context and matched arguments, and
   * returns the synthesized type.
   */
  readonly type?: (ctx: Ctx<T>, args: Args, loc: Loc) => Effect.Effect<T, DSLError>;

  /**
   * Binding rule: how does this form modify the context?
   *
   * Returns a new context with additional bindings.
   * Used by forms like `from` and `link` that introduce variables.
   */
  readonly bind?: (ctx: Ctx<T>, args: Args, loc: Loc) => Effect.Effect<Ctx<T>, DSLError>;

  /**
   * Validation rule: additional semantic checks.
   *
   * Returns a list of errors (doesn't fail) to allow collecting
   * multiple errors in a single pass.
   */
  readonly validate?: (
    ctx: Ctx<T>,
    args: Args,
    loc: Loc,
  ) => Effect.Effect<readonly DSLError[], never>;

  /**
   * Completion rule: what to suggest at a position within this form.
   *
   * The position includes which argument the cursor is in and
   * any partial text already typed.
   */
  readonly complete?: (
    ctx: Ctx<T>,
    args: Partial<Args>,
    pos: CompletionPosition,
  ) => Effect.Effect<readonly Completion[], never>;

  /**
   * Hover rule: what to show when hovering over this form.
   *
   * Returns markdown content for the hover popup, or undefined
   * if nothing should be shown.
   */
  readonly hover?: (
    ctx: Ctx<T>,
    args: Args,
    pos: HoverPosition,
  ) => Effect.Effect<HoverInfo | undefined, never>;

  /**
   * Extraction rule: how to produce the final result.
   *
   * If not provided, the matched args are returned directly.
   * The loc parameter provides the source location of the form.
   */
  readonly extract?: (ctx: Ctx<T>, args: Args, loc: Loc) => Effect.Effect<R, DSLError>;

  /**
   * Semantic classification for syntax highlighting.
   *
   * Specifies how the form head and arguments should be classified
   * for semantic token highlighting in editors.
   *
   * @example
   * ```typescript
   * semantic: {
   *   head: "keyword",  // (from ...) - "from" is a keyword
   *   args: {
   *     source: "type",     // (from (type Employee) ...) - type name
   *     alias: "variable",  // (from ... e) - variable binding
   *   }
   * }
   * ```
   */
  readonly semantic?: SemanticClassification;
}

// =============================================================================
// Form Builder
// =============================================================================

/**
 * Create a form specification.
 *
 * This is the main entry point for defining forms in your DSL.
 * The Req type parameter is automatically inferred from the pattern's requirements.
 *
 * @example
 * ```typescript
 * const FieldExpr = createForm<DomainType>()({
 *   name: "field",
 *   description: "Access a field on an entity",
 *   pattern: List("field", { entity: Sym, field: Sym }),
 *
 *   type: (ctx, { entity, field }, loc) => Effect.gen(function* () {
 *     const entityType = ctx.lookup(entity);
 *     if (!entityType) {
 *       return yield* Effect.fail(new DSLError(`Unknown variable '${entity}'`, loc));
 *     }
 *     // ... lookup field type
 *   }),
 *
 *   complete: (ctx, args, pos) => Effect.succeed(
 *     pos.argIndex === 0
 *       ? ctx.available().map(b => ({ label: b.name, kind: "variable" }))
 *       : []
 *   ),
 * });
 * ```
 */
export function createForm<T extends DSLType>() {
  return function <P extends Pattern<unknown, unknown>, R = PatternResult<P>>(
    spec: FormSpecWithPattern<T, P, R>,
  ): Form<T, PatternResult<P>, R, PatternRequirements<P>> {
    return spec as Form<T, PatternResult<P>, R, PatternRequirements<P>>;
  };
}

/**
 * Form specification with pattern for type inference
 */
export type FormSpecWithPattern<
  T extends DSLType,
  P extends Pattern<unknown, unknown>,
  R = PatternResult<P>,
> = Omit<Form<T, PatternResult<P>, R, PatternRequirements<P>>, "pattern"> & {
  readonly pattern: P;
};

// =============================================================================
// Form Composition
// =============================================================================

/**
 * Compose multiple forms into a registry.
 *
 * The Req type parameter represents the union of all Effect requirements
 * from all registered forms. It defaults to `never` (no requirements).
 */
export interface FormRegistry<T extends DSLType, Req = never> {
  /** All registered forms by name */
  readonly forms: ReadonlyMap<string, Form<T, unknown, unknown, Req>>;

  /** Get a form by name */
  get(name: string): Form<T, unknown, unknown, Req> | undefined;

  /** Add a form to the registry */
  register<Args, R, FormReq>(form: Form<T, Args, R, FormReq>): FormRegistry<T, Req | FormReq>;
}

/**
 * Create an empty form registry
 */
export function createRegistry<T extends DSLType>(): FormRegistry<T, never> {
  return createRegistryWithForms(new Map());
}

function createRegistryWithForms<T extends DSLType, Req>(
  forms: ReadonlyMap<string, Form<T, unknown, unknown, Req>>,
): FormRegistry<T, Req> {
  return {
    forms,

    get(name: string): Form<T, unknown, unknown, Req> | undefined {
      return forms.get(name);
    },

    register<Args, R, FormReq>(form: Form<T, Args, R, FormReq>): FormRegistry<T, Req | FormReq> {
      const newForms = new Map<string, Form<T, unknown, unknown, Req | FormReq>>();
      for (const [k, v] of forms) {
        newForms.set(k, v as Form<T, unknown, unknown, Req | FormReq>);
      }
      newForms.set(form.name, form as Form<T, unknown, unknown, Req | FormReq>);
      return createRegistryWithForms(newForms);
    },
  };
}

// =============================================================================
// Form Result
// =============================================================================

/**
 * Result of evaluating a form
 */
export interface FormResult<T extends DSLType, R> {
  /** The extracted result (if successful) */
  readonly result: R | undefined;

  /** The synthesized type (if the form has a type rule) */
  readonly type: T | undefined;

  /** All errors found */
  readonly errors: readonly DSLError[];

  /** The final context (with any new bindings) */
  readonly context: Ctx<T>;

  /** The source location of the form */
  readonly loc: Loc;
}

// =============================================================================
// Form Utilities
// =============================================================================

/**
 * Create a form that only matches patterns (no type/binding rules)
 */
export function structuralForm<Args, Req = never>(
  name: string,
  pattern: Pattern<Args, Req>,
  description?: string,
): Form<never, Args, Args, Req> {
  const form: Form<never, Args, Args, Req> = {
    name,
    pattern,
  };
  if (description !== undefined) {
    return { ...form, description };
  }
  return form;
}

/**
 * Extend a form with additional rules
 */
export function extendForm<T extends DSLType, Args, R, Req, T2 extends T = T, R2 = R>(
  base: Form<T, Args, R, Req>,
  extensions: Partial<Form<T2, Args, R2, Req>>,
): Form<T2, Args, R2, Req> {
  return {
    ...base,
    ...extensions,
    name: extensions.name ?? base.name,
    description: extensions.description ?? base.description,
    pattern: base.pattern,
  } as Form<T2, Args, R2, Req>;
}

/**
 * Create a form that delegates type synthesis to a child expression
 */
export function delegateType<T extends DSLType, Args, Req>(
  form: Form<T, Args, unknown, Req>,
  getChild: (args: Args) => RedNode,
  synthesize: (ctx: Ctx<T>, node: RedNode) => Effect.Effect<T, DSLError>,
): Form<T, Args, unknown, Req> {
  return {
    ...form,
    type: (ctx, args, _loc) => {
      const child = getChild(args);
      return synthesize(ctx, child);
    },
  };
}
