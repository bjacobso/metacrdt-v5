import { FunctionImpl, GroupImpl } from "@confect/server";
import { Effect, Layer } from "effect";
import { fromEvents, visibleAsserts, type Event } from "@metacrdt/core";
import {
  asCoreValue,
  convexActorType,
  protocolEventFromRows,
  summarizeProtocolEvent,
} from "@metacrdt/convex";

import api from "./_generated/api";
import { DatabaseReader } from "./_generated/services";
import {
  DerivedExplanation as DerivedExplanationSchema,
  ConfigHistoryEntry as ConfigHistoryEntrySchema,
  InvalidProtocolEvent,
  ProtocolEventSummary as ProtocolEventSummarySchema,
  UnknownDerivedFact,
  UnknownEntity,
} from "./metacrdt.spec";
import type { DerivedFacts } from "./tables/DerivedFacts";
import type { FactEvents } from "./tables/FactEvents";
import type { Transactions } from "./tables/Transactions";

type DerivedFactDoc = typeof DerivedFacts.Doc.Type;
type FactEventDoc = typeof FactEvents.Doc.Type;
type TransactionDoc = typeof Transactions.Doc.Type;
type DerivedExplanation = typeof DerivedExplanationSchema.Type;
type ConfigHistoryEntry = typeof ConfigHistoryEntrySchema.Type;
type ProtocolEventSummary = typeof ProtocolEventSummarySchema.Type;

type ConfigKind =
  | "attribute"
  | "entityType"
  | "form"
  | "flow"
  | "requirement"
  | "action";

type ConfigItem = {
  kind: ConfigKind;
  value: string;
};

const CONFIG_ENTITY = "config:default";
const OWN_ATTR: Record<ConfigKind, string> = {
  attribute: "owns.attribute",
  entityType: "owns.entityType",
  form: "owns.form",
  flow: "owns.flow",
  requirement: "owns.requirement",
  action: "owns.action",
};
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

function summary(row: FactEventDoc, tx: TransactionDoc): ProtocolEventSummary {
  return summarizeProtocolEvent(row, tx) as ProtocolEventSummary;
}

function transactionId(tx: TransactionDoc): FactEventDoc["txId"] {
  return (tx as TransactionDoc & { _id: FactEventDoc["txId"] })._id;
}

function factEventId(row: FactEventDoc): string {
  return (row as FactEventDoc & { _id: string })._id;
}

function reconstructEvent(row: FactEventDoc, tx: TransactionDoc): Event | null {
  const protocol = protocolEventFromRows(row, tx);
  if (protocol !== null) return protocol;
  if (row.kind === "correction") return null;
  const base = {
    id: row.eventId ?? `legacy:${factEventId(row)}`,
    actor: tx.actorId,
    actorType: convexActorType(tx.actorType),
    hlc: row.hlc ?? {
      pt: row.txTime,
      l: 0,
      r: row.replicaId ?? "convex:legacy",
    },
    causalRefs: [...(row.causalRefs ?? [])],
    reason: row.reason ?? tx.reason,
  };
  if (row.kind === "assert") {
    return {
      ...base,
      kind: "assert",
      e: row.e,
      a: row.a,
      v: asCoreValue(row.v),
      validFrom: row.validFrom ?? row.txTime,
      validTo: row.validTo ?? null,
    };
  }
  if (row.targetEventId === undefined) return null;
  return {
    ...base,
    kind: row.kind,
    target: row.targetEventId,
  };
}

function eventCounts(events: ReadonlyArray<{ kind: string }>) {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.kind, (counts.get(event.kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, count]) => ({ kind, count }));
}

function changedKinds(added: ConfigItem[], removed: ConfigItem[]): ConfigKind[] {
  return [...new Set([...added, ...removed].map((item) => item.kind))].sort(
    (a, b) => a.localeCompare(b),
  );
}

function typedError(err: unknown): UnknownEntity | InvalidProtocolEvent {
  if (err instanceof UnknownEntity || err instanceof InvalidProtocolEvent) {
    return err;
  }
  return new InvalidProtocolEvent({
    eventId: "(decode-or-read)",
    reason: err instanceof Error ? err.message : String(err),
  });
}

function typedExplanationError(
  err: unknown,
): UnknownDerivedFact | InvalidProtocolEvent {
  if (err instanceof UnknownDerivedFact || err instanceof InvalidProtocolEvent) {
    return err;
  }
  return new InvalidProtocolEvent({
    eventId: "(decode-or-read)",
    reason: err instanceof Error ? err.message : String(err),
  });
}

const verifyEvents = FunctionImpl.make(
  api,
  "metacrdt",
  "verifyEvents",
  ({ e, a, limit, requireValid }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const take = Math.max(1, Math.min(limit ?? 50, 200));
      const rows =
        a === undefined
          ? yield* reader
              .table("factEvents")
              .index("by_e", (q) => q.eq("e", e), "desc")
              .take(take)
          : yield* reader
              .table("factEvents")
              .index("by_e_a_tx", (q) => q.eq("e", e).eq("a", a), "desc")
              .take(take);

      if (rows.length === 0) {
        return yield* Effect.fail(new UnknownEntity({ e }));
      }

      const out = yield* Effect.forEach(rows, (row) =>
        Effect.gen(function* () {
          const tx = yield* reader.table("transactions").get(row.txId);
          const s = summary(row, tx);
          if (requireValid === true && s.hasProtocolMetadata && !s.validEventId) {
            return yield* Effect.fail(
              new InvalidProtocolEvent({
                eventId: s.eventId ?? "(missing)",
                reason: "eventId does not verify against @metacrdt/core",
              }),
            );
          }
          return s;
        }),
      );

      return out;
    }).pipe(Effect.mapError(typedError)),
);

const explainDerived = FunctionImpl.make(
  api,
  "metacrdt",
  "explainDerived",
  ({ e, a }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const rows: ReadonlyArray<DerivedFactDoc> =
        a === undefined
          ? yield* reader
              .table("derivedFacts")
              .index("by_e", (q) => q.eq("e", e))
              .take(200)
          : yield* reader
              .table("derivedFacts")
              .index("by_e_a", (q) => q.eq("e", e).eq("a", a))
              .take(200);
      const derived = rows.filter((row) => !row.stale);

      if (derived.length === 0) {
        return yield* Effect.fail(
          new UnknownDerivedFact({
            e,
            ...(a === undefined ? {} : { a }),
          }),
        );
      }

      const out = yield* Effect.forEach(derived, (row) =>
        Effect.gen(function* () {
          if ((row.sourceEventIds ?? []).length === 0) {
            return yield* Effect.fail(
              new InvalidProtocolEvent({
                eventId: "(missing)",
                reason: "derived row does not carry sourceEventIds",
              }),
            );
          }

          const because = yield* Effect.forEach(row.sourceEventIds ?? [], (eventId) =>
            Effect.gen(function* () {
              const matches = yield* reader
                .table("factEvents")
                .index("by_eventId", (q) => q.eq("eventId", eventId))
                .take(2);
              const source = matches[0];
              if (source === undefined || source.kind !== "assert") {
                return yield* Effect.fail(
                  new InvalidProtocolEvent({
                    eventId,
                    reason: "source event is missing or is not an assert",
                  }),
                );
              }
              const tx = yield* reader.table("transactions").get(source.txId);
              return {
                eventId,
                ...(source.factId === undefined
                  ? {}
                  : { factId: source.factId as string }),
                e: source.e,
                a: source.a,
                v: source.v,
                assertedAt: source.txTime,
                actor: tx.actorId,
                ...(tx.reason === undefined ? {} : { reason: tx.reason }),
                txTime: tx.txTime,
              };
            }),
          );

          return {
            e: row.e,
            a: row.a,
            v: row.v,
            derivedAt: row.derivedAt,
            because,
          } satisfies DerivedExplanation;
        }),
      );

      return out;
    }).pipe(Effect.mapError(typedExplanationError)),
);

const configHistory = FunctionImpl.make(
  api,
  "metacrdt",
  "configHistory",
  ({ limit }) =>
    Effect.gen(function* () {
      const reader = yield* DatabaseReader;
      const take = Math.max(1, Math.min(limit ?? 20, 100));

      const manifestSnapshot = (txTime: number) =>
        Effect.gen(function* () {
          const coord = { txTime, validTime: txTime };
          const allEvents: Event[] = [];
          for (const attr of Object.values(OWN_ATTR)) {
            const rows = yield* reader
              .table("factEvents")
              .index("by_e_a_tx", (q) => q.eq("e", CONFIG_ENTITY).eq("a", attr), "desc")
              .take(1000);
            for (const row of rows) {
              if (row.txTime > txTime) continue;
              const tx = yield* reader.table("transactions").get(row.txId);
              const event = reconstructEvent(row, tx);
              if (event !== null) allEvents.push(event);
            }
          }
          const log = fromEvents(allEvents);
          const out = new Set<string>();
          for (const [kind, attr] of Object.entries(OWN_ATTR)) {
            const visible = visibleAsserts(CONFIG_ENTITY, attr, coord, log);
            for (const ev of visible) {
              out.add(itemKey({ kind: kind as ConfigKind, value: String(ev.v) }));
            }
          }
          return out;
        });

      const directEvents = (tx: TransactionDoc) =>
        Effect.gen(function* () {
          const rows = yield* reader
            .table("factEvents")
            .index("by_tx", (q) => q.eq("txId", transactionId(tx)))
            .take(500);
          return rows
            .map((ev) => ({
              kind: ev.kind,
              e: ev.e,
              a: ev.a,
              v: ev.v,
              ...(ev.reason === undefined ? {} : { reason: ev.reason }),
            }))
            .sort((a, b) =>
              `${a.e}:${a.a}:${a.kind}`.localeCompare(`${b.e}:${b.a}:${b.kind}`),
            );
        });

      const txs = yield* reader
        .table("transactions")
        .index("by_actor", (q) => q.eq("actorId", "config"), "desc")
        .take(take);

      return yield* Effect.forEach(txs, (tx) =>
        Effect.gen(function* () {
          const before = yield* manifestSnapshot(tx.txTime - 0.001);
          const after = yield* manifestSnapshot(tx.txTime);
          const added = sorted(
            [...after].filter((key) => !before.has(key)).map(fromKey),
          );
          const removed = sorted(
            [...before].filter((key) => !after.has(key)).map(fromKey),
          );
          const events = yield* directEvents(tx);
          return {
            txTime: tx.txTime,
            actorId: tx.actorId,
            ...(tx.reason === undefined ? {} : { reason: tx.reason }),
            added,
            removed,
            changedKinds: changedKinds(added, removed),
            totalManifestChanges: added.length + removed.length,
            eventCounts: eventCounts(events),
            events,
          } satisfies ConfigHistoryEntry;
        }),
      );
    }).pipe(
      Effect.mapError(
        (err) =>
          new InvalidProtocolEvent({
            eventId: "(config-history)",
            reason: err instanceof Error ? err.message : String(err),
          }),
      ),
    ),
);

export const metacrdt = GroupImpl.make(api, "metacrdt").pipe(
  Layer.provide(verifyEvents),
  Layer.provide(explainDerived),
  Layer.provide(configHistory),
);
