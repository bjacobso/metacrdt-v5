/**
 * MetaFnDecl — parse (meta-fn ...) declarations from prelude sources.
 *
 * Meta-fn declarations define compile-time hooks as Lisp expressions:
 *   (meta-fn name
 *     (:kind bindings)
 *     (:input FormMetaInput)
 *     (:output BindingMap)
 *     (:doc "Computes bindings for ...")
 *     (:body (let [...] ...)))
 *
 * @module meta-fn-decl
 */

import type { SExpr } from "../reader/types.js";
import { headSym, tail, trySym } from "../reader/types.js";
import { parse, toSExprMany } from "../reader/index.js";
import type { HookKind } from "./ElaborationHook.js";
import type { FormDescriptor } from "./FormDescriptor.js";
import { parseFormDescriptorForms } from "./parse-descriptor.js";
import { parseElaborationDescriptor, type ElaborationDescriptor } from "./ElaborationDescriptor.js";

// =============================================================================
// Types
// =============================================================================

export type MetaFnKind = HookKind | "infer" | "check";

export interface MetaFnDecl {
  readonly name: string;
  readonly kind: MetaFnKind;
  readonly inputType: string;
  readonly outputType: string;
  readonly capabilities: readonly string[];
  readonly doc?: string;
  readonly body: SExpr;
}

export class MetaFnSyntaxError extends Error {
  constructor(
    readonly metaFnName: string,
    readonly section: string,
    message: string,
  ) {
    super(message);
    this.name = "MetaFnSyntaxError";
  }
}

// =============================================================================
// Parsing
// =============================================================================

const HOOK_KIND_MAP: Record<string, MetaFnKind> = {
  bindings: "bindings",
  validate: "validate",
  construct: "construct",
  "result-type": "result-type",
  infer: "infer",
  check: "check",
};

/**
 * Parse a single (meta-fn ...) S-expression into a MetaFnDecl.
 * Returns undefined if the expression is not a meta-fn declaration.
 */
export function parseMetaFnDecl(expr: SExpr): MetaFnDecl | undefined {
  if (headSym(expr) !== "meta-fn") return undefined;

  const args = tail(expr);
  if (args.length < 1) {
    throw new MetaFnSyntaxError("<anonymous>", ":name", "meta-fn is missing its name");
  }

  const nameExpr = args[0]!;
  const name = trySym(nameExpr);
  if (!name) {
    throw new MetaFnSyntaxError("<anonymous>", ":name", "meta-fn name must be a symbol identifier");
  }

  let kind: MetaFnKind | undefined;
  let inputType: string | undefined;
  let outputType: string | undefined;
  const capabilities: string[] = [];
  let doc: string | undefined;
  let body: SExpr | undefined;

  for (let i = 1; i < args.length; i++) {
    const child = args[i]!;
    const kw = headSym(child);
    if (!kw || !kw.startsWith(":")) continue;

    const childTail = tail(child);

    switch (kw) {
      case ":kind": {
        const val = childTail[0] && trySym(childTail[0]);
        if (val && val in HOOK_KIND_MAP) {
          kind = HOOK_KIND_MAP[val];
        } else {
          throw new MetaFnSyntaxError(
            name,
            ":kind",
            `meta-fn '${name}' has invalid hook kind '${String(val ?? "")}'`,
          );
        }
        break;
      }
      case ":input": {
        const val = childTail[0] && trySym(childTail[0]);
        if (val) inputType = val;
        break;
      }
      case ":output": {
        const val = childTail[0] && trySym(childTail[0]);
        if (val) outputType = val;
        break;
      }
      case ":capabilities": {
        for (const item of childTail) {
          const sym = trySym(item);
          if (sym) {
            capabilities.push(sym);
          }
        }
        break;
      }
      case ":doc": {
        if (childTail[0]?._tag === "Str") doc = childTail[0].value;
        break;
      }
      case ":body": {
        if (childTail[0]) body = childTail[0];
        break;
      }

      default:
        throw new MetaFnSyntaxError(
          name,
          kw,
          `Unknown meta-fn section '${kw}' in meta-fn '${name}'`,
        );
    }
  }

  if (!kind) {
    throw new MetaFnSyntaxError(
      name,
      ":kind",
      `meta-fn '${name}' is missing required section ':kind'`,
    );
  }
  if (!inputType) {
    throw new MetaFnSyntaxError(
      name,
      ":input",
      `meta-fn '${name}' is missing required section ':input'`,
    );
  }
  if (!outputType) {
    throw new MetaFnSyntaxError(
      name,
      ":output",
      `meta-fn '${name}' is missing required section ':output'`,
    );
  }
  if (!body) {
    throw new MetaFnSyntaxError(
      name,
      ":body",
      `meta-fn '${name}' is missing required section ':body'`,
    );
  }

  return {
    name,
    kind,
    inputType,
    outputType,
    capabilities,
    ...(doc != null ? { doc } : {}),
    body,
  };
}

// =============================================================================
// Prelude parsing
// =============================================================================

/**
 * Parse a prelude source string, returning both form descriptors and meta-fns.
 * Uses error-tolerant parsing since preludes may contain comments/syntax issues.
 * For duplicate meta-fn names, keeps the LAST occurrence (which has the full body).
 */
export function parsePrelude(source: string): {
  forms: FormDescriptor[];
  metaFns: MetaFnDecl[];
  elaborations: ElaborationDescriptor[];
} {
  const { redTree } = parse(source);
  const exprs = toSExprMany(redTree);

  const forms: FormDescriptor[] = [];
  const metaFnMap = new Map<string, MetaFnDecl>();
  const elaborationMap = new Map<string, ElaborationDescriptor>();

  for (const expr of exprs) {
    const formDesc = parseFormDescriptorForms(expr);
    if (formDesc.length > 0) {
      forms.push(...formDesc);
      continue;
    }

    const metaFn = parseMetaFnDecl(expr);
    if (metaFn) {
      // Last wins — later declarations override earlier ones
      metaFnMap.set(metaFn.name, metaFn);
      continue;
    }

    const elaboration = parseElaborationDescriptor(expr);
    if (elaboration) {
      elaborationMap.set(elaboration.name, elaboration);
    }
  }

  return {
    forms,
    metaFns: [...metaFnMap.values()],
    elaborations: [...elaborationMap.values()],
  };
}
