import { fromEvents, visibleAsserts, type Event } from "@metacrdt/core";
import {
  protocolEventFromRows,
  type ConvexTransactionRow,
  type ProtocolFactEventRow,
} from "@metacrdt/convex";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { BitemporalCoord } from "./visibility";

const DEFAULT_SCAN = 2_000;

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

function legacyEventId(row: Doc<"factEvents">): string {
  return `legacy:${row._id}`;
}

function legacyEventFromRow(
  row: Doc<"factEvents">,
  tx: Doc<"transactions">,
  legacyTargetByFactId: Map<string, string>,
): Event | null {
  if (row.kind === "correction") return null;
  const base = {
    id: legacyEventId(row),
    kind: row.kind,
    actor: tx.actorId,
    actorType: tx.actorType === "user" ? ("human" as const) : tx.actorType,
    hlc: {
      pt: row.txTime,
      l: Math.max(0, Math.floor(row._creationTime * 1000)),
      r: "convex:legacy",
    },
    reason: row.reason ?? tx.reason,
    causalRefs: [...(row.causalRefs ?? [])],
  };
  if (row.kind === "assert") {
    return {
      ...base,
      kind: "assert",
      e: row.e,
      a: row.a,
      v: row.v as Event["v"],
      validFrom: row.validFrom ?? row.txTime,
      validTo: row.validTo ?? null,
    };
  }
  const target =
    row.targetEventId ??
    (row.factId === undefined
      ? undefined
      : legacyTargetByFactId.get(String(row.factId)));
  if (target === undefined) return null;
  return {
    ...base,
    kind: row.kind,
    target,
  };
}

async function factEventsForEntity(
  ctx: QueryCtx,
  e: string,
  a: string | undefined,
  limit: number,
): Promise<Doc<"factEvents">[]> {
  if (a !== undefined) {
    return await ctx.db
      .query("factEvents")
      .withIndex("by_e_a_tx", (q) => q.eq("e", e).eq("a", a))
      .take(limit);
  }
  return await ctx.db
    .query("factEvents")
    .withIndex("by_e", (q) => q.eq("e", e))
    .take(limit);
}

export type CurrentEventLogAssert = {
  e: string;
  a: string;
  v: unknown;
  eventId: string;
};

/**
 * Current visible assertions for one entity, folded directly from `factEvents`.
 * This deliberately has no read-auth dependency, so authorization policy itself
 * can use it without creating an eventLogTripleSource -> readAuth cycle.
 */
export async function currentEventLogAsserts(
  ctx: QueryCtx,
  args: {
    e: string;
    a?: string;
    coord?: BitemporalCoord;
    limit?: number;
  },
): Promise<CurrentEventLogAssert[]> {
  const coord = args.coord ?? {
    txTime: Date.now(),
    validTime: Date.now(),
  };
  const rows = await factEventsForEntity(
    ctx,
    args.e,
    args.a,
    args.limit ?? DEFAULT_SCAN,
  );
  const legacyTargetByFactId = new Map<string, string>();
  for (const row of rows) {
    if (row.kind === "assert" && row.factId !== undefined) {
      legacyTargetByFactId.set(String(row.factId), row.eventId ?? legacyEventId(row));
    }
  }

  const events: Event[] = [];
  for (const row of rows) {
    const tx = await ctx.db.get(row.txId);
    if (tx === null) continue;
    const protocol = protocolEventFromRows(rowForCore(row), txForCore(tx));
    const ev = protocol ?? legacyEventFromRow(row, tx, legacyTargetByFactId);
    if (ev !== null) events.push(ev);
  }

  const log = fromEvents(events);
  const keys =
    args.a !== undefined
      ? ([[args.e, args.a]] as const)
      : ([...new Set(events.flatMap((ev) =>
          ev.kind === "assert" && ev.e === args.e && ev.a !== undefined
            ? [ev.a]
            : [],
        ))].map((a) => [args.e, a] as const));

  const out: CurrentEventLogAssert[] = [];
  for (const [e, a] of keys) {
    for (const ev of visibleAsserts(e, a, coord, log)) {
      out.push({ e: ev.e!, a: ev.a!, v: ev.v, eventId: ev.id });
    }
  }
  return out;
}
