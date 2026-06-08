import { Doc, Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { BitemporalCoord, isVisible, valueKey } from "./visibility";
import { canReadAttribute, readPrincipal } from "./readAuth";

export const LIMITS = {
  maxClauses: 16,
  maxIntermediateRows: 5_000,
  maxResultRows: 1_000,
  maxClauseScan: 2_000,
  allowRecursion: false,
} as const;

export const COMPARISON_OPS = new Set([">", "<", ">=", "<=", "==", "!="]);

export type Binding = Record<string, unknown>;

/** A binding plus the source facts that justify it (provenance). */
export type SolvedBinding = { binding: Binding; sources: Id<"facts">[] };

/**
 * Normalized triple. `prov` is the base-fact provenance of the row: a fact row
 * contributes its own id; a derived-fact row contributes the base facts it was
 * itself derived from (so provenance always resolves to source facts).
 */
type Triple = { e: string; a: string; v: unknown; prov: Id<"facts">[] };

type Term =
  | { kind: "var"; name: string }
  | { kind: "const"; value: unknown };

type PatternClause = { kind: "pattern"; e: Term; a: Term; v: Term };
type CompareClause = { kind: "compare"; left: Term; op: string; right: Term };
type NotClause = { kind: "not"; pattern: PatternClause };
type AnyClause = PatternClause | CompareClause | NotClause;

type Ctx = QueryCtx | MutationCtx;
type ReadFilter = { principal: string } | null;

// --- parsing ----------------------------------------------------------------

/** Strings beginning with `?` are variables; everything else is a constant. */
function parseTerm(raw: unknown): Term {
  if (typeof raw === "string" && raw.startsWith("?")) {
    return { kind: "var", name: raw.slice(1) };
  }
  return { kind: "const", value: raw };
}

function parsePattern(raw: unknown): PatternClause {
  if (!Array.isArray(raw) || raw.length !== 3) {
    throw new Error("a fact pattern must be a [e, a, v] triple");
  }
  return {
    kind: "pattern",
    e: parseTerm(raw[0]),
    a: parseTerm(raw[1]),
    v: parseTerm(raw[2]),
  };
}

export function parseClause(raw: unknown): AnyClause {
  // Negation: { not: [e, a, v] }
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "not" in raw) {
    return { kind: "not", pattern: parsePattern((raw as { not: unknown }).not) };
  }
  if (Array.isArray(raw) && raw.length === 3) {
    // Comparison: [term, op, term] where op is a comparison operator.
    if (typeof raw[1] === "string" && COMPARISON_OPS.has(raw[1])) {
      return {
        kind: "compare",
        left: parseTerm(raw[0]),
        op: raw[1],
        right: parseTerm(raw[2]),
      };
    }
    return parsePattern(raw);
  }
  throw new Error(
    "each clause must be a [e, a, v] triple, a [term, op, term] comparison, or { not: [e, a, v] }",
  );
}

export function parseClauses(where: unknown[]): AnyClause[] {
  if (where.length > LIMITS.maxClauses) {
    throw new Error(
      `query has ${where.length} clauses, exceeding maxClauses=${LIMITS.maxClauses}`,
    );
  }
  return where.map(parseClause);
}

// --- term / binding helpers -------------------------------------------------

function resolve(term: Term, binding: Binding): Term {
  if (term.kind === "var" && term.name in binding) {
    return { kind: "const", value: binding[term.name] };
  }
  return term;
}

function termVars(term: Term): string[] {
  return term.kind === "var" ? [term.name] : [];
}

/** Variables a filter clause requires to be bound before it can run. */
function requiredVars(clause: AnyClause): string[] {
  if (clause.kind === "compare") {
    return [...termVars(clause.left), ...termVars(clause.right)];
  }
  if (clause.kind === "not") {
    const p = clause.pattern;
    return [...termVars(p.e), ...termVars(p.a), ...termVars(p.v)];
  }
  return [];
}

function patternVars(p: PatternClause): string[] {
  return [...termVars(p.e), ...termVars(p.a), ...termVars(p.v)];
}

/** Dynamic selectivity given currently-bound vars — more resolved positions first. */
function dynamicSelectivity(p: PatternClause, bound: Set<string>): number {
  const known = (t: Term) =>
    t.kind === "const" || (t.kind === "var" && bound.has(t.name));
  let score = 0;
  if (known(p.a)) score += 4;
  if (known(p.e)) score += 2;
  if (known(p.v)) score += 1;
  return score;
}

// --- fetching (facts ∪ derivedFacts) ---------------------------------------

function factsVisible(rows: Doc<"facts">[], coord: BitemporalCoord): Triple[] {
  return rows
    .filter((r) => isVisible(r, coord))
    .map((r) => ({ e: r.e, a: r.a, v: r.v, prov: [r._id] }));
}

function derivedVisible(
  rows: Doc<"derivedFacts">[],
  coord: BitemporalCoord,
): Triple[] {
  // Derived facts have no transaction-time/tombstone lifecycle; they're valid
  // while not stale and within their valid interval. Their provenance is the
  // base facts they were derived from.
  return rows
    .filter(
      (r) =>
        r.stale !== true &&
        r.validFrom <= coord.validTime &&
        (r.validTo === undefined || r.validTo > coord.validTime),
    )
    .map((r) => ({ e: r.e, a: r.a, v: r.v, prov: r.sourceFactIds ?? [] }));
}

/**
 * Fetch triples matching a pattern under the current binding, from both the
 * canonical fact log and materialized derived facts, via the best index.
 */
async function fetchPattern(
  ctx: Ctx,
  clause: PatternClause,
  binding: Binding,
  coord: BitemporalCoord,
  readFilter: ReadFilter,
): Promise<Triple[]> {
  const e = resolve(clause.e, binding);
  const a = resolve(clause.a, binding);
  const vv = resolve(clause.v, binding);
  const eConst = e.kind === "const" ? e.value : undefined;
  const aConst = a.kind === "const" ? a.value : undefined;
  const vIsConst = vv.kind === "const";
  const vConst = vIsConst ? (vv as { value: unknown }).value : undefined;
  const n = LIMITS.maxClauseScan;

  let out: Triple[];

  if (eConst !== undefined && aConst !== undefined) {
    const f = await ctx.db
      .query("facts")
      .withIndex("by_e_a", (q) =>
        q.eq("e", String(eConst)).eq("a", String(aConst)),
      )
      .take(n);
    const d = await ctx.db
      .query("derivedFacts")
      .withIndex("by_e_a", (q) =>
        q.eq("e", String(eConst)).eq("a", String(aConst)),
      )
      .take(n);
    out = [...factsVisible(f, coord), ...derivedVisible(d, coord)];
    if (vIsConst) out = out.filter((r) => valueKey(r.v) === valueKey(vConst));
  } else if (aConst !== undefined && vIsConst) {
    const f = await ctx.db
      .query("facts")
      .withIndex("by_a_v", (q) => q.eq("a", String(aConst)).eq("v", vConst))
      .take(n);
    const d = await ctx.db
      .query("derivedFacts")
      .withIndex("by_a_v", (q) => q.eq("a", String(aConst)).eq("v", vConst))
      .take(n);
    out = [...factsVisible(f, coord), ...derivedVisible(d, coord)];
  } else if (aConst !== undefined) {
    const f = await ctx.db
      .query("facts")
      .withIndex("by_a", (q) => q.eq("a", String(aConst)))
      .take(n);
    const d = await ctx.db
      .query("derivedFacts")
      .withIndex("by_a", (q) => q.eq("a", String(aConst)))
      .take(n);
    out = [...factsVisible(f, coord), ...derivedVisible(d, coord)];
  } else if (eConst !== undefined) {
    const f = await ctx.db
      .query("facts")
      .withIndex("by_e", (q) => q.eq("e", String(eConst)))
      .take(n);
    const d = await ctx.db
      .query("derivedFacts")
      .withIndex("by_e", (q) => q.eq("e", String(eConst)))
      .take(n);
    out = [...factsVisible(f, coord), ...derivedVisible(d, coord)];
  } else {
    throw new Error(
      "unbounded clause: each pattern must resolve its entity or attribute to a constant (directly or via an earlier join)",
    );
  }

  if (!readFilter) return out;

  const filtered: Triple[] = [];
  for (const triple of out) {
    if (
      await canReadAttribute(
        ctx as QueryCtx,
        readFilter.principal,
        triple.e,
        triple.a,
      )
    ) {
      filtered.push(triple);
    }
  }
  return filtered;
}

// --- unification / comparison / negation -----------------------------------

function unify(
  clause: PatternClause,
  binding: Binding,
  triple: Triple,
): Binding | null {
  const next: Binding = { ...binding };
  for (const [term, fieldVal] of [
    [clause.e, triple.e],
    [clause.a, triple.a],
    [clause.v, triple.v],
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

function compareValues(left: unknown, op: string, right: unknown): boolean {
  if (op === "==") return valueKey(left) === valueKey(right);
  if (op === "!=") return valueKey(left) !== valueKey(right);
  let cmp: number;
  if (typeof left === "number" && typeof right === "number") {
    cmp = left - right;
  } else {
    cmp = String(left).localeCompare(String(right));
  }
  switch (op) {
    case ">":
      return cmp > 0;
    case "<":
      return cmp < 0;
    case ">=":
      return cmp >= 0;
    case "<=":
      return cmp <= 0;
    default:
      throw new Error(`unknown comparison operator: ${op}`);
  }
}

function satisfiesCompare(clause: CompareClause, binding: Binding): boolean {
  const l = resolve(clause.left, binding);
  const r = resolve(clause.right, binding);
  if (l.kind !== "const" || r.kind !== "const") {
    throw new Error(
      `comparison '${clause.op}' has an unbound variable — its operands must be bound by an earlier clause`,
    );
  }
  return compareValues(l.value, clause.op, r.value);
}

/** A binding survives a not-clause only if NO visible triple matches its pattern. */
async function passesNegation(
  ctx: Ctx,
  clause: NotClause,
  binding: Binding,
  coord: BitemporalCoord,
  readFilter: ReadFilter,
): Promise<boolean> {
  const candidates = await fetchPattern(ctx, clause.pattern, binding, coord, readFilter);
  for (const t of candidates) {
    if (unify(clause.pattern, binding, t) !== null) return false;
  }
  return true;
}

// --- the join scheduler -----------------------------------------------------

/**
 * Evaluate a Datalog `where` body to bindings, each tagged with the base-fact
 * provenance that justifies it. Patterns are joined via indexed nested loops
 * over facts ∪ derivedFacts; comparison and negation clauses run as filters as
 * soon as their variables are bound (they prune but add no positive provenance).
 * Non-recursive and bounded by LIMITS.
 */
export async function solveWhere(
  ctx: Ctx,
  where: unknown[],
  coord: BitemporalCoord,
  seed: Binding = {},
  options: { enforceReadAuth?: boolean } = {},
): Promise<SolvedBinding[]> {
  const readFilter = options.enforceReadAuth
    ? { principal: await readPrincipal(ctx as QueryCtx) }
    : null;
  const clauses = parseClauses(where);
  const remaining = clauses.map((_, i) => i);
  const bound = new Set<string>(Object.keys(seed));
  let states: SolvedBinding[] = [{ binding: { ...seed }, sources: [] }];

  while (remaining.length > 0) {
    // Prefer a runnable filter (compare/not whose vars are all bound) — cheap
    // and prunes the binding set before more pattern fan-out.
    let pickAt = remaining.findIndex((i) => {
      const c = clauses[i];
      return (
        c.kind !== "pattern" &&
        requiredVars(c).every((vn) => bound.has(vn))
      );
    });

    if (pickAt === -1) {
      // Otherwise pick the most selective remaining pattern.
      let best = -1;
      let bestScore = -1;
      for (let k = 0; k < remaining.length; k++) {
        const c = clauses[remaining[k]];
        if (c.kind !== "pattern") continue;
        const s = dynamicSelectivity(c, bound);
        if (s > bestScore) {
          bestScore = s;
          best = k;
        }
      }
      if (best === -1) {
        throw new Error(
          "query is unsafe: a comparison or negation clause has variables that no pattern binds",
        );
      }
      pickAt = best;
    }

    const idx = remaining.splice(pickAt, 1)[0];
    const clause = clauses[idx];

    if (clause.kind === "pattern") {
      const next: SolvedBinding[] = [];
      for (const st of states) {
        const candidates = await fetchPattern(
          ctx,
          clause,
          st.binding,
          coord,
          readFilter,
        );
        for (const t of candidates) {
          const extended = unify(clause, st.binding, t);
          if (extended) {
            next.push({
              binding: extended,
              sources: mergeSources(st.sources, t.prov),
            });
          }
        }
        if (next.length > LIMITS.maxIntermediateRows) {
          throw new Error(
            `query exceeded maxIntermediateRows=${LIMITS.maxIntermediateRows}`,
          );
        }
      }
      for (const vn of patternVars(clause)) bound.add(vn);
      states = next;
    } else if (clause.kind === "compare") {
      states = states.filter((st) => satisfiesCompare(clause, st.binding));
    } else {
      const kept: SolvedBinding[] = [];
      for (const st of states) {
        if (await passesNegation(ctx, clause, st.binding, coord, readFilter)) {
          kept.push(st);
        }
      }
      states = kept;
    }

    if (states.length === 0) break;
  }

  return states;
}

function mergeSources(
  a: Id<"facts">[],
  b: Id<"facts">[],
): Id<"facts">[] {
  if (b.length === 0) return a;
  const set = new Set<string>(a as unknown as string[]);
  for (const id of b) set.add(id as unknown as string);
  return [...set] as unknown as Id<"facts">[];
}

/**
 * Evaluate a Datalog `where` body to variable bindings (provenance discarded).
 * Thin wrapper over solveWhere for callers that only need the bindings.
 */
export async function runWhere(
  ctx: Ctx,
  where: unknown[],
  coord: BitemporalCoord,
  seed: Binding = {},
  options: { enforceReadAuth?: boolean } = {},
): Promise<Binding[]> {
  const solved = await solveWhere(ctx, where, coord, seed, options);
  return solved.map((s) => s.binding);
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

// --- aggregation ------------------------------------------------------------

export type AggOp = "count" | "countDistinct" | "sum" | "avg" | "min" | "max";
export type AggSpec = { op: AggOp; var?: string; as: string };

function stripVar(s: string): string {
  return s.startsWith("?") ? s.slice(1) : s;
}

function computeAgg(op: AggOp, values: unknown[], rowCount: number): unknown {
  switch (op) {
    case "count":
      // count() = rows; count(?v) = rows where ?v is bound.
      return values.length === 0
        ? rowCount
        : values.filter((v) => v !== undefined && v !== null).length;
    case "countDistinct":
      return new Set(
        values.filter((v) => v !== undefined && v !== null).map(valueKey),
      ).size;
    case "sum": {
      const nums = values.filter((v): v is number => typeof v === "number");
      return nums.reduce((a, b) => a + b, 0);
    }
    case "avg": {
      const nums = values.filter((v): v is number => typeof v === "number");
      return nums.length === 0
        ? null
        : nums.reduce((a, b) => a + b, 0) / nums.length;
    }
    case "min":
    case "max": {
      const present = values.filter((v) => v !== undefined && v !== null);
      if (present.length === 0) return null;
      const cmp = (a: unknown, b: unknown) =>
        typeof a === "number" && typeof b === "number"
          ? a - b
          : String(a).localeCompare(String(b));
      return present.reduce((acc, v) =>
        op === "min" ? (cmp(v, acc) < 0 ? v : acc) : (cmp(v, acc) > 0 ? v : acc),
      );
    }
  }
}

/**
 * Group bindings by the groupBy variables and compute aggregates per group.
 * groupBy may be empty (single group over all rows). Returns one row per group
 * with the group key variables plus each aggregate under its `as` name.
 */
export function aggregateBindings(
  bindings: Binding[],
  groupBy: string[],
  specs: AggSpec[],
): Record<string, unknown>[] {
  const groupVars = groupBy.map(stripVar);
  const groups = new Map<
    string,
    { key: Record<string, unknown>; rows: Binding[] }
  >();

  for (const b of bindings) {
    const k = JSON.stringify(groupVars.map((g) => valueKey(b[g])));
    let group = groups.get(k);
    if (!group) {
      const key: Record<string, unknown> = {};
      for (const g of groupVars) key[g] = b[g];
      group = { key, rows: [] };
      groups.set(k, group);
    }
    group.rows.push(b);
  }

  const out: Record<string, unknown>[] = [];
  for (const group of groups.values()) {
    const row: Record<string, unknown> = { ...group.key };
    for (const spec of specs) {
      const values = spec.var
        ? group.rows.map((r) => r[stripVar(spec.var!)])
        : [];
      row[spec.as] = computeAgg(spec.op, values, group.rows.length);
    }
    out.push(row);
  }
  return out;
}

/** A human-readable description of how a query will be classified (for explain). */
export function describeClauses(where: unknown[]) {
  const fmt = (t: Term) =>
    t.kind === "var" ? `?${t.name}` : JSON.stringify(t.value);
  return parseClauses(where).map((c) => {
    if (c.kind === "pattern") {
      return { kind: "pattern", e: fmt(c.e), a: fmt(c.a), v: fmt(c.v) };
    }
    if (c.kind === "compare") {
      return {
        kind: "compare",
        left: fmt(c.left),
        op: c.op,
        right: fmt(c.right),
      };
    }
    const p = c.pattern;
    return { kind: "not", e: fmt(p.e), a: fmt(p.a), v: fmt(p.v) };
  });
}

// --- rule locality (used by materialization) --------------------------------

export function entityVarOf(emitE: string): string | null {
  return emitE.startsWith("?") ? emitE.slice(1) : null;
}

/**
 * A datalog rule is "entity-local" when every pattern clause's subject is
 * either a constant or the rule's emitted entity variable — so its output for
 * an entity depends only on facts about that entity and can recompute
 * incrementally. Comparison/negation clauses don't affect locality.
 */
export function isEntityLocalRule(where: unknown[], emitE: string): boolean {
  const ev = entityVarOf(emitE);
  if (ev === null) return false;
  for (const c of parseClauses(where)) {
    const subject = c.kind === "pattern" ? c.e : c.kind === "not" ? c.pattern.e : null;
    if (subject && subject.kind === "var" && subject.name !== ev) return false;
  }
  return true;
}
