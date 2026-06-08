/**
 * Compilation Context
 *
 * The context threads through all DSL handlers during compilation,
 * providing access to type environment, errors, and registered handlers.
 */

import { Data } from "effect";
import type { Loc } from "../reader/index.js";
import type { Type, Scheme } from "../type/types.js";
import type { DSLHandler } from "./types.js";
import type { BuiltinFn } from "../evaluator/types.js";
import { Env } from "../Env.js";

/** Type environment mapping variable names to type schemes */
export type TypeEnv = ReadonlyMap<string, Scheme>;

// =============================================================================
// Compile Error
// =============================================================================

export class CompileError extends Data.TaggedError("CompileError")<{
  readonly message: string;
  readonly loc: Loc | undefined;
  readonly expected?: string;
  readonly got?: string;
  readonly notes?: readonly string[];
}> {}

// =============================================================================
// Compile Options
// =============================================================================

export interface CompileOptions {
  /** Registered DSL handlers */
  handlers?: Map<string, DSLHandler>;

  /** Step limit for evaluation */
  stepLimit?: number;

  /** Builtin functions */
  builtins?: Record<string, BuiltinFn>;

  /** Initial runtime environment */
  env?: Env;

  /** Initial type environment */
  typeEnv?: TypeEnv;

  /** Whether to collect all errors or fail fast */
  multiError?: boolean;

  /** Namespace for entity types */
  namespace?: string;

  /** Original source code being compiled */
  source?: string;
}

// =============================================================================
// Compile Context
// =============================================================================

/**
 * Context that threads through compilation.
 */
export class CompileContext {
  /** Original source code */
  readonly source: string;

  /** Type environment for inference */
  typeEnv: TypeEnv;

  /** Runtime environment for immediate evaluation */
  env: Env;

  /** Accumulated errors (multi-error mode) */
  readonly errors: CompileError[] = [];

  /** Registered DSL handlers */
  readonly handlers: Map<string, DSLHandler>;

  /** Builtin functions */
  readonly builtins: Record<string, BuiltinFn>;

  /** Step limit for evaluation */
  readonly stepLimit: number;

  /** Current namespace */
  readonly namespace: string;

  /** Whether to collect all errors or fail fast */
  readonly multiError: boolean;

  /** Declared types defined so far (for Ref type resolution) */
  readonly declaredTypes = new Map<string, { name: string; type: Type }>();

  /** Declared actions defined so far */
  readonly declaredActions = new Map<string, { name: string }>();

  constructor(options: CompileOptions = {}) {
    this.source = options.source ?? "";
    this.handlers = options.handlers ?? new Map();
    this.stepLimit = options.stepLimit ?? 10000;
    this.builtins = options.builtins ?? {};
    this.env = options.env ?? Env.empty();
    this.typeEnv = options.typeEnv ?? new Map();
    this.multiError = options.multiError ?? true;
    this.namespace = options.namespace ?? "";
  }

  /**
   * Add an error to the context.
   */
  addError(error: CompileError): void {
    this.errors.push(error);
  }

  /**
   * Create a compile error.
   */
  error(
    message: string,
    loc: Loc | undefined,
    opts?: { expected?: string; got?: string },
  ): CompileError {
    const args: {
      message: string;
      loc: Loc | undefined;
      expected?: string;
      got?: string;
    } = { message, loc };
    if (opts?.expected !== undefined) {
      args.expected = opts.expected;
    }
    if (opts?.got !== undefined) {
      args.got = opts.got;
    }
    return new CompileError(args);
  }

  /**
   * Check if a handler exists for a form name.
   */
  hasHandler(name: string): boolean {
    return this.handlers.has(name);
  }

  /**
   * Get a handler by name.
   */
  getHandler(name: string): DSLHandler | undefined {
    return this.handlers.get(name);
  }

  /**
   * Register a declared type.
   */
  registerDeclaredType(name: string, type: Type): void {
    this.declaredTypes.set(name, { name, type });
  }

  /**
   * Check if a declared type exists.
   */
  hasDeclaredType(name: string): boolean {
    return this.declaredTypes.has(name);
  }

  /**
   * Register an action.
   */
  registerAction(name: string): void {
    this.declaredActions.set(name, { name });
  }

  /**
   * Check if an action exists.
   */
  hasAction(name: string): boolean {
    return this.declaredActions.has(name);
  }

  /**
   * Create a child context for nested compilation.
   */
  child(overrides?: Partial<CompileOptions>): CompileContext {
    const child = new CompileContext({
      source: this.source,
      handlers: this.handlers,
      stepLimit: this.stepLimit,
      builtins: this.builtins,
      env: this.env,
      typeEnv: this.typeEnv,
      multiError: this.multiError,
      namespace: this.namespace,
      ...overrides,
    });
    // Share declared types and actions
    for (const [k, v] of this.declaredTypes) {
      child.declaredTypes.set(k, v);
    }
    for (const [k, v] of this.declaredActions) {
      child.declaredActions.set(k, v);
    }
    return child;
  }
}

/**
 * Create a compile context with options.
 */
export function createCompileContext(options?: CompileOptions): CompileContext {
  return new CompileContext(options);
}
