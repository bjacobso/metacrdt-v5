# Convergence — can the MetaCRDT data structure provably converge across replicas?

**Verdict: yes — and most of the proof is established theory to adopt, not research to invent.**

> **Provenance.** This document synthesizes a deep-research pass (2026-06-09): 5 search
> angles, 24 primary sources fetched, 119 claims extracted, 25 adversarially verified by
> independent 3-vote panels — 24 confirmed 3-0, 1 refuted 0-3 (and the refutation is the
> most instructive finding, see §4). Claims marked **[verified]** survived that process
> verbatim against primary sources; sections marked **[analysis]** are synthesis on top of
> fetched-but-unverified sources and should be treated as informed argument, not citation.

This grounds the frontier claims in [`../reference/positioning.md`](../reference/positioning.md)
("the log is a CRDT today; the multi-replica convergence runtime is research") and the
normative SPEC ([protocol](./triples.md), [`metacrdt-alignment.md`](./metacrdt-alignment.md)).
Action items land in [`../plans/open-ontology-unification.md`](../plans/open-ontology-unification.md)
(Phase 3) and §7 below.

---

## 1. The design decomposes into three provable layers

### 1.1 Merge layer — settled theory **[verified]**

A union-merged set of content-addressed events **is formally a G-Set**, a proven CvRDT:
states ordered by subset inclusion form a monotonic join-semilattice with union as least
upper bound (Shapiro et al., *A comprehensive study of Convergent and Commutative
Replicated Data Types*, INRIA RR-7506, Prop 2.1). Convergence holds under extremely weak
channel assumptions — messages "lost, received out of order, or multiple times" — requiring
only eventual anti-entropy delivery. The [Merkle-CRDTs paper](https://arxiv.org/abs/2004.00107)
(Sanjuán/Pöyhtäri/Teixeira, Protocol Labs) makes our exact correspondence explicit:

> "The Merkle-Clock representation corresponds in fact to a Grow-Only-Set (G-Set) in the
> state-based CRDT form" — with LUB defined as set union.

The result is mechanized in Isabelle/HOL (Gomes et al. 2017). **This layer needs no new
proof — only a correct implementation.**

### 1.2 Delivery layer — the hash-DAG is the messaging layer **[verified]**

Causal delivery does **not** need to come from the transport: the hash-linked DAG
reconstructs causal order itself, supplying verified, exactly-once, in-order delivery even
when the network drops, reorders, corrupts, or duplicates messages (Merkle-CRDTs §V-C:
"Merkle-DAGs provide all the properties of a messaging layer where messages are always
delivered in order, verified and never repeated nor dropped"). This is what makes the
design genuinely offline-capable: partitioned replicas converge on reconnection via DAG
sync, no consensus. Residual assumption is **liveness only** — roots must eventually be
announced and blocks eventually retrievable.

### 1.3 Derivation layer — splits exactly along the CALM theorem **[verified]**

The "derivation converges for free" pillar has a precise theoretical basis and a precise
boundary:

- **Monotone rules converge for free.** The [CALM theorem](https://arxiv.org/abs/1901.01930)
  (Hellerstein & Alvaro; formal proof by Ameloot/Neven/Van den Bussche, PODS 2011): all
  logically monotonic programs are confluent — same final state regardless of message
  reordering/retry — hence eventually consistent **without coordination**. "Monotonic
  programs simply accumulate beliefs; their output depends only on the content of their
  input, not the order in which is arrives." This transfers to CRDTs: a query over a CRDT
  is coordination-free-consistent iff monotone w.r.t. the join-semilattice order
  ([Keep CALM and CRDT On](https://www.vldb.org/pvldb/vol16/p856-power.pdf), PVLDB 2023 —
  which describes *this architecture's literal shape*: a grow-only set of DAG nodes whose
  state is derived by "playing the log," and endorses defining CRDTs as Datalog queries
  over gossiped operation sets, citing Kleppmann).
- **Monotonicity is syntactically checkable.** Selection, projection, join, union,
  intersection are monotone; of the relational algebra operators only set difference is
  not (BloomL, SoCC 2012). So the rule engine can *classify* rules.
- **Non-monotone rules — retraction, negation, cardinality-one supersession — are exactly
  where free convergence stops.** Four independent results converge on this (PVLDB:
  "observations of CRDT state are unconstrained and unsafe"; BloomL: inconsistency arises
  only at "points of order"; Shapiro §6.3: "Bloom does not support remove without
  synchronisation"; the scope dilemma: per-CRDT correctness ≠ whole-application
  consistency). The derivation *pipeline* must be monotone end-to-end, or another
  mechanism supplied. Confluent stages **compose**, so the proof can be modular per stage.

### 1.4 The escape hatch for non-monotone rules — established and deployed **[verified]**

Impose a **deterministic strict total order on causally concurrent events** and fold in
that order: every replica with the same merged set reaches identical state, including
through supersession and retraction. Merkle-CRDTs §IV-C names the technique;
[go-ds-crdt](https://github.com/ipfs/go-ds-crdt) runs it in production (priority = DAG
node height, byte-compare tiebreak). **The SPEC's total order `≺` (hlc → actorId →
eventId) is precisely this mechanism.** The commutative-supersession fix — choose the
surviving cardinality-one value by `≺`, not arrival order — is therefore not a hopeful
patch; it is the standard, deployed, theory-backed construction.

---

## 2. The refuted claim, and why it matters most

The verification panel killed (0-3) the over-strong reading of CALM — *"non-monotone rules
provably require runtime coordination."* The correct statement:

> A deterministic total-order re-fold over the final merged set converges **at quiescence**
> without any coordination. What non-monotonicity costs is **streaming/online output
> stability**: a late-arriving event with an earlier `≺` position can retroactively
> invalidate conclusions already emitted — and possibly already acted on.

For a compliance product this is *the* design issue, more than the merge math: an
obligation is derived, a human fulfills it, then a late event re-folds it away. Three
honest responses, increasing in strength:

1. **Bitemporal as-of is already the right consumer contract.** "Compliant as of
   (txTime, validTime)" is stable forever, even when "compliant now" changes. Lean on it.
2. **Retroactive invalidation as a first-class derived fact** ("obligation X was satisfied
   under superseded information") — arguably a compliance *feature*, and pure fold.
3. **Watermarks/sealing** ("events with hlc < T are final") for bounded-group deployments —
   note this *does* reintroduce weak coordination; acceptable in a permissioned regime.

Recommended default: (1) + (2) as the spec'd contract; (3) opt-in per deployment. This is
the one genuinely novel protocol-design item the research surfaced (open question, §6).

---

## 3. Is this like Ethereum? **[analysis]**

*(Sources fetched for this angle — Kleppmann's BFT-CRDT papers, Matrix state resolution —
but no claims survived the verification budget; treat as argued analysis.)*

**Similar at one level:** both are deterministic state-transition functions folded over a
hash-linked replicated log. Ethereum's state is a fold; ours is a fold.

**Opposite at the decisive level:** Ethereum's operations don't commute (balances —
double-spend), so it must buy a **global total order via consensus** among **anonymous
adversarial peers**, paying for it with sybil resistance, latency, and throughput.
MetaCRDT avoids the entire consensus apparatus because merge is order-free by construction
and replicas are **authenticated/permissioned** — signatures + provenance replace BFT
agreement.

Where the boundary actually sits:

- **Global uniqueness constraints** ("exactly one active X, enforced at write") are the
  double-spend analogue — provably impossible coordination-free. Detect-and-reconcile, or
  coordinate just that constraint.
- **Equivocation** (a replica showing different logs to different peers): content
  addressing already does most of the work — Kleppmann's
  [BFT-CRDT result](https://martin.kleppmann.com/papers/bft-crdt-papoc22.pdf) shows
  hash-DAG CRDTs tolerate any number of Byzantine nodes for convergence, because forks are
  visible in the DAG. Near-BFT almost free.
- **Hash grinding** **[verified caveat]**: content hashes are attacker-influenceable, so a
  CID-based tiebreak can be biased. `≺` is well-designed here — eventId is the *last*
  tiebreak after hlc and actorId, minimizing grinding leverage. Keep that ordering.
- **Matrix is the cautionary cousin**: signed event DAG + deterministic state resolution —
  this architecture at internet scale — with documented state-resolution failure modes
  ("state resets"). Read the
  [independent analysis](https://matrix.org/blog/2020/06/16/matrix-decomposition-an-independent-academic-analysis-of-matrix-state-resolution/)
  before finalizing supersession semantics.

---

## 4. Prior art to adopt rather than reinvent

| System | What to take | Caveat |
| --- | --- | --- |
| [go-ds-crdt](https://github.com/ipfs/go-ds-crdt) **[verified]** | Production Merkle-CRDT store (IPFS Cluster, ~100M keys self-reported), by the paper's first author; deterministic concurrent-write resolution without consensus — the template for commutative supersession | **Despite the provably sound design, the implementation diverged in production until Nov 2024** (tombstone ordering bug, issue #241). Sound design does not exempt the implementation — the strongest argument for testkit-as-gate |
| [Sedimentree](https://github.com/automerge/beelay/blob/main/docs/sedimentree.md) (Ink & Switch / Automerge) **[verified, medium confidence — single first-party source]** | Deterministic, coordination-free compaction of a grow-only hash-linked log: chunk boundaries from trailing zeros of content hashes, so divergent replicas compute byte-identical strata | Compaction, not erasure — does not solve GDPR; assumes non-adversarial hashes |
| [Hypercore](https://github.com/holepunchto/hypercore) **[verified, medium confidence]** | Signed Merkle logs: per-author integrity, sparse verified replication | Contrast case, not a model: writers can truncate (fork ids) → **not** a G-Set. Reminder that the no-removal invariant is what the whole proof hangs on |
| Keyhive (Ink & Switch) / p2panda access control **[analysis]** | The live research frontier for the hardest open problem: partial replication + access control interacting with convergence | Track, don't build |

---

## 5. Verification ladder — how to actually prove ours **[analysis]**

No claims survived on this angle; recommendation grounded in fetched sources
(Gomes et al., VeriFx, Antithesis) and what production systems do:

1. **Property tests in `@metacrdt/testkit` (do first). ✅ SHIPPED** — implemented as
   `runRuntimeFoldPermutationConformance`: the generator starts every canonical event set
   with deterministic coverage for a cardinality-one race plus retract/tombstone/
   untombstone lifecycles, then adds seeded random asserts/retracts/tombstones/
   untombstones with concurrent HLCs forcing ≺ tiebreaks and overlapping valid-time
   intervals; the set is delivered to N replica sessions in shuffled partial orders,
   gossiped + ring-flooded via version-vector delta exchange, and every replica's
   bitemporal fold snapshot must be byte-identical to the pure `@metacrdt/core` fold
   oracle. Wired into `runRuntimeConformance`, so it runs against the memory, local,
   node (memory/sqlite/postgres), and Cloudflare DO (+ DO-SQLite) targets in CI. This
   single property would have caught the go-ds-crdt divergence bug.
2. **Deterministic simulation (Antithesis-style). ✅ SHIPPED** — implemented as
   `runRuntimeDeterministicSimulationConformance`: a seeded fault script partitions one
   replica, delivers shuffled/chunked/duplicated event subsets to the others, gossips
   inside the partition, heals via version-vector delta exchange, and requires quiescence
   plus core-fold oracle agreement on every replica. Wired into the aggregate
   `runRuntimeConformance` suite.
3. **TLA+ for the anti-entropy protocol only** — version vectors + delta sync are scoped in
   [`../plans/anti-entropy-tla.md`](../plans/anti-entropy-tla.md), with a starter
   executable module at [`../plans/AntiEntropy.tla`](../plans/AntiEntropy.tla).
4. **Mechanized proof, optional/later.** [Gomes et al.](https://arxiv.org/abs/1707.01747)
   already mechanize SEC for op-based CRDTs in Isabelle/HOL (framework reusable);
   [VeriFx](https://arxiv.org/abs/2207.02502) automates CRDT proofs from
   implementation-like code. A solo project ships (1)+(2) and cites (4)'s existence.

---

## 6. Open questions (carried forward from the research)

1. **Output stability under late arrivals** — which sealing/epoch/watermark mechanism (or
   pure bitemporal as-of contract, §2) do we spec, and does it reintroduce coordination?
2. **Threat-model boundary** — exact point where signed events from authenticated replicas
   stop sufficing (equivocation, sybil, global uniqueness); Kleppmann BFT-CRDT + Matrix
   failure modes need a dedicated verified pass.
3. **Erasure vs. immutability** — GDPR deletion on a content-addressed grow-only log whose
   proof assumes no removal (crypto-shredding / payload-detached hashes / redactable
   strata); see [`privacy.md`](./privacy.md).
4. **Partial replication + access control under convergence** — Keyhive/p2panda frontier.

---

## 7. Implications for the SPEC and plans

- **Commutative supersession is theory-validated and deployed prior art** — promote from
  "frontier nice-to-have" to a near-term slice (brand-gating if the MetaCRDT-umbrella
  branding is chosen; see the unification plan).
- **Add fold-permutation invariance to `@metacrdt/testkit`** as a conformance property
  every target must pass (§5.1). ✅ Done — `runRuntimeFoldPermutationConformance`, part
  of the aggregate `runRuntimeConformance` suite.
- **Spec the obligation-stability contract** (§2) — bitemporal as-of + invalidation-as-fact
  default, watermark opt-in. ✅ The invalidation-as-fact path now records
  `obligation.invalidated.<form>` when a fulfilled requirement disappears under recompute.
- **Classify rules by monotonicity** in the Datalog engine (§1.3) — monotone rules get the
  free-convergence label honestly; non-monotone rules are flagged as `≺`-order-dependent.
  Spec: [`../plans/datalog-monotonicity-classification.md`](../plans/datalog-monotonicity-classification.md).
- **Keep `≺` = hlc → actorId → eventId** (hash-grinding resistance, §3).
- Positioning language upgrade available: the convergence claim can cite Shapiro Prop 2.1,
  Merkle-CRDTs §IV-B, and CALM rather than self-assertion.

## Sources (primary, verified-against)

- Shapiro, Preguiça, Baquero, Zawirski — *A comprehensive study of Convergent and
  Commutative Replicated Data Types* (INRIA RR-7506, 2011)
- Sanjuán, Pöyhtäri, Teixeira, Psaras — [*Merkle-CRDTs*](https://arxiv.org/abs/2004.00107) (2020)
- Hellerstein & Alvaro — [*Keeping CALM*](https://arxiv.org/abs/1901.01930) (CACM 2020)
- Laddad, Power, Milano, Cheung, Crooks, Hellerstein —
  [*Keep CALM and CRDT On*](https://www.vldb.org/pvldb/vol16/p856-power.pdf) (PVLDB 2023)
- Conway, Marczak, Alvaro, Hellerstein, Maier — *Logic and Lattices for Distributed
  Programming* (BloomL, SoCC 2012)
- [go-ds-crdt](https://github.com/ipfs/go-ds-crdt) (production Merkle-CRDT; divergence bug
  issue #241 / PR #238)
- [Sedimentree design doc](https://github.com/automerge/beelay/blob/main/docs/sedimentree.md)
  (Automerge/Beelay)
- [Hypercore](https://github.com/holepunchto/hypercore)
- Kleppmann — [*Making CRDTs Byzantine Fault Tolerant*](https://martin.kleppmann.com/papers/bft-crdt-papoc22.pdf)
  (PaPoC 2022); Kleppmann & Howard — *Byzantine Eventual Consistency* (2020) *(fetched;
  not independently verified)*
- Gomes, Kleppmann, Mulligan, Beresford —
  [*Verifying Strong Eventual Consistency in Distributed Systems*](https://arxiv.org/abs/1707.01747)
  (OOPSLA 2017); [VeriFx](https://arxiv.org/abs/2207.02502) *(fetched; not independently verified)*
- Matrix state resolution v2 +
  [independent academic analysis](https://matrix.org/blog/2020/06/16/matrix-decomposition-an-independent-academic-analysis-of-matrix-state-resolution/)
  *(fetched; not independently verified)*
- Ink & Switch [Keyhive notebook](https://www.inkandswitch.com/keyhive/notebook/);
  [p2panda access control](https://p2panda.org/2025/07/28/access-control.html) *(fetched;
  not independently verified)*
