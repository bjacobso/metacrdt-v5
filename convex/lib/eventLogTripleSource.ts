import { fromEvents, visibleAsserts, type Event } from "@metacrdt/core";
import {
  protocolEventFromRows,
  type ConvexTransactionRow,
  type ProtocolFactEventRow,
} from "@metacrdt/convex";
import { Doc, Id } from "../_generated/dataModel";
import { LIMITS, type PatternInput, type Triple, type TripleSource } from "./engine";
import { canReadAttribute } from "./readAuth";
import { valueKey } from "./visibility";

function txForCore(tx: Doc<"transactions">): ConvexTransactionRow {
  return {
    _creationTime: tx._creationTime,
    actorId: tx.actorId,
    actorType: tx.actorType,
    txTime: tx.txTime,
    reason: tx.reason,
  };
}

function rowForCore(row: Doc<"factEvents">): ProtocolFactEventRow {
  return {
    txTime: row.txTime,
    eventId: row.eventId,
    hlc: row.hlc,
    replicaId: row.replicaId,
    seq: row.seq,
    targetEventId: row.targetEventId,
    causalRefs: row.causalRefs,
    kind: row.kind,
    e: row.e,
    a: row.a,
    v: row.v,
    validFrom: row.validFrom,
    validTo: row.validTo,
    reason: row.reason,
  };
}

type EventRow = { ev: Event; row: Doc<"factEvents"> };

async function protocolEventsForRows(
  ctx: Parameters<TripleSource>[0],
  rows: Doc<"factEvents">[],
): Promise<EventRow[]> {
  const out: EventRow[] = [];
  for (const row of rows) {
    const tx = await ctx.db.get(row.txId);
    if (tx === null) continue;
    const ev = protocolEventFromRows(rowForCore(row), txForCore(tx));
    if (ev !== null) out.push({ ev, row });
  }
  return out;
}

async function fetchCandidateFactEvents(
  ctx: Parameters<TripleSource>[0],
  input: PatternInput,
): Promise<Doc<"factEvents">[]> {
  const { eConst, aConst } = input;
  const n = LIMITS.maxClauseScan;
  if (eConst !== undefined && aConst !== undefined) {
    return await ctx.db
      .query("factEvents")
      .withIndex("by_e_a_tx", (q) =>
        q.eq("e", String(eConst)).eq("a", String(aConst)),
      )
      .take(n);
  }
  if (aConst !== undefined) {
    return await ctx.db
      .query("factEvents")
      .withIndex("by_a_tx", (q) => q.eq("a", String(aConst)))
      .take(n);
  }
  if (eConst !== undefined) {
    return await ctx.db
      .query("factEvents")
      .withIndex("by_e", (q) => q.eq("e", String(eConst)))
      .take(n);
  }
  throw new Error(
    "unbounded clause: each pattern must resolve its entity or attribute to a constant (directly or via an earlier join)",
  );
}

/**
 * Triple source over base facts folded directly from protocol-shaped
 * `factEvents`. `prov` carries the assertion row's projected `factId` when one
 * exists, so callers that still store `sourceFactIds` can preserve provenance
 * while moving the solve itself off the `facts` projection.
 */
export const eventLogTripleSource: TripleSource = async (
  ctx,
  input,
  coord,
  readFilter,
) => {
  const rows = await fetchCandidateFactEvents(ctx, input);
  const eventRows = await protocolEventsForRows(ctx, rows);
  const events = eventRows.map(({ ev }) => ev);
  const log = fromEvents(events);
  const sourceFactIdsByEventId = new Map<string, Id<"facts">[]>();
  for (const { ev, row } of eventRows) {
    if (ev.kind === "assert" && row.factId !== undefined) {
      sourceFactIdsByEventId.set(ev.id, [row.factId]);
    }
  }
  const keys =
    input.eConst !== undefined && input.aConst !== undefined
      ? [[String(input.eConst), String(input.aConst)] as const]
      : [...new Set(events.flatMap((ev) =>
          ev.kind === "assert" && ev.e !== undefined && ev.a !== undefined
            ? [`${ev.e}\u0000${ev.a}`]
            : [],
        ))].map((k) => k.split("\u0000") as [string, string]);

  const out: Triple[] = [];
  for (const [e, a] of keys) {
    for (const ev of visibleAsserts(e, a, coord, log)) {
      if (input.vIsConst && valueKey(ev.v) !== valueKey(input.vConst)) {
        continue;
      }
      if (
        readFilter !== null &&
        !(await canReadAttribute(ctx, readFilter.principal, ev.e!, ev.a!))
      ) {
        continue;
      }
      out.push({
        e: ev.e!,
        a: ev.a!,
        v: ev.v,
        prov: sourceFactIdsByEventId.get(ev.id) ?? [],
      });
    }
  }
  return out;
};

async function derivedTriplesForInput(
  ctx: Parameters<TripleSource>[0],
  input: PatternInput,
): Promise<Doc<"derivedFacts">[]> {
  const { eConst, aConst, vConst, vIsConst } = input;
  const n = LIMITS.maxClauseScan;
  if (eConst !== undefined && aConst !== undefined) {
    return await ctx.db
      .query("derivedFacts")
      .withIndex("by_e_a", (q) =>
        q.eq("e", String(eConst)).eq("a", String(aConst)),
      )
      .take(n);
  }
  if (aConst !== undefined && vIsConst) {
    return await ctx.db
      .query("derivedFacts")
      .withIndex("by_a_v", (q) => q.eq("a", String(aConst)).eq("v", vConst))
      .take(n);
  }
  if (aConst !== undefined) {
    return await ctx.db
      .query("derivedFacts")
      .withIndex("by_a", (q) => q.eq("a", String(aConst)))
      .take(n);
  }
  if (eConst !== undefined) {
    return await ctx.db
      .query("derivedFacts")
      .withIndex("by_e", (q) => q.eq("e", String(eConst)))
      .take(n);
  }
  throw new Error(
    "unbounded clause: each pattern must resolve its entity or attribute to a constant (directly or via an earlier join)",
  );
}

/**
 * Triple source that composes event-log base facts with the existing
 * materialized derived projection. This is the production-compatible midpoint:
 * base facts no longer need `facts`, while derived facts remain projection-backed
 * until rule output itself is fully folded from the event log.
 */
export const eventLogBaseWithDerivedTripleSource: TripleSource = async (
  ctx,
  input,
  coord,
  readFilter,
) => {
  const base = await eventLogTripleSource(ctx, input, coord, readFilter);
  const derivedRows = await derivedTriplesForInput(ctx, input);
  const derived: Triple[] = [];
  for (const row of derivedRows) {
    if (row.stale === true) continue;
    if (row.validFrom > coord.validTime) continue;
    if (row.validTo !== undefined && row.validTo <= coord.validTime) continue;
    if (input.vIsConst && valueKey(row.v) !== valueKey(input.vConst)) {
      continue;
    }
    if (
      readFilter !== null &&
      !(await canReadAttribute(ctx, readFilter.principal, row.e, row.a))
    ) {
      continue;
    }
    derived.push({
      e: row.e,
      a: row.a,
      v: row.v,
      prov: row.sourceFactIds as Id<"facts">[],
    });
  }
  return [...base, ...derived];
};
