// The immutable, content-addressed Event (SPEC §3.4, §4.2). An event asserts,
// retracts, tombstones, or untombstones a fact. `id` is the base32 SHA-256 of the
// canonical encoding of the event's immutable fields (everything except id, seq,
// and sig) — so the same event computed on two replicas gets the same id, making
// the G-Set union idempotent (SPEC §4.3).

import { Hlc } from "./hlc.js";
import { Value, canonicalBytes } from "./value.js";
import { sha256 } from "./sha256.js";
import { base32 } from "./base32.js";

export type EventId = string;
export type EventKind = "assert" | "retract" | "tombstone" | "untombstone";
export type ActorType = "human" | "agent" | "system" | "migration";

/** The fields that define an event's identity (hashed). */
export interface EventBody {
  readonly kind: EventKind;
  readonly actor: string;
  readonly actorType: ActorType;
  readonly hlc: Hlc;
  // assert:
  readonly e?: string;
  readonly a?: string;
  readonly v?: Value;
  readonly validFrom?: number;
  readonly validTo?: number | null;
  // retract | tombstone | untombstone:
  readonly target?: EventId;
  readonly causalRefs?: readonly EventId[];
  readonly reason?: string;
}

export interface Event extends EventBody {
  readonly id: EventId;
  readonly seq?: number; // per-replica sync bookkeeping; excluded from id
  readonly sig?: string; // detached signature over id; excluded from id
}

/** Build the canonical hash preimage value (SPEC §4.2): body fields only. */
function preimage(b: EventBody): Value {
  const p: Record<string, Value> = {
    kind: b.kind,
    actor: b.actor,
    actorType: b.actorType,
    hlc: [b.hlc.pt, b.hlc.l, b.hlc.r],
    causalRefs: [...(b.causalRefs ?? [])],
  };
  if (b.e !== undefined) p.e = b.e;
  if (b.a !== undefined) p.a = b.a;
  if (b.v !== undefined) p.v = b.v;
  if (b.validFrom !== undefined) p.validFrom = b.validFrom;
  if (b.validTo !== undefined) p.validTo = b.validTo;
  if (b.target !== undefined) p.target = b.target;
  if (b.reason !== undefined) p.reason = b.reason;
  return p;
}

/** The content address of an event body (SPEC §4.2). */
export function eventId(b: EventBody): EventId {
  return "e_" + base32(sha256(canonicalBytes(preimage(b))));
}

/** Seal a body into an Event by computing its id. */
export function seal(b: EventBody, extra?: { seq?: number; sig?: string }): Event {
  return { ...b, id: eventId(b), ...extra };
}

/** Recompute and verify an event's id (SPEC §4.2 — implementations MUST verify). */
export function verifyId(e: Event): boolean {
  return eventId(e) === e.id;
}

// --- builders ---------------------------------------------------------------

export interface AssertInput {
  e: string;
  a: string;
  v: Value;
  validFrom: number;
  validTo?: number | null;
  actor: string;
  actorType?: ActorType;
  hlc: Hlc;
  causalRefs?: readonly EventId[];
  reason?: string;
}

export function assert(input: AssertInput): Event {
  return seal({
    kind: "assert",
    actor: input.actor,
    actorType: input.actorType ?? "human",
    hlc: input.hlc,
    e: input.e,
    a: input.a,
    v: input.v,
    validFrom: input.validFrom,
    validTo: input.validTo ?? null,
    causalRefs: input.causalRefs,
    reason: input.reason,
  });
}

export interface TargetInput {
  target: EventId;
  actor: string;
  actorType?: ActorType;
  hlc: Hlc;
  causalRefs?: readonly EventId[];
  reason?: string;
}

function targeted(kind: Exclude<EventKind, "assert">, input: TargetInput): Event {
  return seal({
    kind,
    actor: input.actor,
    actorType: input.actorType ?? "human",
    hlc: input.hlc,
    target: input.target,
    causalRefs: input.causalRefs,
    reason: input.reason,
  });
}

export const retract = (i: TargetInput): Event => targeted("retract", i);
export const tombstone = (i: TargetInput): Event => targeted("tombstone", i);
export const untombstone = (i: TargetInput): Event => targeted("untombstone", i);
