/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { attrId } from "./lib/meta";
import { isVisible } from "./lib/visibility";
import {
  fromEvents,
  valueOf as coreValueOf,
  verifyId,
  type Event,
} from "@metacrdt/core";
import { protocolEventFromRows, valueKey } from "@metacrdt/convex";

const modules = import.meta.glob("./**/*.ts");

// The Convex leg of the convergence proof (specs/vision/convergence.md §5):
// the write-path projections (facts, currentFacts) are maintained
// incrementally in arrival order, while SPEC §5 defines state as the pure
// @metacrdt/core fold over the protocol event log. This suite replays the
// stored factEvents through the core fold and requires the projections to
// agree with that oracle — at now, at a historic coordinate, and after a
// drift-injecting rebuild.

const WORKER = "worker:oracle";
const STATUS = "oracle.status";
const TAG = "oracle.tag";
const CERT = "oracle.cert";

const cardinalityOf = (a: string): "one" | "many" =>
  a === STATUS || a === "cardinality" ? "one" : "many";

type Harness = ReturnType<ReturnType<typeof convexTest>["withIdentity"]>;

async function reconstructLog(t: Harness): Promise<Event[]> {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query("factEvents").collect();
    const events: Event[] = [];
    for (const row of rows) {
      const tx = await ctx.db.get("transactions", row.txId);
      if (!tx) throw new Error(`transaction ${row.txId} missing`);
      const event = protocolEventFromRows(row, {
        actorId: tx.actorId,
        actorType: tx.actorType,
        reason: tx.reason,
      });
      if (!event) throw new Error(`factEvents row ${row._id} is not protocol-shaped`);
      events.push(event);
    }
    return events;
  });
}

function sortedKeys(values: unknown[]): string[] {
  return values.map(valueKey).sort();
}

/** Core-fold oracle for one (e, a) at a coordinate, as sorted value keys. */
function oracleValues(
  events: readonly Event[],
  e: string,
  a: string,
  coord: { txTime: number; validTime: number },
): string[] {
  const v = coreValueOf(e, a, coord, fromEvents(events), cardinalityOf);
  if (v === undefined) return [];
  return sortedKeys(Array.isArray(v) ? v : [v]);
}

async function currentProjectionValues(
  t: Harness,
  e: string,
  a: string,
): Promise<string[]> {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("currentFacts")
      .withIndex("by_e_a", (q) => q.eq("e", e).eq("a", a))
      .collect();
    return sortedKeys(rows.map((r) => r.v));
  });
}

async function factsProjectionValues(
  t: Harness,
  e: string,
  a: string,
  coord: { txTime: number; validTime: number },
): Promise<string[]> {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query("facts")
      .withIndex("by_e_a", (q) => q.eq("e", e).eq("a", a))
      .collect();
    return sortedKeys(rows.filter((f) => isVisible(f, coord)).map((f) => f.v));
  });
}

async function expectProjectionsMatchOracle(
  t: Harness,
  events: readonly Event[],
  now: number,
) {
  const coord = { txTime: now, validTime: now };
  for (const a of [STATUS, TAG, CERT]) {
    const oracle = oracleValues(events, WORKER, a, coord);
    expect(await currentProjectionValues(t, WORKER, a), `currentFacts(${a})`).toEqual(
      oracle,
    );
    expect(
      await factsProjectionValues(t, WORKER, a, coord),
      `facts-at-now(${a})`,
    ).toEqual(oracle);
  }
}

describe("convex projection vs core-fold oracle", () => {
  test("write-path projections agree with the fold over the stored event log", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000_000);
      const t = convexTest(schema, modules).withIdentity({
        tokenIdentifier: "system",
      });

      // Schema-as-facts: oracle.status is cardinality-one.
      await t.mutation(api.facts.assertFact, {
        e: attrId(STATUS),
        a: "cardinality",
        value: "one",
      });
      vi.advanceTimersByTime(1_000);

      // Cardinality-one supersession race: two asserts, later one wins.
      await t.mutation(api.facts.assertFact, {
        e: WORKER,
        a: STATUS,
        value: "active",
      });
      vi.advanceTimersByTime(1_000);
      await t.mutation(api.facts.assertFact, {
        e: WORKER,
        a: STATUS,
        value: "terminated",
      });
      vi.advanceTimersByTime(1_000);

      // Cardinality-many set with retract + tombstone lifecycles.
      const alpha = await t.mutation(api.facts.assertFact, {
        e: WORKER,
        a: TAG,
        value: "alpha",
      });
      const beta = await t.mutation(api.facts.assertFact, {
        e: WORKER,
        a: TAG,
        value: "beta",
      });
      await t.mutation(api.facts.assertFact, {
        e: WORKER,
        a: TAG,
        value: "gamma",
      });
      vi.advanceTimersByTime(1_000);
      const midTx = Date.now();
      vi.advanceTimersByTime(1_000);

      await t.mutation(api.facts.retractFact, { factId: beta.factId });
      await t.mutation(api.facts.tombstoneFact, {
        factId: alpha.factId,
        reason: "oracle test tombstone",
      });
      vi.advanceTimersByTime(1_000);

      // An assert whose validity has already lapsed at write time: visible to
      // no coordinate at/after now, so it must not surface in currentFacts.
      await t.mutation(api.facts.assertFact, {
        e: WORKER,
        a: CERT,
        value: "expired-cert",
        validTo: Date.now() - 10_000,
      });
      await t.finishAllScheduledFunctions(vi.runAllTimers);

      const events = await reconstructLog(t);
      // Stored log integrity: every row reconstructs to a content-addressed
      // event whose id verifies (SPEC §4.2: implementations MUST verify).
      for (const event of events) expect(verifyId(event)).toBe(true);

      // Sanity on the fold itself before comparing projections.
      const now = Date.now();
      expect(oracleValues(events, WORKER, STATUS, { txTime: now, validTime: now }))
        .toEqual(["string:terminated"]);
      expect(oracleValues(events, WORKER, TAG, { txTime: now, validTime: now }))
        .toEqual(["string:gamma"]);
      expect(oracleValues(events, WORKER, CERT, { txTime: now, validTime: now }))
        .toEqual([]);

      // 1. Now-coordinate: incrementally-maintained projections == oracle.
      await expectProjectionsMatchOracle(t, events, now);

      // 2. Historic coordinate (before retract/tombstone): the bitemporal
      // facts projection must agree with the fold as-of that coordinate.
      const histCoord = { txTime: midTx, validTime: midTx };
      for (const a of [STATUS, TAG, CERT]) {
        expect(
          await factsProjectionValues(t, WORKER, a, histCoord),
          `facts-as-of-mid(${a})`,
        ).toEqual(oracleValues(events, WORKER, a, histCoord));
      }
      expect(oracleValues(events, WORKER, TAG, histCoord)).toEqual([
        "string:alpha",
        "string:beta",
        "string:gamma",
      ]);

      // 3. Drift repair: corrupt the projections, rebuild from the log, and
      // the oracle agreement must be restored (the log is the source of truth).
      await t.run(async (ctx) => {
        const current = await ctx.db.query("currentFacts").collect();
        for (const row of current) await ctx.db.delete(row._id);
        const betaFact = await ctx.db.get(beta.factId);
        if (!betaFact) throw new Error("beta fact missing");
        await ctx.db.patch(beta.factId, { retractedAt: undefined });
      });
      await t.mutation(internal.rebuild.rebuildProjections, {});
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      await expectProjectionsMatchOracle(t, events, Date.now());
    } finally {
      vi.useRealTimers();
    }
  });
});
