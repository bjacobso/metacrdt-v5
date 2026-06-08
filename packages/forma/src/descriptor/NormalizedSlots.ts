/**
 * SimpleNormalizedSlots — concrete implementation of NormalizedSlots.
 *
 * Provides typed access to slot values extracted during structural recognition.
 * Each slot value is stored with a discriminated union so the getters can
 * return the appropriate type without casting.
 */

import type { NormalizedSlots, NormalizedChildForm } from "./ElaborationHook.js";
import type { SExpr } from "../reader/types.js";

// ---------------------------------------------------------------------------
// Slot value variants
// ---------------------------------------------------------------------------

export type SlotValue =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "string-list"; readonly value: readonly string[] }
  | { readonly kind: "symbol"; readonly value: string }
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "expr"; readonly value: SExpr }
  | { readonly kind: "children"; readonly value: readonly SExpr[] };

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class SimpleNormalizedSlots implements NormalizedSlots {
  constructor(
    private readonly values: ReadonlyMap<string, SlotValue>,
    private readonly childForms: ReadonlyMap<string, readonly NormalizedChildForm[]> = new Map(),
  ) {}

  getString(name: string): string | undefined {
    const v = this.values.get(name);
    if (!v) return undefined;
    if (v.kind === "string") return v.value;
    if (v.kind === "symbol") return v.value;
    return undefined;
  }

  getStringList(name: string): readonly string[] {
    const v = this.values.get(name);
    if (!v) return [];
    if (v.kind === "string-list") return v.value;
    return [];
  }

  getSymbol(name: string): string | undefined {
    const v = this.values.get(name);
    if (!v) return undefined;
    if (v.kind === "symbol") return v.value;
    return undefined;
  }

  getExpr(name: string): SExpr | undefined {
    const v = this.values.get(name);
    if (!v) return undefined;
    if (v.kind === "expr") return v.value;
    return undefined;
  }

  getChildren(name: string): readonly SExpr[] {
    const v = this.values.get(name);
    if (!v) return [];
    if (v.kind === "children") return v.value;
    return [];
  }

  getChildForms(name: string): readonly NormalizedChildForm[] {
    return this.childForms.get(name) ?? [];
  }

  has(name: string): boolean {
    return this.values.has(name);
  }

  toReadonlyMap(): ReadonlyMap<string, SlotValue> {
    return this.values;
  }
}
