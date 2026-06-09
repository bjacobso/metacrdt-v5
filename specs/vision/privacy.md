# Vision — Privacy: Retention, Erasure & Residency under Bitemporality

> **MetaCRDT primitive →** _bitemporal fold + provenance_ — erasure destroys the per-subject key and keeps the fact-shape; retention/DSR are Flows. See [`metacrdt-alignment.md`](./metacrdt-alignment.md).

> Part of the `vision/` set — see [`README.md`](./README.md). The hardest doc: it's where the
> substrate's core invariant _fights_ a hard legal requirement. Builds on [`triples.md`](./triples.md)
> (bitemporal "never destroy"), [`authorization.md`](./authorization.md) (PII tagging + access),
> [`documents.md`](./documents.md) (byte erasure), [`workflows.md`](./workflows.md) (retention as
> Flows), and [`compliance.md`](./compliance.md) (statutory retention). Grounded in `../../PLAN.md`.

> **Convex update (decided — simpler):** Convex supports **hard delete**, so right-to-erasure does not
> require crypto-shredding as the primary mechanism. Use **tombstone** for normal lifecycle and
> **hard-delete + event-log scrub** for legal erasure (the append-only log is our invariant, not a
> platform constraint we can't break). Reserve **crypto-shredding for file-storage blobs**. **Residency**
> is **deferred** — a Convex project is a single deployment, so residency means separate **per-region
> deployments**, not a predicate over one store. See [`convex.md`](./convex.md) §"Cuts".

Onboarding is PII-dense — SSNs, dates of birth, addresses, identity documents — under GDPR, CCPA, and
sector rules. The substrate's defining choice is **bitemporal: nothing is destroyed; retraction closes
an interval.** Right-to-erasure says the opposite: **actually delete.** This doc resolves that conflict
head-on, because if it's hand-waved the whole substrate is a compliance liability.

> Status: **design depth.** This is the doc most worth getting right before real PII enters the store.

---

## 0. The central conflict

> **Bitemporality says "retract, never delete."** `validTo` closes an interval; `asOf` can still read
> the old value. **Right-to-erasure says "the value must become unrecoverable."** Retraction is _not_
> erasure — a retracted fact's value is still in the row, still in `asOf`, still in backups.

Resolving this is non-negotiable. The wrong move is to weaken bitemporality globally (you'd lose the
audit/time-travel that makes the substrate worth building). The right move is to make **erasure a
first-class, surgical operation on values** that preserves the _shape_ of history while destroying the
_content_ — and to recognize that **erasure is bounded by statutory retention** (you are often _legally
required_ to keep an I-9 for years), so the engine must reconcile competing legal duties, not just honor
deletion.

---

## 1. PII is tagged at the attribute level

The lever is already in `authorization.md`: attributes carry `pii: true` (e.g. `employee/ssn`,
`employee/dob`, `employee/address`). That tag does triple duty:

- **Access** — gated, deny-by-default (`authorization.md`).
- **Erasure scope** — defines _what_ an erasure operation targets (the PII facts of a subject).
- **Storage** — drives encryption/vaulting (§2).

Non-PII facts (an obligation was created, a form was completed, a tax form was filed) are _not_ erased —
keeping them is exactly what lets you prove compliance _after_ the PII content is gone (§4).

---

## 2. The mechanism: crypto-shredding (preferred), with two alternatives

Three ways to make a value unrecoverable; the recommendation is **crypto-shredding** because it
preserves the bitemporal invariant best and reaches backups.

1. **Crypto-shredding (recommended).** Encrypt PII fact values with a **per-subject key** (a per-principal
   data-encryption key, wrapped by an account/region key). The triple store keeps ciphertext; `asOf` and
   the tx log keep their full structure. **Erasure = destroy the subject's key.** The ciphertext —
   everywhere, including replicas and backups — becomes permanently unreadable, while the _existence,
   timing, and provenance_ of the facts remain. This is the event-sourcing answer to GDPR, and it fits
   bitemporality precisely: history's _shape_ is intact; its _content_ is gone.
2. **Value hard-delete (tombstone-with-scrub).** A special erasure transaction nulls the value columns of
   a subject's PII facts in place, keeping the fact rows (entity/attribute/time) for referential and
   audit integrity. Simpler, but must physically reach replicas/backups, and `asOf` over erased data
   returns "erased."
3. **PII vault / tokenization.** Keep PII out of the triple store entirely, in a separate vault; facts
   hold tokens; erasure = delete from the vault. Strong separation and residency control, but adds a
   join on every PII read and a second consistency boundary.

These compose: crypto-shredding for facts, with documents handled as bytes (§3), and a vault where
residency demands physical separation (§5).

---

## 3. Erasure must reach the bytes, too

Facts are only half the PII. A generated/uploaded I-9 PDF _contains_ the SSN (`documents.md`). Erasure
must destroy the document bytes as well:

- **Crypto-shred document blobs** with the same per-subject key — destroying the key renders the stored
  bytes unreadable, consistent with the fact erasure.
- Signed legal documents that statute requires you to retain are the conflict case (§4): you may have to
  keep the signed artifact even when erasing other PII — the retention rule wins, narrowly and
  auditably.

This is the tight coupling `documents.md` §5 flagged: privacy erasure spans facts _and_ blobs, with one
key per subject so a single "shred" covers both.

---

## 4. Retention vs. erasure: competing legal duties

The subtlety that trips naive "delete everything" implementations: **you are frequently _required_ to
retain.** An I-9 must be kept 3 years after hire / 1 year after termination; tax forms have their own
minimums. So erasure is not "delete on request" — it's **"delete what you're not required to keep, as
soon as you're allowed."**

The engine reconciles this with two ideas:

- **Retention policies are Flows** (`workflows.md`). A retention policy is a timing Flow: _on_ the
  retention clock elapsing (e.g. termination + statutory window) _and when_ no legal hold applies →
  erase the subject's eligible PII (crypto-shred). Retention is a workflow over the tx feed, not a cron
  hack.
- **A Data Subject Request (DSR) is a Flow.** "Erase me" gathers the subject's PII facts + documents (a
  query), erases everything **not under a retention obligation or legal hold**, and records the erasure
  as a transaction (an auditable "we honored the request on date X, retaining only Y for statutory
  reason Z").
- **Keep the _fact of_ compliance after erasing its _content_.** "An I-9 was collected and verified on
  2026-03-01" is a non-PII fact that survives; the SSN inside it is shredded. You can still prove you
  were compliant without holding the PII — the audit story (`compliance.md`) degrades gracefully to
  "content erased, event retained."
- **Legal hold suspends retention/erasure.** A hold is a fact on the subject; erasure Flows check for it
  (the same guard pattern as everything else).

---

## 5. Residency

Data-residency ("EU workers' data stays in the EU") maps onto the tenant boundary:

- **`accountId` already partitions every fact** (`triples.md`); residency extends that to _physical_
  placement — an account (or a region attribute on the subject) determines which regional store/vault/
  blob bucket holds its facts and bytes.
- **Keys are regional.** The per-subject crypto-shred keys are wrapped by a **region key**, so both the
  data and the means to read it stay in-region.
- Cross-region reads/reporting must respect this — a global "all accounts" query can't pull EU values
  into a US process. This intersects the `authorization.md` compiler chokepoint (residency is another
  predicate the rewriter must honor) and `performance.md` (regional projections).

---

## 6. Honest trade-offs & sharp edges

- **Crypto-shredding's bet is key management.** Erasure-correctness becomes key-destruction-correctness:
  per-subject keys, wrapping hierarchy, rotation, and _provable_ destruction (including in HSM/KMS and
  backups). If a key survives in a backup, the data isn't erased. This is the crux risk — design the key
  lifecycle as carefully as the fact lifecycle.
- **Backups & replicas.** Hard-delete struggles to reach point-in-time backups; crypto-shred wins
  because the backup holds only ciphertext. But backup _keys_ must be shredded too.
- **Bitemporality is preserved in shape, not content.** After erasure, `asOf` over erased PII returns
  "erased," not the old value. That's correct and intended, but every consumer of `asOf` must handle
  "erased" as a first-class state.
- **Aggregates & projections may leak.** A count or a derived projection computed _before_ erasure can
  retain PII-derived signal; projections over PII must be rebuildable/erasable too (`performance.md`).
- **The retention/erasure reconciliation is legally load-bearing.** Getting "delete what you can, keep
  what you must, prove both" right is the hard part — it should be modeled explicitly as Flows + facts,
  reviewable and auditable, not buried in code.
- **Erasure is itself a sensitive action** — who can trigger it, and the record that it happened, are
  governed by `authorization.md`; the erasure transaction is permanent provenance.

---

## 7. Tactical path (conservative)

- **Stage V0 — PII tagging end-to-end.** Ensure every PII attribute is `pii: true` (it's also the
  `authorization.md` lever). Cheap, foundational, and the input to everything below.
- **Stage V1 — Per-subject encryption of PII facts** (crypto-shred substrate), region-wrapped keys; reads
  decrypt transparently for authorized viewers. No erasure yet — just the capability.
- **Stage V2 — Erasure as a transaction** (destroy the key) for one PII attribute set; verify `asOf`
  returns "erased" and the non-PII facts survive.
- **Stage V3 — Retention + DSR Flows** with legal-hold guards and the "retain what's required" carve-out;
  document-byte erasure wired in (`documents.md`).
- **Stage V4 — Residency** for one region: regional store/vault/keys + the compiler residency predicate.

PII must not enter the real triple store ahead of at least V1 — modeling this _before_ real data is the
forward-compatibility gate for the whole substrate.

---

## Decisions (resolved)

- ✅ **Retraction ≠ erasure.** Bitemporality is preserved; erasure is a separate, surgical operation on
  _values_. (§0)
- ✅ **Crypto-shredding is the primary mechanism** — per-subject keys; erasure = destroy the key;
  reaches replicas/backups; keeps history's shape. (§2)
- ✅ **PII is attribute-tagged** (`pii: true`), driving access, erasure scope, and storage. (§1)
- ✅ **Erasure spans facts and document bytes** under one per-subject key. (§3)
- ✅ **Retention & DSR are Flows** with legal-hold guards; keep the _fact of_ compliance after erasing its
  _content_; statutory retention bounds erasure. (§4)
- ✅ **Residency rides the tenant boundary** — regional stores/vaults/keys + a compiler residency
  predicate. (§5)

## Open (non-blocking)

- ❓ Key hierarchy & destruction proof — per-subject vs. per-(subject,purpose) keys; KMS/HSM; backup key
  lifecycle.
- ❓ Granularity of "erased" in `asOf` — per-fact vs. per-attribute-set; how consumers render it.
- ❓ Projection/aggregate erasure — how derived data inherits erasure obligations.
- ❓ The exact statutory retention matrix (I-9, tax, sector) and how it's encoded as retention policies.
- ❓ Residency for platform-level cross-account reporting — what's allowed to leave a region, ever.
