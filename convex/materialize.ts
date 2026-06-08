import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { isEntityLocalRule, solveWhere, LIMITS } from "./lib/engine";
import { isVisible, valueKey } from "./lib/visibility";
import { SolvedBinding } from "./lib/engine";

/**
 * Reacts to a fact change: find enabled rules that depend on the changed
 * attribute and schedule recomputation. Entity-local rules recompute only for
 * the changed entity (incremental); cross-entity rules recompute in full. Each
 * scheduled change is recorded in ruleInvalidations and cleared once processed.
 */
export const processFactChange = internalMutation({
  args: {
    e: v.string(),
    a: v.string(),
    factId: v.id("facts"),
    txTime: v.number(),
    changeKind: v.optional(
      v.union(
        v.literal("assert"),
        v.literal("retract"),
        v.literal("tombstone"),
        v.literal("correction"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const enabled = await ctx.db
      .query("rules")
      .withIndex("by_enabled", (q) => q.eq("enabled", true))
      .collect();

    const affected = enabled.filter((r) =>
      r.dependsOnAttributes.includes(args.a),
    );

    for (const rule of affected) {
      await ctx.db.insert("ruleInvalidations", {
        ruleId: rule._id,
        e: args.e,
        causedByFactId: args.factId,
        txTime: args.txTime,
      });

      if (rule.materialization === "manual") continue;

      if (rule.kind === "closure") {
        // Adding an edge only ever adds reachable pairs → semi-naive delta.
        // Removing/correcting an edge can invalidate arbitrary pairs → full.
        if (args.changeKind === "assert") {
          const fact = await ctx.db.get("facts", args.factId);
          if (fact) {
            await ctx.scheduler.runAfter(
              0,
              internal.materialize.incrementalClosureAdd,
              {
                ruleId: rule._id,
                u: fact.e,
                w: String(fact.v),
                edgeFactId: fact._id,
              },
            );
          }
        } else {
          await markAllDerivedStale(ctx, rule._id);
          await ctx.scheduler.runAfter(
            0,
            internal.materialize.recomputeTransitiveClosure,
            { ruleId: rule._id },
          );
        }
        continue;
      }

      if (
        rule.emit !== undefined &&
        isEntityLocalRule((rule.where ?? []) as unknown[], rule.emit.e)
      ) {
        // Incremental: only this entity's derived output can have changed.
        await markEntityDerivedStale(ctx, rule._id, args.e);
        await ctx.scheduler.runAfter(
          0,
          internal.materialize.recomputeRuleForEntity,
          { ruleId: rule._id, e: args.e },
        );
      } else {
        const affectedEntities = await affectedOutputEntitiesForFact(
          ctx,
          rule,
          args.factId,
        );
        if (affectedEntities !== null) {
          for (const e of affectedEntities) {
            await markEntityDerivedStale(ctx, rule._id, e);
          }
          await ctx.scheduler.runAfter(
            0,
            internal.materialize.recomputeRuleForEntities,
            {
              ruleId: rule._id,
              entities: affectedEntities,
            },
          );
        } else {
          // Constant-emitting or otherwise unsupported cross-entity rules still
          // need the conservative full recompute.
          await markAllDerivedStale(ctx, rule._id);
          await ctx.scheduler.runAfter(0, internal.materialize.recomputeRule, {
            ruleId: rule._id,
          });
        }
      }
    }

    // Event path → durable flows: a submission fact resumes any waiting
    // `collect` run for that (subject, form, scope).
    if (args.changeKind === "assert" && args.a.startsWith("submitted.")) {
      const fact = await ctx.db.get("facts", args.factId);
      if (fact) {
        await ctx.scheduler.runAfter(0, internal.flows.resumeOnSubmission, {
          subject: args.e,
          form: args.a.slice("submitted.".length),
          scope: String(fact.v),
        });
      }
    }
  },
});

/** Full recompute of a rule's derived facts against current state. */
export const recomputeRule = internalMutation({
  args: { ruleId: v.id("rules") },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get("rules", args.ruleId);
    if (!rule || !rule.enabled) return;
    if (rule.kind === "closure") {
      await ctx.scheduler.runAfter(
        0,
        internal.materialize.recomputeTransitiveClosure,
        { ruleId: args.ruleId },
      );
      return;
    }
    if (rule.emit === undefined) return;

    const now = Date.now();
    const coord = { txTime: now, validTime: now };
    const solved = await solveWhere(ctx, (rule.where ?? []) as unknown[], coord);

    // Clear all prior output for this rule, then re-emit.
    const prior = await ctx.db
      .query("derivedFacts")
      .withIndex("by_rule", (q) => q.eq("ruleId", args.ruleId))
      .collect();
    for (const d of prior) await ctx.db.delete("derivedFacts", d._id);

    await emitSolved(ctx, rule, solved, now);

    await clearInvalidations(ctx, args.ruleId, now);
  },
});

/**
 * Incremental recompute scoped to one entity. Only valid for entity-local
 * rules — seeds the rule's entity variable to `e` so the join touches only
 * facts about that entity, and replaces just that entity's derived output.
 */
export const recomputeRuleForEntity = internalMutation({
  args: { ruleId: v.id("rules"), e: v.string() },
  handler: async (ctx, args) => {
    await recomputeRuleForEntityList(ctx, args.ruleId, [args.e], args.e);
  },
});

/**
 * Incremental recompute scoped to a set of output entities. This is valid for
 * any rule whose `emit.e` is a variable, including cross-entity joins: seeding
 * the emitted entity variable recomputes only that output entity while still
 * allowing the solver to join through related entities as needed.
 */
export const recomputeRuleForEntities = internalMutation({
  args: { ruleId: v.id("rules"), entities: v.array(v.string()) },
  handler: async (ctx, args) => {
    await recomputeRuleForEntityList(ctx, args.ruleId, args.entities);
  },
});

async function recomputeRuleForEntityList(
  ctx: MutationCtx,
  ruleId: Id<"rules">,
  entities: string[],
  invalidationEntity?: string,
): Promise<void> {
  const rule = await ctx.db.get("rules", ruleId);
  if (!rule || !rule.enabled || rule.emit === undefined) return;
  const entityVar = rule.emit.e.startsWith("?")
    ? rule.emit.e.slice(1)
    : null;
  if (entityVar === null) {
    // Cannot scope by output entity; fall back to a full recompute.
    await ctx.scheduler.runAfter(0, internal.materialize.recomputeRule, {
      ruleId,
    });
    return;
  }

  const now = Date.now();
  const coord = { txTime: now, validTime: now };
  const unique = [...new Set(entities)];
  for (const e of unique) {
    const solved = await solveWhere(
      ctx,
      (rule.where ?? []) as unknown[],
      coord,
      { [entityVar]: e },
    );

    // Replace just this entity's derived output for this rule.
    const prior = await ctx.db
      .query("derivedFacts")
      .withIndex("by_rule_e", (q) => q.eq("ruleId", ruleId).eq("e", e))
      .collect();
    for (const d of prior) await ctx.db.delete("derivedFacts", d._id);

    await emitSolved(ctx, rule, solved, now);
  }

  await clearInvalidations(ctx, ruleId, now, invalidationEntity);
}

/**
 * Materialize the transitive closure of a base attribute as derived facts.
 * Reads current edges (e --baseAttribute--> v, where v is an entity ref),
 * computes reachability up to maxDepth via a bounded BFS fixpoint, and emits
 * one derived fact (x, closureAttribute, y) per reachable pair. This is how
 * recursive/transitive logic becomes queryable without running recursion live.
 */
export const recomputeTransitiveClosure = internalMutation({
  args: { ruleId: v.id("rules") },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get("rules", args.ruleId);
    if (!rule || !rule.enabled || rule.closure === undefined) return;
    const { baseAttribute, closureAttribute, maxDepth, reflexive } =
      rule.closure;

    const now = Date.now();
    const coord = { txTime: now, validTime: now };

    // Build adjacency from current visible base-attribute facts, keeping the
    // edge's fact id so each closure pair can carry its path provenance.
    const edgeRows = await ctx.db
      .query("facts")
      .withIndex("by_a", (q) => q.eq("a", baseAttribute))
      .take(LIMITS.maxClauseScan);
    const adj = new Map<string, Array<{ to: string; factId: Id<"facts"> }>>();
    for (const r of edgeRows) {
      if (!isVisible(r, coord)) continue;
      const to = String(r.v);
      if (!adj.has(r.e)) adj.set(r.e, []);
      adj.get(r.e)!.push({ to, factId: r._id });
    }

    // BFS reachability per source, bounded by depth and total pairs; the
    // accumulated edge-fact set on the path is the pair's provenance.
    const pairs: Array<{ from: string; to: string; prov: Id<"facts">[] }> = [];
    let truncated = false;
    outer: for (const source of adj.keys()) {
      const seen = new Set<string>();
      let frontier: Array<{ node: string; prov: Id<"facts">[] }> = [
        { node: source, prov: [] },
      ];
      for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
        const nextFrontier: Array<{ node: string; prov: Id<"facts">[] }> = [];
        for (const { node, prov } of frontier) {
          for (const edge of adj.get(node) ?? []) {
            if (seen.has(edge.to) || edge.to === source) continue;
            seen.add(edge.to);
            const pathProv = [...prov, edge.factId];
            nextFrontier.push({ node: edge.to, prov: pathProv });
            pairs.push({ from: source, to: edge.to, prov: pathProv });
            if (pairs.length >= LIMITS.maxIntermediateRows) {
              truncated = true;
              break outer;
            }
          }
        }
        frontier = nextFrontier;
      }
      if (reflexive) pairs.push({ from: source, to: source, prov: [] });
    }
    if (truncated) {
      console.warn(
        `transitive closure for ${closureAttribute} truncated at ${LIMITS.maxIntermediateRows} pairs`,
      );
    }

    // Replace this rule's prior output.
    const prior = await ctx.db
      .query("derivedFacts")
      .withIndex("by_rule", (q) => q.eq("ruleId", args.ruleId))
      .collect();
    for (const d of prior) await ctx.db.delete("derivedFacts", d._id);

    for (const { from, to, prov } of pairs) {
      await ctx.db.insert("derivedFacts", {
        ruleId: args.ruleId,
        e: from,
        a: closureAttribute,
        v: to,
        sourceFactIds: prov,
        derivedAt: now,
        validFrom: now,
        txWatermark: now,
        stale: false,
      });
    }

    await clearInvalidations(ctx, args.ruleId, now);
  },
});

/**
 * Semi-naive delta for a single new edge u --base--> w. The only new reachable
 * pairs are {predecessors(u) ∪ u} × {successors(w) ∪ w}, computed against the
 * already-materialized closure. Inserts just the pairs not already present —
 * far cheaper than rebuilding the whole closure on every edge added.
 */
export const incrementalClosureAdd = internalMutation({
  args: {
    ruleId: v.id("rules"),
    u: v.string(),
    w: v.string(),
    edgeFactId: v.optional(v.id("facts")),
  },
  handler: async (ctx, args) => {
    const rule = await ctx.db.get("rules", args.ruleId);
    if (!rule || !rule.enabled || rule.closure === undefined) return;
    const { closureAttribute, reflexive } = rule.closure;
    const now = Date.now();
    const edgeProv: Id<"facts">[] = args.edgeFactId ? [args.edgeFactId] : [];

    // predecessors(u): x such that (x --closure--> u) already holds, plus u.
    // Carry each predecessor's path provenance (its x→u source facts).
    const predRows = await ctx.db
      .query("derivedFacts")
      .withIndex("by_a_v", (q) =>
        q.eq("a", closureAttribute).eq("v", args.u),
      )
      .take(LIMITS.maxClauseScan);
    const predProv = new Map<string, Id<"facts">[]>();
    for (const r of predRows) predProv.set(r.e, r.sourceFactIds ?? []);
    predProv.set(args.u, []);

    // successors(w): y such that (w --closure--> y) already holds, plus w.
    const succRows = await ctx.db
      .query("derivedFacts")
      .withIndex("by_e_a", (q) =>
        q.eq("e", args.w).eq("a", closureAttribute),
      )
      .take(LIMITS.maxClauseScan);
    const succProv = new Map<string, Id<"facts">[]>();
    for (const r of succRows) succProv.set(String(r.v), r.sourceFactIds ?? []);
    succProv.set(args.w, []);

    let inserted = 0;
    for (const [x, xProv] of predProv) {
      // Existing closure targets for x, to dedupe in one read per source.
      const existingRows = await ctx.db
        .query("derivedFacts")
        .withIndex("by_e_a", (q) =>
          q.eq("e", x).eq("a", closureAttribute),
        )
        .take(LIMITS.maxClauseScan);
      const existing = new Set<string>(existingRows.map((r) => String(r.v)));
      for (const [y, yProv] of succProv) {
        if (x === y && !reflexive) continue;
        if (existing.has(y)) continue;
        const prov = [...new Set([...xProv, ...edgeProv, ...yProv])];
        await ctx.db.insert("derivedFacts", {
          ruleId: args.ruleId,
          e: x,
          a: closureAttribute,
          v: y,
          sourceFactIds: prov,
          derivedAt: now,
          validFrom: now,
          txWatermark: now,
          stale: false,
        });
        existing.add(y);
        inserted++;
        if (inserted >= LIMITS.maxIntermediateRows) {
          console.warn(
            `incremental closure for ${closureAttribute} hit the pair cap; consider a full recompute`,
          );
          await clearInvalidations(ctx, args.ruleId, now);
          return;
        }
      }
    }

    await clearInvalidations(ctx, args.ruleId, now);
  },
});

// --- helpers ----------------------------------------------------------------

/**
 * For a variable-emitting Datalog rule, find the output entities that could be
 * affected by one changed source fact. Old derived rows whose provenance included
 * the fact cover removals/retractions; current solved bindings whose provenance
 * includes the fact cover additions. Returns `null` when the rule cannot be
 * scoped by output entity and needs a full recompute.
 */
async function affectedOutputEntitiesForFact(
  ctx: MutationCtx,
  rule: Doc<"rules">,
  factId: Id<"facts">,
): Promise<string[] | null> {
  if (rule.emit === undefined) return null;
  const entityVar = rule.emit.e.startsWith("?")
    ? rule.emit.e.slice(1)
    : null;
  if (entityVar === null) return null;

  const fact = await ctx.db.get(factId);
  if (!fact) return null;

  const affected = new Set<string>();
  const factKey = factId as unknown as string;

  const negated = negatedSubjectsForAttribute(
    (rule.where ?? []) as unknown[],
    fact.a,
  );
  for (const subject of negated) {
    if (subject === `?${entityVar}`) {
      affected.add(fact.e);
    } else {
      // A changed negated fact can remove outputs, but this rule shape does not
      // tell us which emitted entities are affected without solving the whole
      // rule's prior state. Use the conservative path.
      return null;
    }
  }

  const prior = await ctx.db
    .query("derivedFacts")
    .withIndex("by_rule", (q) => q.eq("ruleId", rule._id))
    .collect();
  for (const row of prior) {
    const sources = (row.sourceFactIds ?? []) as unknown as string[];
    if (sources.includes(factKey)) affected.add(row.e);
  }

  const now = Date.now();
  const solved = await solveWhere(ctx, (rule.where ?? []) as unknown[], {
    txTime: now,
    validTime: now,
  });
  for (const s of solved) {
    const sources = s.sources as unknown as string[];
    if (!sources.includes(factKey)) continue;
    const e = resolveTerm(rule.emit.e, s.binding);
    if (e !== undefined && e !== null) affected.add(String(e));
  }

  return [...affected];
}

function negatedSubjectsForAttribute(where: unknown[], attr: string): unknown[] {
  const subjects: unknown[] = [];
  for (const clause of where) {
    if (clause && typeof clause === "object" && !Array.isArray(clause)) {
      if ("not" in clause) {
        const pattern = (clause as { not: unknown }).not;
        if (Array.isArray(pattern) && pattern.length === 3 && pattern[1] === attr) {
          subjects.push(pattern[0]);
        }
      } else if ("or" in clause) {
        const branches = (clause as { or: unknown }).or;
        if (Array.isArray(branches)) {
          for (const branch of branches) {
            if (Array.isArray(branch)) {
              subjects.push(...negatedSubjectsForAttribute(branch, attr));
            }
          }
        }
      }
    }
  }
  return subjects;
}

/**
 * Emit a rule's derived facts, deduped by (entity, value): multiple bindings
 * that resolve to the same emitted fact collapse into one row whose provenance
 * is the union of their sources. (E.g. a worker on two placements at the same
 * employer yields one I-9 requirement, justified by either placement.)
 */
async function emitSolved(
  ctx: MutationCtx,
  rule: Doc<"rules">,
  solved: SolvedBinding[],
  now: number,
): Promise<void> {
  if (rule.emit === undefined) return;
  const merged = new Map<
    string,
    { e: string; v: unknown; sources: Set<string> }
  >();
  for (const s of solved) {
    const e = resolveTerm(rule.emit.e, s.binding);
    const value = resolveTerm(rule.emit.v, s.binding);
    if (e === undefined || e === null) continue;
    const key = `${String(e)} ${valueKey(value)}`;
    let m = merged.get(key);
    if (!m) {
      m = { e: String(e), v: value, sources: new Set() };
      merged.set(key, m);
    }
    for (const src of s.sources) m.sources.add(src as unknown as string);
  }
  for (const m of merged.values()) {
    await ctx.db.insert("derivedFacts", {
      ruleId: rule._id,
      e: m.e,
      a: rule.emit.a,
      v: m.v,
      sourceFactIds: [...m.sources] as unknown as Id<"facts">[],
      derivedAt: now,
      validFrom: now,
      txWatermark: now,
      stale: false,
    });
  }
}

async function markEntityDerivedStale(
  ctx: MutationCtx,
  ruleId: Id<"rules">,
  e: string,
): Promise<void> {
  const rows = await ctx.db
    .query("derivedFacts")
    .withIndex("by_rule_e", (q) => q.eq("ruleId", ruleId).eq("e", e))
    .collect();
  for (const d of rows) {
    if (!d.stale) await ctx.db.patch("derivedFacts", d._id, { stale: true });
  }
}

async function markAllDerivedStale(
  ctx: MutationCtx,
  ruleId: Id<"rules">,
): Promise<void> {
  const rows = await ctx.db
    .query("derivedFacts")
    .withIndex("by_rule", (q) => q.eq("ruleId", ruleId))
    .collect();
  for (const d of rows) {
    if (!d.stale) await ctx.db.patch("derivedFacts", d._id, { stale: true });
  }
}

async function clearInvalidations(
  ctx: MutationCtx,
  ruleId: Id<"rules">,
  now: number,
  e?: string,
): Promise<void> {
  const pending = await ctx.db
    .query("ruleInvalidations")
    .withIndex("by_rule_processed", (q) =>
      q.eq("ruleId", ruleId).eq("processedAt", undefined),
    )
    .collect();
  for (const inv of pending) {
    if (e !== undefined && inv.e !== e) continue;
    await ctx.db.patch("ruleInvalidations", inv._id, { processedAt: now });
  }
}

/** Resolve an emit term: `?var` reads from the binding, else it's a constant. */
function resolveTerm(term: unknown, binding: Record<string, unknown>): unknown {
  if (typeof term === "string" && term.startsWith("?")) {
    return binding[term.slice(1)];
  }
  return term;
}
