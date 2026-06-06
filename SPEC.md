# MetaCRDT Protocol Specification

**Version:** 0.1 (Draft · Research Preview)
**Status:** Experimental. Sections marked *[frontier]* describe behavior the
reference implementation ([this repo](./README.md)) models structurally but does
not yet execute across replicas — see [docs/metacrdt.md](./docs/metacrdt.md).

This document specifies the **MetaCRDT protocol**: a convergent representation of
structured, bitemporal, provenance-carrying facts and the operations over them.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT, and MAY are to be interpreted as
in RFC 2119.

---

## 1. Overview

MetaCRDT represents the state of a coordination domain as an **append-only set of
immutable events**. Three properties follow by construction:

1. **Convergence.** The event set is a grow-only set (G-Set), a state-based CRDT.
   Merging two replicas is set union — commutative, associative, and idempotent —
   so replicas that have observed the same events compute identical state. This
   yields Strong Eventual Consistency (SEC).
2. **Convergence-as-projection.** Application state (the current value of an
   attribute, an entity, a view) is a **deterministic fold** of the event set at a
   bitemporal coordinate. Convergence is therefore *computed*, not baked into a
   destructive merge: history is conserved and any coordinate is queryable.
3. **Provenance.** Every event carries authorship, a hybrid logical timestamp, and
   optional causal references, so every derived value can be explained.

### 1.1 Conformance levels

An implementation MAY conform at increasing levels; each subsumes the prior.

| Level | Requires |
| --- | --- |
| **L1 Core** | §3 data model, §4 log/merge, §5 ordering & fold |
| **L2 Bitemporal** | L1 + §5.4 the bitemporal visibility predicate |
| **L3 Derivation** | L2 + §6 deterministic derivation & provenance |
| **L4 Sync** | L3 + §8 anti-entropy synchronization |
| **L5 Coordination** | L4 + §9 capabilities, membership, quorum, authorization |

---

## 2. Terminology

- **Entity** — anything with identity, addressed by an `EntityId`.
- **Attribute** — a typed predicate, addressed by an `AttributeName`.
- **Fact** — a tuple `(e, a, v)` valid over a half-open valid-time interval.
- **Event** — an immutable, content-addressed operation that asserts, retracts,
  tombstones, or untombstones a fact.
- **Log** — the set of all events held by a replica.
- **Projection** — application state derived by folding the log at a coordinate.
- **Replica** — a participant holding a log and a clock (a browser, server,
  Durable Object, or peer).
- **Actor** — the principal responsible for an event (human, agent, system,
  migration).

---

## 3. Data model

### 3.1 Identifiers and values

- `EntityId` — a non-empty UTF-8 string. Convention: `type:local` (e.g.
  `worker:maria`). Opaque to the protocol.
- `AttributeName` — a non-empty UTF-8 string (e.g. `worker.status`).
- `Value` — any value expressible in the canonical value model (§A.1): null,
  boolean, integer, float, string, bytes, ordered array, or string-keyed map.
- `ActorId` — a non-empty UTF-8 string identifying a principal.
- `ReplicaId` — a stable, unique UTF-8 string identifying a replica.
- `EventId` — the content address of an event (§4.2).

### 3.2 Time

Two independent axes:

- **Transaction time** — when the system recorded a fact.
- **Valid time** — when the fact is true in the modeled world (`validFrom`,
  `validTo`), a half-open interval `[validFrom, validTo)`; `validTo = ⊥` means ∞.

Transaction time is carried by a **Hybrid Logical Clock (HLC)**. An HLC timestamp
is `(pt, l, r)` where `pt` is physical wall-clock milliseconds, `l` is a logical
counter, and `r` is the originating `ReplicaId`. Replicas MUST advance their HLC
per the standard algorithm (§A.2) so that timestamps are monotonic per replica and
consistent with causality. The transaction-time *instant* of an event is its
`hlc.pt` (after HLC update).

> Reference mapping: the repo's `transactions.txTime: number` is `hlc.pt`; the
> `(l, r)` components are *[frontier]* — required for multi-replica determinism,
> degenerate (always 0 / single replica) in the centralized runtime.

### 3.3 Fact

A fact is `(e, a, v, validFrom, validTo)`. Facts are never stored directly; they
exist only as the content of Assert events and as fold outputs.

### 3.4 Event

```
Event {
  id:         EventId            // §4.2; excluded from its own hash
  kind:       "assert" | "retract" | "tombstone" | "untombstone"
  actor:      ActorId
  actorType:  "human" | "agent" | "system" | "migration"
  hlc:        { pt: u64, l: u32, r: ReplicaId }
  seq:        u64                // per-replica strictly-increasing (sync bookkeeping)

  // assert:
  e?:         EntityId
  a?:         AttributeName
  v?:         Value
  validFrom?: u64
  validTo?:   u64 | null

  // retract | tombstone | untombstone:
  target?:    EventId            // the Assert this event acts on

  causalRefs: EventId[]          // optional causal dependencies (e.g. corrections)
  reason?:    string
  sig?:       bytes              // optional detached signature over `id`
}
```

Rules:

- An `assert` event MUST carry `e`, `a`, `v`, `validFrom`; `validTo` MAY be `null`.
- A `retract`, `tombstone`, or `untombstone` event MUST carry `target` referencing
  an `assert` event's `EventId`, and MUST NOT carry `e`/`a`/`v`.
- All fields except `id`, `seq`, and `sig` are **immutable and hashed** (§4.2).
- An event, once created, MUST NOT be mutated. Changes are expressed as new events.

A **correction** is not a distinct kind: it is a `tombstone` of the prior assert
plus a new `assert`, where the new assert's `causalRefs` includes the tombstone.

---

## 4. The event log (G-Set CRDT)

### 4.1 Log

A replica's log is a set of events keyed by `EventId`. Events are only ever added.

### 4.2 Content addressing

`EventId = base32( H( canonical(event \ {id, seq, sig}) ) )` where `H` is SHA-256
and `canonical` is the deterministic encoding of §A.1. Therefore:

- Two replicas that independently receive the *same* event compute the *same*
  `EventId` ⇒ union deduplicates it (idempotence).
- Two *distinct* authorings (different actor/hlc) of a semantically similar
  assertion produce *different* events; both are retained and resolved by the fold.

Implementations MUST verify `id` on receipt and MUST reject events whose recomputed
hash does not match.

### 4.3 Merge

```
merge(L1, L2) = L1 ∪ L2
```

`(Logs, ∪)` is a join-semilattice. Merge is commutative, associative, and
idempotent; the empty log is the identity. Consequently, any two replicas that have
observed the same set of events have equal logs, and (with §5) equal projections —
**Strong Eventual Consistency**. Replicas MUST NOT remove events as part of merge.

---

## 5. Ordering and the deterministic fold

### 5.1 Total order

Define a strict total order `≺` over events:

```
e1 ≺ e2  ⟺  hlc(e1) <h hlc(e2)
          ∨ ( hlc(e1) =h hlc(e2) ∧ actor(e1) < actor(e2) )
          ∨ ( hlc(e1) =h hlc(e2) ∧ actor(e1) = actor(e2) ∧ id(e1) < id(e2) )
```

where `<h` compares HLC lexicographically by `(pt, l, r)`. `≺` is total (ties
broken by the content-addressed `id`) and **replica-independent**: every replica
computes the same order over the same events. This is the normative basis for
conflict resolution.

> *[frontier]* The reference implementation today resolves cardinality-one
> supersession by arrival order (single writer). Conformance at L1 REQUIRES the
> `≺`-based rule below; this is the "commutative supersession" item.

### 5.2 Cardinality and supersession

Each attribute has a cardinality, `one` or `many`, itself recorded as a fact
(`(attr:a, "cardinality", …)`; §6) and resolved at the query coordinate. For a
cardinality-`one` `(e, a)`, the current value is the **`≺`-maximal** visible assert.
For cardinality-`many`, all visible asserts coexist. Resolution MUST NOT depend on
insertion or arrival order.

### 5.3 Visibility

An assert event `A` is **visible** at coordinate `C = (txTime, validTime)` over log
`L`, with audit flags `includeRetracted`, `includeTombstoned` (default false), iff:

```
A.kind = "assert"
∧ A.hlc.pt ≤ C.txTime
∧ ( includeRetracted ∨ ¬∃ R ∈ L : R.kind="retract"     ∧ R.target=A.id ∧ R.hlc.pt ≤ C.txTime )
∧ ( includeTombstoned ∨ ¬∃ T ∈ L : T.kind="tombstone"  ∧ T.target=A.id ∧ T.hlc.pt ≤ C.txTime
                                    ∧ ¬∃ U ∈ L : U.kind="untombstone" ∧ U.target=A.id
                                                 ∧ T.hlc.pt < U.hlc.pt ≤ C.txTime )
∧ A.validFrom ≤ C.validTime
∧ ( A.validTo = ⊥ ∨ C.validTime < A.validTo )
```

The default coordinate is `(now, now)`. Setting `txTime` to the past yields *what
was known then*; varying `validTime` independently yields *what is/ was believed
true then* — the two axes are orthogonal.

### 5.4 The fold

```
value(e, a, C, L):
  cands = { A ∈ L : A.e=e ∧ A.a=a ∧ visible(A, C, L) }
  if cardinality(a, C, L) = "one": return max≺(cands)      // ⊥ if empty
  else:                            return cands             // set of asserts

entity(e, C, L): { a ↦ value(e, a, C, L) for each attribute a asserted on e }
```

`value` and `entity` are pure functions of `(L, C)`. Given equal logs, all replicas
compute equal projections at equal coordinates (determinism ⇒ SEC for state).

Projections (`currentFacts`, per-entity views) are disposable caches of this fold
and MAY be materialized; they MUST be reconstructible by replaying `L`.

---

## 6. Derivation (Derived Coherence)

A **rule** is a pure, deterministic function `D(L, C) → DerivedFact[]` over visible
facts. Derived facts (obligations, violations, memberships, computed views) are
**recomputed from shared facts, never transmitted** — they are not part of the
replicated log and MUST NOT be merged between replicas.

Requirements:

- A rule MUST be a deterministic function of the visible fact set at `C`. It MUST
  NOT depend on wall-clock, randomness, replica identity, or evaluation order.
- Each derived fact MUST carry `sourceEventIds: EventId[]` — the asserts that
  justify it — enabling provenance (`explain`).
- Derivation MAY be materialized with a transaction-time watermark and recomputed
  when a dependency changes; materialization is a local optimization and MUST NOT
  affect results.
- Recursion (e.g. transitive closure) MUST be stratified and computed off the live
  path; the protocol does not define unbounded recursive evaluation as a live query.

Because derivation is a deterministic fold over a convergent log, derived state
converges without being synchronized — this is the protocol's central efficiency.

---

## 7. Provenance and identity

- Every event MUST carry `actor` and `actorType`. Agents (`actorType="agent"`)
  participate under identical semantics to humans.
- `causalRefs` MAY record causal dependencies (correction links, derivation inputs,
  approval references). They do not affect `≺` but support explanation and §9.
- Events MAY be signed: `sig` is a detached signature over `id` by the actor's key.
  An L5 implementation SHOULD verify signatures and SHOULD reject events whose
  signature does not validate against the claimed `actor`.
- `explain(derivedFact)` MUST return its `sourceEventIds` resolved to their facts
  and authoring events (actor, hlc, reason).

---

## 8. Synchronization *[frontier]*

Synchronization is **anti-entropy** over the G-Set; any topology that eventually
delivers every event to every interested replica satisfies SEC.

### 8.1 Replica state

Each replica maintains a **version vector** `VV: ReplicaId → u64` mapping each known
replica to the highest `seq` observed from it. Each locally authored event is
assigned the next `seq` for the local `ReplicaId`.

### 8.2 Protocol

```
1. Peers exchange VVs.
2. Each peer computes the delta: events e where e.seq > otherVV[e.hlc.r].
3. Each sends its delta. Recipients verify (§4.2), union into the log (§4.3),
   advance VV, and recompute affected projections (§5–6).
```

Delta exchange is commutative and re-runnable; repeated or partial exchanges
converge. Implementations MUST treat receipt as idempotent (dedupe by `EventId`).

### 8.3 Transport bindings (non-normative)

- **Centralized relay** — a server (e.g. Convex) holds the authoritative log and
  pushes deltas reactively. The reference runtime today.
- **Durable-Object-per-domain** — one edge actor owns one group's log and fans out
  over WebSocket; natural for small, bounded groups.
- **Peer-to-peer** — gossip/CRDT transport; viable at small replica counts.

Transport choice does not change the data model or guarantees.

---

## 9. Coordination profiles *[frontier, optional]*

These are L5 profiles expressed entirely in terms of §3–6 — they add no new merge
machinery.

### 9.1 Capabilities (mint-links)

A capability is an entity `link:L` with facts `{ grants: <resource>, scope, expiry,
maxUses }`, optionally signed by an authorizing actor. **Redeeming** a link emits an
`assert` recording the redemption. Capabilities are revoked by `retract` and expire
by valid time.

### 9.2 Membership as a derived fact

Membership MUST NOT be stored directly; it is derived:

```
member(P, G) ⇐ redeemed(P, link:L) ∧ grants(link:L, G) ∧ ¬revoked(P, G)
```

Because the fold is bitemporal, *"who was a member at coordinate C"* is a query.

### 9.3 Quorum / co-signing

An action is approved when enough members sign — a derived fact via aggregation:

```
approved(X) ⇐ count{ M : member(M,G) ∧ signed(M,X) ∧ ¬expired(M,X) } ≥ quorum(G)
```

Approval is provenance-backed and time-travelable: each signature is an event with
an actor and HLC, and membership is evaluated at signature time.

### 9.4 Attribute-level read authorization

A reader MAY be denied specific attributes. A grant is a fact
`grants-read(Reader, e, a)`. The projection for a reader MUST omit `(e, a)` values
for which no grant is visible and SHOULD emit a `Denied(a)` marker in their place.
Denial is computed in the fold; ungranted values MUST NOT appear in projections,
derivations, or sync deltas delivered to that reader.

---

## 10. Security considerations

- **Integrity** — content addressing (§4.2) makes events tamper-evident; signatures
  (§7) bind events to actors. Without signatures, `actor` is advisory.
- **Authorization** — the protocol converges *all* delivered events; it does not by
  itself prevent a replica from authoring events it should not. Write authorization
  and read partitioning (§9.4) are enforced by the transport/relay and the fold; a
  fully untrusted-peer deployment REQUIRES signatures plus per-reader delta
  filtering.
- **Erasure** — because the log is append-only, hard erasure requires either a
  compacting rewrite of the log (breaking content addresses, a coordinated
  operation) or crypto-shredding (encrypt values, discard keys). Tombstones hide but
  do not erase.
- **Causal integrity** — `causalRefs` are advisory unless signed; do not rely on
  them for security without integrity protection.

---

## 11. Versioning

This document is `metacrdt/0.1`. The wire `version` constant is `"metacrdt/0.1"`.
Implementations MUST reject events/deltas tagged with an unrecognized major version.
Backward-compatible additions (new optional fields, new coordination profiles) are
minor revisions; changes to `≺`, the hash preimage, or the visibility predicate are
major.

---

## Appendix A

### A.1 Canonical encoding

The hash preimage and wire form use a deterministic encoding:

- Maps: keys are UTF-8, sorted by byte order; no duplicate keys.
- Arrays: order-significant.
- Integers: minimal-width two's-complement; floats: IEEE-754 binary64 (NaN/±∞
  encoded as their canonical bit patterns).
- Strings: UTF-8, NFC-normalized.
- The encoding MUST be injective and reproducible across implementations (CBOR with
  canonical/deterministic encoding RECOMMENDED).

### A.2 HLC update (per replica)

```
on local event:
  pt' = max(clock.pt, wallclock())
  l'  = (pt' == clock.pt) ? clock.l + 1 : 0
  clock = (pt', l', selfReplicaId)

on receiving event e:
  pt' = max(clock.pt, e.hlc.pt, wallclock())
  l'  = pt'==clock.pt==e.hlc.pt ? max(clock.l, e.hlc.l)+1
      : pt'==clock.pt           ? clock.l+1
      : pt'==e.hlc.pt           ? e.hlc.l+1
      :                           0
  clock = (pt', l', selfReplicaId)
```

### A.3 Reference mapping (this repo)

| Spec | Repo |
| --- | --- |
| Event (assert/retract/tombstone/untombstone) | `factEvents` (`kind`, `e`, `a`, `v`, `validFrom`, `validTo`) |
| `actor`, `hlc.pt`, `reason` | `transactions.actorId` / `txTime` / `reason` |
| Fold / visibility (§5) | `convex/lib/visibility.ts`, `entityFactsAsOf` |
| Projections | `facts` / `currentFacts` (rebuildable via `rebuildProjections`) |
| Derivation (§6) | `rules` → `derivedFacts`; provenance via `explainDerived` |
| HLC `(l, r)`, `seq`, version vector, sync (§8) | *[frontier]* — not yet implemented |
| Coordination profiles (§9) | compliance = obligations/membership derived; rest designed |
