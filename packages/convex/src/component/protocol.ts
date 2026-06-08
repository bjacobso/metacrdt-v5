import { v } from "convex/values";
import { query } from "./_generated/server.js";
import {
  buildAssertFactEvent,
  buildLifecycleFactEvent,
  summarizeProtocolEvent,
} from "../index.js";
import type { ConvexTransactionRow, ProtocolFactEventRow } from "../types.js";

const actorType = v.union(
  v.literal("user"),
  v.literal("system"),
  v.literal("agent"),
  v.literal("migration"),
);

const txValidator = v.object({
  _creationTime: v.number(),
  actorId: v.string(),
  actorType,
  txTime: v.number(),
  reason: v.optional(v.string()),
});

const hlcValidator = v.object({
  pt: v.number(),
  l: v.number(),
  r: v.string(),
});

const protocolKind = v.union(
  v.literal("assert"),
  v.literal("retract"),
  v.literal("tombstone"),
  v.literal("untombstone"),
  v.literal("correction"),
);

const protocolRowValidator = v.object({
  txId: v.optional(v.string()),
  txTime: v.number(),
  eventId: v.optional(v.string()),
  hlc: v.optional(hlcValidator),
  replicaId: v.optional(v.string()),
  seq: v.optional(v.number()),
  targetEventId: v.optional(v.string()),
  causalRefs: v.optional(v.array(v.string())),
  kind: protocolKind,
  e: v.string(),
  a: v.string(),
  v: v.any(),
  validFrom: v.optional(v.number()),
  validTo: v.optional(v.number()),
  reason: v.optional(v.string()),
  factId: v.optional(v.string()),
  metadata: v.optional(v.any()),
});

const builtRowValidator = v.object({
  txId: v.string(),
  txTime: v.number(),
  kind: v.union(
    v.literal("assert"),
    v.literal("retract"),
    v.literal("tombstone"),
    v.literal("untombstone"),
  ),
  factId: v.optional(v.string()),
  e: v.string(),
  a: v.string(),
  v: v.any(),
  validFrom: v.optional(v.number()),
  validTo: v.optional(v.number()),
  reason: v.optional(v.string()),
  metadata: v.optional(v.any()),
  eventId: v.string(),
  hlc: hlcValidator,
  replicaId: v.string(),
  targetEventId: v.optional(v.string()),
  causalRefs: v.optional(v.array(v.string())),
});

const eventSummaryValidator = v.object({
  eventId: v.optional(v.string()),
  kind: protocolKind,
  e: v.string(),
  a: v.string(),
  v: v.any(),
  txTime: v.number(),
  actor: v.string(),
  actorType: v.union(
    v.literal("human"),
    v.literal("system"),
    v.literal("agent"),
    v.literal("migration"),
  ),
  validFrom: v.optional(v.number()),
  validTo: v.optional(v.number()),
  hlc: v.optional(hlcValidator),
  targetEventId: v.optional(v.string()),
  causalRefs: v.array(v.string()),
  hasProtocolMetadata: v.boolean(),
  verifiable: v.boolean(),
  validEventId: v.boolean(),
  reason: v.optional(v.string()),
});

const rowAndTxValidator = v.object({
  row: protocolRowValidator,
  tx: txValidator,
});

export const buildAssertRow = query({
  args: {
    tx: txValidator,
    txId: v.string(),
    factId: v.optional(v.string()),
    e: v.string(),
    a: v.string(),
    v: v.any(),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
    reason: v.optional(v.string()),
    metadata: v.optional(v.any()),
    causalRefs: v.optional(v.array(v.string())),
  },
  returns: builtRowValidator,
  handler: async (_ctx, args) =>
    buildAssertFactEvent({
      ...args,
      tx: args.tx as ConvexTransactionRow,
    }).row,
});

export const buildLifecycleRow = query({
  args: {
    tx: txValidator,
    txId: v.string(),
    factId: v.optional(v.string()),
    kind: v.union(
      v.literal("retract"),
      v.literal("tombstone"),
      v.literal("untombstone"),
    ),
    targetEventId: v.string(),
    e: v.string(),
    a: v.string(),
    v: v.any(),
    validTo: v.optional(v.number()),
    reason: v.optional(v.string()),
    metadata: v.optional(v.any()),
    causalRefs: v.optional(v.array(v.string())),
  },
  returns: builtRowValidator,
  handler: async (_ctx, args) =>
    buildLifecycleFactEvent({
      ...args,
      tx: args.tx as ConvexTransactionRow,
    }).row,
});

export const summarizeRow = query({
  args: rowAndTxValidator,
  returns: eventSummaryValidator,
  handler: async (_ctx, args) =>
    summarizeProtocolEvent(
      args.row as ProtocolFactEventRow,
      args.tx as ConvexTransactionRow,
    ),
});

export const summarizeRows = query({
  args: {
    inputs: v.array(rowAndTxValidator),
  },
  returns: v.array(eventSummaryValidator),
  handler: async (_ctx, args) =>
    args.inputs.map(({ row, tx }) =>
      summarizeProtocolEvent(
        row as ProtocolFactEventRow,
        tx as ConvexTransactionRow,
      ),
    ),
});
