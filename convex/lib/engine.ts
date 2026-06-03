import { Doc } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { BitemporalCoord, isVisible, valueKey } from "./visibility";

export const LIMITS = {
  maxClauses: 12,
  maxIntermediateRows: 5_000,
  maxResultRows: 1_000,
  maxClauseScan: 2_000,
  allowRecursion: false,
} as const;

export type Binding = Record<string, unknown>;

type Term =
  | { kind: "var"; name: string }
  | { kind: "const"; value: unknown };

type Clause = { e: Term; a: Term; v: Term };

type Ctx = QueryCtx | MutationCtx;

/** Strings beginning with `?` are variables; everything else is a constant. */
function parseTerm(raw: unknown): Term {
  if (typeof raw === "string" && raw.startsWith("?")) {
    return { kind: "var", name: raw.slice(1) };
  }
  return { kind: "const", value: raw };
}

function parseClause(raw: unknown[]): Clause {
  if (!Array.isArray(raw) || raw.length !== 3) {
    throw new Error(`each where clause must be a [e, a, v] triple`);
  }
  return {
    e: parseTerm(raw[0]),
    a: parseTerm(raw[1]),
    v: parseTerm(raw[2]),
  };
}

/** Resolve a term against a binding: a bound variable becomes a constant. */
function resolve(term: Term, binding: Binding): Term {
  if (term.kind === "var" && term.name in binding) {
    return { kind: "const", value: binding[term.name] };
  }
  return term;
}

/**
 * Static selectivity score for clause ordering — more bound positions first,
 * with the attribute position weighted highest since all fact indexes are
 * attribute-led. Higher score = run earlier.
 */
function selectivity(c: Clause): number {
  let score = 0;
  if (c.a.kind === "const") score += 4;
  if (c.e.kind === "const") score += 2;
  if (c.v.kind === "const") score += 1;
  return score;
}

export type Plan = {
  clauses: Clause[];
  order: number[];
};

export function planWhere(where: unknown[][]): Plan {
  if (where.length > LIMITS.maxClauses) {
    throw new Error(
      `query has ${where.length} clauses, exceeding maxClauses=${LIMITS.maxClauses}`,
    );
  }
  const clauses = where.map(parseClause);
  const order = clauses
    .map((_, i) => i)
    .sort((a, b) => selectivity(clauses[b]) - selectivity(clauses[a]));
  return { clauses, order };
}

/** Fetch facts matching a clause under the current binding via the best index. */
async function fetchClause(
  ctx: Ctx,
  clause: Clause,
  binding: Binding,
  coord: BitemporalCoord,
): Promise<Doc<"facts">[]> {
  const e = resolve(clause.e, binding);
  const a = resolve(clause.a, binding);
  const vv = resolve(clause.v, binding);

  const eConst = e.kind === "const" ? e.value : undefined;
  const aConst = a.kind === "const" ? a.value : undefined;
  const vIsConst = vv.kind === "const";
  const vConst = vIsConst ? (vv as { value: unknown }).value : undefined;

  let rows: Doc<"facts">[];

  if (eConst !== undefined && aConst !== undefined) {
    rows = await ctx.db
      .query("facts")
      .withIndex("by_e_a", (q) =>
        q.eq("e", String(eConst)).eq("a", String(aConst)),
      )
      .take(LIMITS.maxClauseScan);
    if (vIsConst) {
      rows = rows.filter((r) => valueKey(r.v) === valueKey(vConst));
    }
  } else if (aConst !== undefined && vIsConst) {
    rows = await ctx.db
      .query("facts")
      .withIndex("by_a_v", (q) => q.eq("a", String(aConst)).eq("v", vConst))
      .take(LIMITS.maxClauseScan);
  } else if (aConst !== undefined) {
    rows = await ctx.db
      .query("facts")
      .withIndex("by_a", (q) => q.eq("a", String(aConst)))
      .take(LIMITS.maxClauseScan);
  } else if (eConst !== undefined) {
    rows = await ctx.db
      .query("facts")
      .withIndex("by_e", (q) => q.eq("e", String(eConst)))
      .take(LIMITS.maxClauseScan);
  } else {
    throw new Error(
      "unbounded clause: each clause must resolve at least its entity or attribute to a constant (directly or via an earlier join)",
    );
  }

  return rows.filter((r) => isVisible(r, coord));
}

/** Extend a binding by unifying a clause against a candidate fact. */
function unify(
  clause: Clause,
  binding: Binding,
  fact: Doc<"facts">,
): Binding | null {
  const next: Binding = { ...binding };
  for (const [term, fieldVal] of [
    [clause.e, fact.e],
    [clause.a, fact.a],
    [clause.v, fact.v],
  ] as const) {
    if (term.kind === "const") {
      if (valueKey(term.value) !== valueKey(fieldVal)) return null;
    } else if (term.name in next) {
      if (valueKey(next[term.name]) !== valueKey(fieldVal)) return null;
    } else {
      next[term.name] = fieldVal;
    }
  }
  return next;
}

/**
 * Evaluate a Datalog `where` body to a set of variable bindings via indexed
 * nested-loop joins. Non-recursive and bounded by LIMITS.
 */
export async function runWhere(
  ctx: Ctx,
  where: unknown[][],
  coord: BitemporalCoord,
  seed: Binding = {},
): Promise<Binding[]> {
  const plan = planWhere(where);

  let bindings: Binding[] = [{ ...seed }];
  for (const idx of plan.order) {
    const clause = plan.clauses[idx];
    const nextBindings: Binding[] = [];
    for (const binding of bindings) {
      const candidates = await fetchClause(ctx, clause, binding, coord);
      for (const fact of candidates) {
        const extended = unify(clause, binding, fact);
        if (extended) nextBindings.push(extended);
      }
      if (nextBindings.length > LIMITS.maxIntermediateRows) {
        throw new Error(
          `query exceeded maxIntermediateRows=${LIMITS.maxIntermediateRows}`,
        );
      }
    }
    bindings = nextBindings;
    if (bindings.length === 0) break;
  }
  return bindings;
}

/**
 * A rule is "entity-local" when every clause's subject (entity position) is
 * either a constant or the same variable that the rule emits on. Such a rule's
 * output for entity X depends only on facts about X, so it can be recomputed
 * incrementally per-entity. Rules that join across entities (a different
 * variable in any subject position) must be recomputed in full.
 */
export function entityVarOf(emitE: string): string | null {
  return emitE.startsWith("?") ? emitE.slice(1) : null;
}

export function isEntityLocalRule(where: unknown[][], emitE: string): boolean {
  const ev = entityVarOf(emitE);
  if (ev === null) return false;
  for (const raw of where) {
    const subject = parseTerm(raw[0]);
    if (subject.kind === "var" && subject.name !== ev) return false;
  }
  return true;
}

/** Project bindings onto the requested variable names (e.g. ["?e", "?m"]). */
export function project(
  bindings: Binding[],
  select: string[],
): Record<string, unknown>[] {
  const names = select.map((s) => (s.startsWith("?") ? s.slice(1) : s));
  const seen = new Set<string>();
  const out: Record<string, unknown>[] = [];
  for (const b of bindings) {
    const row: Record<string, unknown> = {};
    for (const n of names) row[n] = b[n];
    const key = JSON.stringify(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
