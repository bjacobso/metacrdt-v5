import { v } from "convex/values";

export const hlcValidator = v.object({
  pt: v.number(),
  l: v.number(),
  r: v.string(),
});

export const protocolMetadataValidators = {
  eventId: v.optional(v.string()),
  hlc: v.optional(hlcValidator),
  replicaId: v.optional(v.string()),
  seq: v.optional(v.number()),
  targetEventId: v.optional(v.string()),
  causalRefs: v.optional(v.array(v.string())),
} as const;
