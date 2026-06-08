import { Doc, Id } from "../_generated/dataModel";
import { QueryCtx, MutationCtx } from "../_generated/server";
import {
  LIMITS,
  applyCompute,
  chooseNextClausePosition,
  clauseBoundVars,
  dedupeProvenancedBindings,
  mergeUniqueSources,
  parseClauses,
  patternInputForBinding,
  patternVars,
  project,
  satisfiesCompare,
  unifyPattern,
  valueKey,
  type AnyClause,
  type Binding,
  type NotClause,
  type PatternInput,
  type PatternClause,
} from "@metacrdt/query";
import { BitemporalCoord, isVisible } from "./visibility";
import { canReadAttribute, readPrincipal } from "./readAuth";

export {
  COMPARISON_OPS,
  COMPUTE_OPS,
  LIMITS,
  aggregateBindings,
  chooseNextClausePosition,
  dedupeProvenancedBindings,
  derivedRowsFromBindings,
  describeClauses,
  entityVarOf,
  isEntityLocalRule,
  paginateRows,
  patternInputForBinding,
  project,
  valueKey,
  type AggOp,
  type AggSpec,
  type Binding,
  type DerivedRow,
  type EmitSpec,
  type PatternInput,
  type ResultPage,
} from "@metacrdt/query";

/** A binding plus the source facts/events that justify it (provenance). */
export type SolvedBinding = {
  binding: Binding;
  sources: Id<"facts">[];
  eventSources?: string[];
};

/**
 * Normalized triple. `prov` is the base-fact provenance of the row: a fact row
 * contributes its own id; a derived-fact row contributes the base facts it was
 * itself derived from (so provenance always resolves to source facts).
 */
export type Triple = {
  e: string;
  a: string;
  v: unknown;
  prov: Id<"facts">[];
  eventProv?: string[];
};

type Ctx = QueryCtx | MutationCtx;
type ReadFilter = { principal: string } | null;
export type TripleSource = (
  ctx: Ctx,
  input: PatternInput,
  coord: BitemporalCoord,
  readFilter: ReadFilter,
) => Promise<Triple[]>;

// --- fetching (facts ∪ derivedFacts) ---------------------------------------

function factsVisible(rows: Doc<"facts">[], coord: BitemporalCoord): Triple[] {
  return rows
    .filter((r) => isVisible(r, coord))
    .map((r) => ({
      e: r.e,
      a: r.a,
      v: r.v,
      prov: [r._id],
      ...(r.assertEventId === undefined ? {} : { eventProv: [r.assertEventId] }),
    }));
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
    .map((r) => ({
      e: r.e,
      a: r.a,
      v: r.v,
      prov: r.sourceFactIds ?? [],
      eventProv: r.sourceEventIds ?? [],
    }));
}

/**
 * Fetch triples matching a pattern under the current binding, from both the
 * canonical fact log and materialized derived facts, via the best index.
 */
async function projectedTripleSource(
  ctx: Ctx,
  input: PatternInput,
  coord: BitemporalCoord,
  readFilter: ReadFilter,
): Promise<Triple[]> {
  const { eConst, aConst, vConst, vIsConst } = input;
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

/**
 * Fetch triples matching a pattern under the current binding. The source is
 * injectable so proof/read-model queries can reuse the same solver over a
 * different fact source (for example direct protocol event-log folds) without
 * duplicating the join scheduler.
 */
async function fetchPattern(
  ctx: Ctx,
  clause: PatternClause,
  binding: Binding,
  coord: BitemporalCoord,
  readFilter: ReadFilter,
  source: TripleSource,
): Promise<Triple[]> {
  return await source(
    ctx,
    patternInputForBinding(clause, binding),
    coord,
    readFilter,
  );
}

// --- unification / comparison / negation -----------------------------------

/** A binding survives a not-clause only if NO visible triple matches its pattern. */
async function passesNegation(
  ctx: Ctx,
  clause: NotClause,
  binding: Binding,
  coord: BitemporalCoord,
  readFilter: ReadFilter,
  source: TripleSource,
): Promise<boolean> {
  const candidates = await fetchPattern(
    ctx,
    clause.pattern,
    binding,
    coord,
    readFilter,
    source,
  );
  for (const t of candidates) {
    if (unifyPattern(clause.pattern, binding, t) !== null) return false;
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
  options: { enforceReadAuth?: boolean; source?: TripleSource } = {},
): Promise<SolvedBinding[]> {
  const readFilter = options.enforceReadAuth
    ? { principal: await readPrincipal(ctx as QueryCtx) }
    : null;
  const source = options.source ?? projectedTripleSource;
  return await solveParsedWhere(
    ctx,
    parseClauses(where),
    coord,
    seed,
    readFilter,
    [],
    [],
    source,
  );
}

async function solveParsedWhere(
  ctx: Ctx,
  clauses: AnyClause[],
  coord: BitemporalCoord,
  seed: Binding,
  readFilter: ReadFilter,
  seedSources: Id<"facts">[],
  seedEventSources: string[],
  source: TripleSource,
): Promise<SolvedBinding[]> {
  const remaining = clauses.map((_, i) => i);
  const bound = new Set<string>(Object.keys(seed));
  let states: SolvedBinding[] = [
    { binding: { ...seed }, sources: seedSources, eventSources: seedEventSources },
  ];

  while (remaining.length > 0) {
    const pickAt = chooseNextClausePosition(clauses, remaining, bound);

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
          source,
        );
        for (const t of candidates) {
          const extended = unifyPattern(clause, st.binding, t);
          if (extended) {
            next.push({
              binding: extended,
              sources: mergeUniqueSources(st.sources, t.prov),
              eventSources: mergeUniqueSources(
                st.eventSources ?? [],
                t.eventProv ?? [],
              ),
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
    } else if (clause.kind === "compute") {
      const next: SolvedBinding[] = [];
      for (const st of states) {
        const computed = applyCompute(clause, st.binding);
        if (computed !== null) {
          next.push({
            binding: computed,
            sources: st.sources,
            eventSources: st.eventSources,
          });
        }
      }
      states = next;
      for (const vn of clauseBoundVars(clause)) bound.add(vn);
    } else if (clause.kind === "not") {
      const kept: SolvedBinding[] = [];
      for (const st of states) {
        if (
          await passesNegation(
            ctx,
            clause,
            st.binding,
            coord,
            readFilter,
            source,
          )
        ) {
          kept.push(st);
        }
      }
      states = kept;
    } else {
      const next: SolvedBinding[] = [];
      for (const st of states) {
        for (const branch of clause.branches) {
          const solved = await solveParsedWhere(
            ctx,
            branch,
            coord,
            st.binding,
            readFilter,
            st.sources,
            st.eventSources ?? [],
            source,
          );
          next.push(...solved);
        }
        if (next.length > LIMITS.maxIntermediateRows) {
          throw new Error(
            `query exceeded maxIntermediateRows=${LIMITS.maxIntermediateRows}`,
          );
        }
      }
      states = dedupeProvenancedBindings(next);
      for (const vn of clauseBoundVars(clause)) bound.add(vn);
    }

    if (states.length === 0) break;
  }

  return states;
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
  options: { enforceReadAuth?: boolean; source?: TripleSource } = {},
): Promise<Binding[]> {
  const solved = await solveWhere(ctx, where, coord, seed, options);
  return solved.map((s) => s.binding);
}
