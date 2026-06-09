# Vision — Documents, Generated PDFs & E-Signature

> **MetaCRDT primitive →** _fact-carrier + fold_ — metadata/provenance are facts; generated docs are folds; bytes stay content-addressed. See [`metacrdt-alignment.md`](./metacrdt-alignment.md).

> Part of the `vision/` set — see [`README.md`](./README.md). Builds on [`triples.md`](./triples.md)
> (facts + provenance), [`workflows.md`](./workflows.md) (forms/Flows), [`library.md`](./library.md)
> (templates as versioned definitions), [`authorization.md`](./authorization.md) (who may read a
> document), and [`privacy.md`](./privacy.md) (erasing document bytes). Grounded in `../PLAN.md`.

The fact store models _structured_ data beautifully. But onboarding produces **binary artifacts** —
uploaded documents, generated PDFs (I-9s, offer letters, tax forms), and **e-signatures/attestations** —
which are a different kind of thing. This doc covers how documents live alongside facts without
pretending bytes are triples.

> Status: **design depth.** End-state and migration path kept separate, per the set's convention.

---

## 0. The central realization

Today a `Task` attaches `files`, regenerates PDFs (`createTaskPdfRegeneration`), and captures signatures
and attestations. Three things are tangled together that the substrate should separate cleanly:

> **A document = (1) bytes in blob storage, (2) an entity-of-facts describing it, and (3) — when
> generated — a projection of other facts through a template.** Signatures and attestations are facts
> with provenance.

The rule: **bytes never go in triples.** The fact store holds the document's _metadata, provenance,
hash, and references_; the bytes live in content-addressed blob storage. This keeps the triple store
fast and the bitemporal log clean while making documents first-class queryable entities.

---

## 1. A document is a blob-referenced entity

A document is an entity of a `document` type whose facts describe it:

- `document/kind` (i9, w4, offer-letter, upload…), `document/contentType`, `document/byteSize`,
- `document/blobRef` (a pointer into blob storage), `document/sha256` (content hash — binds the facts to
  the exact bytes),
- `document/source` (uploaded | generated | signed), `document/of` (REF → the `compliance/principal` or
  subject it concerns),
- standard provenance from the transaction (who/when).

The bytes sit in blob storage (S3-like), ideally **content-addressed** (keyed by hash) so identical
content dedups and the `sha256` fact is the integrity anchor. Reads go through the contract; access is
governed by attribute-level grants on the document's facts (`authorization.md`) and by the subject it's
`of` (a recruiter who can't see `employee/ssn` also can't pull the I-9 PDF that contains it).

---

## 2. Generated documents are projections of facts

An I-9 PDF is not source data — it's **a rendering of facts through a template**, exactly the projection
pattern from `performance.md`/`api.md`:

```
template (a versioned library item) + the subject's facts (asOf a tx) ──render──▶ PDF bytes + sha256
```

- **The template is a library item** (`library.md`): versioned, distributable, localizable
  (`FormLanguage` → facts), upgraded via the same 3-way merge. "Which version of the I-9 form" is a tag.
- **Regeneration is deterministic** from `(template version, facts asOf the tx)`. So "regenerate this
  document as it was at signing" is an `asOf` query + a render — auditable and reproducible.
- **The generation event is a transaction**: it asserts `document/sha256`, `document/blobRef`,
  `document/generatedFrom` (the tx of the facts rendered), and `document/templateVersion`. The document
  is causally tied to the exact facts and template that produced it.

> **Sharp edge — signed documents must be frozen, not just regenerable.** For legal defensibility you
> cannot rely on "regenerate from facts later"; the _exact bytes the person signed_ must be stored
> immutably. So: generated-and-unsigned → may be a pure projection (regenerable); **generated-and-signed
> → the rendered bytes are persisted and content-addressed, and never regenerated.** The signature binds
> to that `sha256`.

---

## 3. Signatures & attestations are facts with provenance

An e-signature is the substrate's strongest fit: it is **a fact asserting a signing event**, and
bitemporality + provenance give a legally-defensible trail for free.

- A signature fact carries: `signature/document` (REF, by `sha256`), `signature/signer` (the principal),
  `signature/at`, `signature/ip`, `signature/method` (click-wrap, drawn, typed, third-party e-sign
  provider), and the consent text shown.
- **The hash binds intent to artifact.** Because the signature references the document's `sha256`, "what
  exactly did they sign" is unambiguous and tamper-evident — change a byte and the hash no longer
  matches the signed fact.
- **Attestations** ("I attest this is true") are the same shape: a fact with the statement, the
  attester, and provenance.
- **Audit is an `asOf` query.** "Show the I-9 this employee signed, the version, the timestamp, and the
  facts it was rendered from" is one traversal of the transaction log (`compliance.md` audit story).

Third-party e-sign providers (DocuSign-style) are **inline integrations** (`integrations.md`): the Flow
sends the document out, the provider webhook returns the executed envelope, and the inbound Flow asserts
the signature facts + stores the signed bytes.

---

## 4. The document lifecycle as Flows

Documents move through states driven by Flows over the tx feed (`workflows.md`), not bespoke code:

- **Generate** — a Flow step renders a template + facts → bytes + `document/*` facts (on obligation
  creation, or on form completion).
- **Collect/upload** — a worker upload asserts a `document` entity with `source: uploaded`
  (`experience.md`).
- **Sign** — a Flow routes to e-sign (inline integration) → signature facts + frozen bytes.
- **Verify/extract** — OCR/IDV integrations may read an uploaded document and assert extracted facts
  (e.g. an uploaded license → `employee/licenseNumber`), with the document as provenance.
- **Expire / retain / erase** — retention and erasure are Flows too (`privacy.md`): the _bytes_ must be
  deletable independently of the facts.

---

## 5. Honest trade-offs & sharp edges

- **Bytes are not facts — keep them out of the store.** The triple store holds references + hashes;
  blobs live in object storage. Putting bytes in triples would wreck performance and bloat the log.
- **Signed artifacts must be immutable and persisted** (§2) — the one place "regenerate from facts" is
  _not_ acceptable. Store and content-address the signed bytes.
- **Erasure reaches two places.** Deleting a person's PII must delete both their PII _facts_ and any
  _document bytes_ containing that PII (the I-9 PDF) — and document bytes can't be crypto-shredded as
  granularly as facts. `privacy.md` must treat documents explicitly; this is a real coupling.
- **Large files, scanning, malware.** Uploads need size limits, virus scanning, and content-type
  validation before they become trusted facts — an ingest pipeline, not a raw assert.
- **Access must compose.** A document's readability derives from the attributes it contains and the
  subject it's `of`; getting "can see the I-9 ⇔ can see its fields" consistent with `authorization.md`
  is a real design point (don't let a PDF leak what the field-level grants forbid).
- **Provider lock-in / portability.** Third-party e-sign envelopes have their own formats; store enough
  (signed bytes + signature facts + provider envelope id) to remain defensible if you change providers.

---

## 6. Tactical path (conservative)

- **Stage D0 — Documents as entities, bytes where they are.** Model existing files/PDFs as `document`
  entities (facts: kind, hash, blobRef, of, provenance) alongside today's storage; backfill hashes. No
  behavior change.
- **Stage D1 — Generation as a projection** for one document (I-9): render from template version + facts;
  assert `document/*` + `generatedFrom`; diff bytes against today's `createTaskPdfRegeneration`.
- **Stage D2 — Signatures as facts.** Capture one signing flow as signature facts bound to `sha256` +
  frozen bytes; verify the audit query reproduces the legal trail.
- **Stage D3 — Lifecycle as Flows** (generate/sign/verify) and wire e-sign as an inline integration.
- **Stage D4 — Erasure of bytes** wired into `privacy.md`'s retention/erasure Flows.

---

## Decisions (resolved)

- ✅ **A document = blob bytes + an entity-of-facts + (if generated) a projection through a template.**
  Bytes never live in triples. (§0, §1)
- ✅ **Generated docs are deterministic projections of `(template version, facts asOf)`** — regenerable
  and auditable. (§2)
- ✅ **Signed documents are frozen** — the exact signed bytes are persisted and content-addressed, not
  regenerated. (§2)
- ✅ **Signatures/attestations are facts** bound to the document `sha256`, with full provenance — the
  legal trail is an `asOf` query. (§3)
- ✅ **The lifecycle is Flows** (generate/collect/sign/verify/erase); e-sign providers are inline
  integrations. (§4)

## Open (non-blocking)

- ❓ Content-addressed storage scheme and dedup boundaries (per-account vs. global).
- ❓ How document-level access is _derived_ from the field-level grants of its contents
  (`authorization.md`).
- ❓ Extraction (OCR/IDV) provenance — how strongly do extracted facts cite the source document?
- ❓ Retention/erasure of signed legal documents vs. statutory retention minimums (`privacy.md` overlap).
