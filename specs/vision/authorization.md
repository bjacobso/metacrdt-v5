# Vision — Authorization over a Fact Store

> **MetaCRDT primitive →** _provenance + coordination profiles (SPEC §9)_ — grants are facts; the projection filters by them. See [`metacrdt-alignment.md`](./metacrdt-alignment.md).

> Part of the `vision/` set — see [`README.md`](./README.md). Builds on [`triples.md`](./triples.md)
> (the query compiler is the enforcement chokepoint), [`workflows.md`](./workflows.md) (the shared
> `Rule` AST, ownership tiers & role-binding), and [`integrations.md`](./integrations.md) (the
> namespace boundary). Grounded in `../../PLAN.md`.

> **Convex update (decided — reframe):** Convex has **no row-level security** and no SQL query rewriter, so
> authorization is **enforced in function code** (queries/mutations) via `ctx.auth.getUserIdentity()`, not
> as a `where`-predicate injected by a compiler chokepoint. Attribute-level access still works, but the
> chokepoint is a **shared TS read/write wrapper** reading from **per-principal filtered projections**.
> **Multi-hop graph-reachability grants are cut for v1** — each hop needs a declared index, so precompute
> per-principal visible-subject projections instead of evaluating rules-over-the-graph per request. See
> [`convex.md`](./convex.md) §"Cuts".

If everything is a queryable fact, **who can read or write which facts?** Get this wrong and "everything
is queryable" becomes "everything is leakable." This doc argues that a fact store doesn't weaken access
control — it lets us express it at a granularity we can't reach today (the attribute), with the same
rule language and a single, unavoidable enforcement point.

> Status: **design depth.** End-state and migration path kept separate, per the set's convention.

---

## 0. The central realization

Today authorization is **CASL abilities compiled in-memory per request** (`abilities.server.ts`:
`can(action, subject, whereClause)`), turned into Prisma `where` predicates via `accessibleBy`. It is
**row-level only** — once you can see an `Employee` row, you see _every_ field; there is **no
attribute/field-level access, no PII gating, and no API scopes**. Rules are largely hard-coded in
handlers, scoped by `accountId` from `CurrentAuth`.

But two things already lean toward the fact model:

- **`AuthzInferenceRule`** (`inferredFromEntity` → `appliedToEntity`, account-scoped) — "if you can
  access an employee, you can access their tasks." That is **access propagating along the entity
  graph**, stored as data.
- **`UserGroup.accessRules`** (JSON, ABAC-shaped) — stored, but not yet enforced.

A fact store completes both: access becomes **attribute-grained**, **expressed in the shared `Rule`
AST**, and **enforced at the query compiler** — the one place every read already passes through.

---

## 1. Four axes of access

A fact is `(tenant, owner, subject, attribute, value, time)`. Access control is a predicate on each:

1. **Tenant** — `accountId` on every triple. The hard, non-negotiable boundary; already pervasive.
   Nothing below may ever cross it.
2. **Owner / namespace** — the ownership tiers (`workflows.md` §2.5, `integrations.md` §2). An
   `integration:everify` namespace is an access boundary; system-reserved attributes are read-mostly.
3. **Entity / row** — _which subjects_ a principal may see. A `Rule` over facts (the CASL `where`
   predicate, generalized).
4. **Attribute** — _which attributes_ of those subjects. **This is the new axis** and the headline of
   the doc.

(Plus a temporal facet — may a principal read _history_ via `asOf`, or only current facts? — §6.)

---

## 2. The unlock: attribute-level access is natural here

Because the unit of storage is `(subject, attribute, value)`, the natural **unit of access is the
attribute**. Things that are impossible row-level today become first-class:

- **PII gating.** `employee/ssn`, `employee/dob` readable only by principals with an explicit grant;
  invisible to everyone else — not "row hidden," but _that attribute filtered from results_.
- **Role-based field visibility.** A recruiter sees `employee/name`, `employee/email`; a payroll
  integration sees `employee/ssn` but not `employee/notes`.
- **Redaction = projection.** "Redacted" isn't a special mode; the attribute is simply not in the set
  the compiler is allowed to select for this principal.

This is the single biggest authorization gain of moving to facts, and it falls out of the model rather
than being bolted on.

---

## 3. Grants are rules over facts (reuse the `Rule` AST)

A grant is "principal P may `read|write` attribute(s) A on subjects matching rule R." R is the **same
`all`/`any`/`condition` AST** policies and Flows use (`workflows.md`) — so authorization reuses the
workflow engine's condition language and evaluator, not a parallel one.

```jsonc
{
  "grant": "read",
  "to": { "role": "recruiter" },
  "attrs": ["employee/name", "employee/email", "placement/*"],
  "where": {
    "all": [
      { "subject": "?e", "type": "employee" },
      // employees on placements this recruiter owns — a graph constraint:
      { "subject": "?p", "attr": "placement/employee", "value": "?e" },
      { "subject": "?p", "attr": "placement/owner", "value": "?me" }
    ]
  }
}
```

**`AuthzInferenceRule` generalizes** into this: "access propagates along a REF edge per a rule" — _see a
placement → see its `compliance/principal`'s facts_. Graph-reachability authorization, expressed as
data, evaluated by the existing compiler.

---

## 4. Enforcement = query rewriting at the one chokepoint

Every read in the substrate compiles AST→SQL through one compiler (`triples.md` §5). That makes the
compiler the **single, unavoidable enforcement point** — a security improvement over scattered handler
`where` clauses where a forgotten predicate leaks data. The authz layer rewrites every query to inject:

1. the **tenant predicate** (`account_id = :acct`) — always;
2. a **visible-subjects predicate** — a sub-join derived from the grant rules (§3), restricting which
   `subject_id`s the query may bind;
3. a **visible-attributes filter** — restricting which `attribute_id`s may be selected/returned;
   non-granted attributes are dropped from projection, never post-filtered in app code.

Writes are the mirror: `assertFact`/`retractFact` are gated by **attribute-level write grants** — you
may write `employee/notes` but not `employee/ssn`. Because writes are transactions, every authorization
decision is also auditable (who wrote what, under which grant).

---

## 5. Authorization as data (homoiconic, tier-aware)

Grants and roles are themselves facts (`meta/grant`, `meta/role`) — customer-definable for
customer-defined types, queryable ("who can read `ssn`?"), versioned and auditable like any data
(`library.md`). The in-memory CASL ability becomes a **compiled projection** of these grant-facts
(read-hot / write-rare → the Phase 3 per-account cache, `PLAN.md` §23), so runtime cost stays ~0.

Tier interactions are part of the contract: customers grant within their own + shared namespaces;
`integration:<name>` namespaces are sealed except through the integration's contract
(`integrations.md` §2); system-reserved attributes are not customer-writable.

---

## 6. Honest trade-offs & sharp edges

- **Attribute filtering must be compiled in, never post-filtered.** Returning rows then stripping
  fields in app code is both slow and a leak waiting to happen. The visible-attributes set must be part
  of the SQL the compiler emits.
- **Deny-by-default for sensitive attributes.** Authz-as-data is powerful and therefore mis-configurable;
  PII attributes should require an explicit grant and default to invisible. Safe defaults over flexible
  defaults.
- **Bitemporal authorization is subtle.** "May I read a fact that was valid _before_ I was granted
  access?" Point-in-time data + point-in-time grants can interact surprisingly. Recommended default:
  **evaluate current authorization over historical data** (your grants now decide what history you see),
  and treat grant-time-travel as an advanced, separate feature.
- **The compiler must be airtight.** A fact store makes broad queries easy to write; one missing
  predicate is a cross-tenant leak. This concentrates risk at the compiler — which is good (one place to
  get right and test exhaustively) but unforgiving.
- **Migrating off in-memory CASL is delicate** — it's load-bearing and subtle; shadow + diff (§7), don't
  flip.

---

## 7. Tactical path (conservative)

- **Stage A0 — Attribute-level PII gating (additive, new capability).** Introduce attribute grants for a
  handful of sensitive attributes on the _existing_ paths; deny-by-default; no change to row-level
  behavior. Pure gain, low risk — and impossible to retrofit later if not modeled now.
- **Stage A1 — Authz rules as facts, shadow.** Express today's CASL abilities as grant-facts; for each
  request, evaluate both and diff the resolved `where`/visible-attrs against CASL's. Ships nothing.
- **Stage A2 — Compiler enforcement.** Route reads through the query rewriter (tenant + subjects +
  attrs) behind a flag; diff results against the CASL-filtered path.
- **Stage A3 — Fold in `AuthzInferenceRule` + graph grants**; deprecate the bespoke inference path once
  the rule-over-facts model reproduces it.

Throughout, CASL stays system-of-record until the compiler path provably matches it.

---

## Decisions (resolved)

- ✅ **Four axes** — tenant, owner/namespace, entity, attribute (+ temporal facet). Attribute-level is
  the new unlock. (§1, §2)
- ✅ **Grants are rules over facts** in the shared `Rule` AST; `AuthzInferenceRule` generalizes to
  graph-reachability grants. (§3)
- ✅ **Enforcement is query rewriting at the compiler** — the single chokepoint; attributes filtered in
  SQL, never post-hoc. (§4)
- ✅ **Authorization is data** — grants/roles are versioned, auditable facts, compiled to a cached
  ability. (§5)
- ✅ **Deny-by-default for sensitive attributes; current-authz-over-historical-data** as the bitemporal
  default. (§6)

## Open (non-blocking)

- ❓ Grant granularity: attribute-glob (`employee/*`) vs. per-attribute; per-value gating (row+attr+value)?
- ❓ Grant-time-travel: is point-in-time _authorization_ ever in scope, or always current-authz?
- ❓ Where do `UserGroup.accessRules` and the public-API token model fold in — are scoped tokens just
  grants bound to a token principal?
- ❓ Performance of the visible-subjects sub-join on hot list paths (overlaps `performance.md`).
