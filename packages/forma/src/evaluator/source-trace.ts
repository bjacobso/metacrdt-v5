import type { Loc, SExpr } from "../reader/index.js";
import { children } from "../reader/types.js";

export interface MacroOrigin {
  readonly macroName: string;
  readonly loc: Loc;
}

export interface SourceTrace {
  readonly loc: Loc;
  readonly macroOrigins?: readonly MacroOrigin[];
}

const sourceTraceMap = new WeakMap<SExpr, SourceTrace>();

export function sourceTraceOf(expr: SExpr): SourceTrace {
  return sourceTraceMap.get(expr) ?? { loc: expr.loc };
}

export function sourceLocOf(expr: SExpr): Loc {
  return sourceTraceOf(expr).loc;
}

/** Tag every node in the tree with a macro expansion origin. */
export function tagExpandedExpr(expr: SExpr, macroOrigin: MacroOrigin): void {
  const visit = (node: SExpr): void => {
    const existing = sourceTraceMap.get(node);
    const macroOrigins = existing?.macroOrigins ?? [];
    sourceTraceMap.set(node, {
      loc: macroOrigin.loc,
      macroOrigins: [macroOrigin, ...macroOrigins],
    });
    for (const child of children(node)) {
      visit(child);
    }
  };
  visit(expr);
}

export function copySourceTrace<T extends SExpr>(from: SExpr, to: T): T {
  const trace = sourceTraceMap.get(from);
  if (trace) {
    sourceTraceMap.set(to, trace);
  }
  return to;
}
