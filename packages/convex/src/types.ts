import type { ActorType, EventId, Hlc, Value } from "@metacrdt/core";

export const CONVEX_REPLICA_ID = "convex:reference";

export type ConvexActorType = "user" | "system" | "agent" | "migration";

export type ConvexTransactionRow = {
  readonly _creationTime: number;
  readonly actorId: string;
  readonly actorType: ConvexActorType;
  readonly txTime: number;
  readonly reason?: string;
};

export type ProtocolEventPatch = {
  readonly eventId: string;
  readonly hlc: Hlc;
  readonly replicaId: string;
  readonly targetEventId?: string;
  readonly causalRefs?: string[];
};

export type FactProjectionRow = {
  readonly _id?: string;
  readonly e: string;
  readonly a: string;
  readonly v: unknown;
  readonly assertedAt: number;
  readonly retractedAt?: number;
  readonly validFrom: number;
  readonly validTo?: number;
  readonly tombstonedAt?: number;
  readonly assertEventId?: string;
};

export type ProtocolFactEventKind =
  | "assert"
  | "retract"
  | "tombstone"
  | "untombstone"
  | "correction";

export type ProtocolFactEventRow = {
  readonly txTime: number;
  readonly eventId?: string;
  readonly hlc?: Hlc;
  readonly replicaId?: string;
  readonly seq?: number;
  readonly targetEventId?: string;
  readonly causalRefs?: readonly string[];
  readonly kind: ProtocolFactEventKind;
  readonly e: string;
  readonly a: string;
  readonly v: unknown;
  readonly validFrom?: number;
  readonly validTo?: number;
  readonly reason?: string;
};

export type ProtocolEventSummary = {
  readonly eventId?: string;
  readonly kind: ProtocolFactEventKind;
  readonly e: string;
  readonly a: string;
  readonly v: unknown;
  readonly txTime: number;
  readonly actor: string;
  readonly actorType: ActorType;
  readonly validFrom?: number;
  readonly validTo?: number;
  readonly hlc?: Hlc;
  readonly targetEventId?: string;
  readonly causalRefs: string[];
  readonly hasProtocolMetadata: boolean;
  readonly verifiable: boolean;
  readonly validEventId: boolean;
  readonly reason?: string;
};

export type BitemporalCoord = {
  readonly txTime: number;
  readonly validTime: number;
};

export type VisibilityOpts = {
  readonly includeTombstoned?: boolean;
  readonly includeRetracted?: boolean;
};

export function convexActorType(t: ConvexActorType): ActorType {
  return t === "user" ? "human" : t;
}

export function asCoreValue(v: unknown): Value {
  return v as Value;
}
