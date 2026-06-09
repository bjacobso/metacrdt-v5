/**
 * Quasiquote compilation — compileQuasiquote, collectQuasiquoteClosures.
 */

import type { SExpr } from "../reader/index.js";
import type { SourceTrace } from "../evaluator/source-trace.js";
import { Op, type Chunk, emit, emitU8, emitU16, addConstant } from "./opcodes.js";
import type { CompileScope, GlobalRegistry, BuiltinRegistry, CompileContext } from "./scope.js";
import type { CompileFn } from "./compile-core.js";
import { traceOf } from "./compile-core.js";
import { compileZeroArgClosure } from "./compile-forms.js";

// ---------------------------------------------------------------------------
// collectQuasiquoteClosures
// ---------------------------------------------------------------------------

function collectQuasiquoteClosures(
  expr: SExpr,
  parentChunk: Chunk,
  scope: CompileScope,
  globals: GlobalRegistry,
  builtins: BuiltinRegistry,
  context: CompileContext,
  compileSExpr: CompileFn,
): number {
  let count = 0;

  function visit(node: SExpr): void {
    if (node._tag === "List" && node.items.length === 2) {
      const head = node.items[0];
      if (head?._tag === "Sym" && (head.name === "unquote" || head.name === "unquote-splicing")) {
        compileZeroArgClosure(
          node.items[1]!,
          parentChunk,
          scope,
          globals,
          builtins,
          context,
          traceOf(node.items[1]!),
          compileSExpr,
        );
        count++;
        return;
      }
    }

    switch (node._tag) {
      case "List":
      case "Vector":
        for (const item of node.items) {
          visit(item);
        }
        return;
      case "Map":
        for (const [k, v] of node.pairs) {
          visit(k);
          visit(v);
        }
        return;
      case "Num":
      case "Str":
      case "Bool":
      case "Sym":
      case "Set":
      case "Error":
        return;
    }
  }

  visit(expr);
  return count;
}

// ---------------------------------------------------------------------------
// compileQuasiquote
// ---------------------------------------------------------------------------

export function compileQuasiquote(
  items: readonly SExpr[],
  chunk: Chunk,
  scope: CompileScope,
  globals: GlobalRegistry,
  builtins: BuiltinRegistry,
  context: CompileContext,
  trace: SourceTrace,
  compileSExpr: CompileFn,
): void {
  if (items.length !== 2) {
    emit(chunk, Op.NIL, trace);
    return;
  }

  const template = items[1]!;
  const closureCount = collectQuasiquoteClosures(
    template,
    chunk,
    scope,
    globals,
    builtins,
    context,
    compileSExpr,
  );
  emit(chunk, Op.QUASIQUOTE, trace);
  emitU16(chunk, addConstant(chunk, template), trace);
  emitU8(chunk, closureCount, trace);
}
