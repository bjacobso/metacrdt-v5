import { query, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { eventLogTripleSource } from "./lib/eventLogTripleSource";
import { project, runWhere } from "./lib/engine";

type ConfigKind =
  | "attribute"
  | "entityType"
  | "form"
  | "flow"
  | "requirement"
  | "action"
  | "view";

type ConfigItem = {
  kind: ConfigKind;
  value: string;
};

type ConfigEvent = {
  kind: string;
  e: string;
  a: string;
  v: unknown;
  reason: string | undefined;
};

const CONFIG_ENTITY = "config:default";
const OWN_ATTR: Record<ConfigKind, string> = {
  attribute: "owns.attribute",
  entityType: "owns.entityType",
  form: "owns.form",
  flow: "owns.flow",
  requirement: "owns.requirement",
  action: "owns.action",
  view: "owns.view",
};
const ATTR_KIND = new Map(
  Object.entries(OWN_ATTR).map(([kind, attr]) => [attr, kind as ConfigKind]),
);

function itemKey(i: ConfigItem): string {
  return `${i.kind}\u0000${i.value}`;
}

function fromKey(key: string): ConfigItem {
  const [kind, value] = key.split("\u0000");
  return { kind: kind as ConfigKind, value };
}

function sorted(items: Iterable<ConfigItem>): ConfigItem[] {
  return [...items].sort((a, b) =>
    `${a.kind}:${a.value}`.localeCompare(`${b.kind}:${b.value}`),
  );
}

async function manifestSnapshot(
  ctx: QueryCtx,
  txTime: number,
): Promise<Set<string>> {
  const coord = { txTime, validTime: txTime };
  const rows = project(
    await runWhere(
      ctx,
      [[CONFIG_ENTITY, "?a", "?v"]],
      coord,
      {},
      { source: eventLogTripleSource },
    ),
    ["?a", "?v"],
  );
  const out = new Set<string>();
  for (const row of rows) {
    const kind = ATTR_KIND.get(String(row.a));
    if (!kind) continue;
    out.add(itemKey({ kind, value: String(row.v) }));
  }
  return out;
}

async function directEvents(ctx: QueryCtx, tx: Doc<"transactions">) {
  const events = await ctx.db
    .query("factEvents")
    .withIndex("by_tx", (q) => q.eq("txId", tx._id))
    .take(500);
  return events
    .map((ev) => ({
      kind: ev.kind,
      e: ev.e,
      a: ev.a,
      v: ev.v,
      reason: ev.reason,
    }))
    .sort((a, b) => `${a.e}:${a.a}:${a.kind}`.localeCompare(`${b.e}:${b.a}:${b.kind}`));
}

function eventCounts(events: ConfigEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const event of events) {
    out[event.kind] = (out[event.kind] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(out).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function changedKinds(
  added: ConfigItem[],
  removed: ConfigItem[],
): ConfigKind[] {
  return [...new Set([...added, ...removed].map((item) => item.kind))].sort(
    (a, b) => a.localeCompare(b),
  );
}

function counts(keys: Set<string>): Record<ConfigKind, number> {
  const out: Record<ConfigKind, number> = {
    attribute: 0,
    entityType: 0,
    form: 0,
    flow: 0,
    requirement: 0,
    action: 0,
    view: 0,
  };
  for (const key of keys) out[fromKey(key).kind]++;
  return out;
}

/**
 * Config history/diff: every transaction authored by `actorId=config`, annotated
 * with the owned-artifact manifest just before and just after that transaction.
 *
 * `applyConfig` lowers sections through existing mutations, then writes the
 * stable ownership manifest on `config:default`. Diffing manifest snapshots
 * avoids reporting idempotent re-assertions as additions.
 */
export const history = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 20, 100);
    const txs = await ctx.db
      .query("transactions")
      .withIndex("by_actor", (q) => q.eq("actorId", "config"))
      .order("desc")
      .take(limit);

    const out = [];
    for (const tx of txs) {
      const before = await manifestSnapshot(ctx, tx.txTime - 0.001);
      const after = await manifestSnapshot(ctx, tx.txTime);
      const added = [...after]
        .filter((key) => !before.has(key))
        .map(fromKey);
      const removed = [...before]
        .filter((key) => !after.has(key))
        .map(fromKey);
      const events = await directEvents(ctx, tx);
      out.push({
        txId: tx._id,
        txTime: tx.txTime,
        actorId: tx.actorId,
        reason: tx.reason,
        added: sorted(added),
        removed: sorted(removed),
        changedKinds: changedKinds(added, removed),
        totalManifestChanges: added.length + removed.length,
        afterCounts: counts(after),
        eventCounts: eventCounts(events),
        events,
      });
    }
    return out;
  },
});

/** Current configured-artifact manifest, grouped by kind. */
export const currentManifest = query({
  args: {},
  handler: async (ctx) => {
    const snap = await manifestSnapshot(ctx, Date.now());
    const grouped: Record<ConfigKind, string[]> = {
      attribute: [],
      entityType: [],
      form: [],
      flow: [],
      requirement: [],
      action: [],
      view: [],
    };
    for (const key of snap) {
      const item = fromKey(key);
      grouped[item.kind].push(item.value);
    }
    for (const values of Object.values(grouped)) values.sort();
    return grouped;
  },
});
