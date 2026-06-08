# Vision — Demo Domain & E2E Test: A Staffing Company on the New Vision

> **MetaCRDT primitive →** _facts (authoring)_ — the Effect-`Schema` DSLs are front-ends that elaborate to one shared ontology IR that lowers to facts. **Reversed cut:** the DSLs were marked "ergonomics, not substrate" for Convex; the Effect-native turn revives them as IR emitters ([`forma.md`](./forma.md)). See [`metacrdt-alignment.md`](./metacrdt-alignment.md) §3.

> Part of the `vision/` set — see [`README.md`](./README.md). This is the **worked example** that
> grounds the whole set in the real Onboarded domain and doubles as the spec for an **end-to-end test**.
> It is authored entirely through the Effect-`Schema` DSLs (entity / form / flow / module / grant /
> scenario), so it also showcases the authoring layer. Builds on [`triples.md`](./triples.md),
> [`workflows.md`](./workflows.md) (the Flow IR §8), [`compliance.md`](./compliance.md),
> [`library.md`](./library.md), [`integrations.md`](./integrations.md),
> [`authorization.md`](./authorization.md), and [`config.md`](./config.md).

> **Convex update (decided):** the **compliance/reuse heart** of this scenario — schema-as-facts entities,
> the four requirement guards as rules, reconciler reuse keyed on scope dimensions, bitemporal `asOf`,
> provenance, attribute-level denial — is **expressible on what's built today** (store + Datalog + rule
> materialization + projections). The **six Effect-`Schema` DSLs and the Effect test harness are authoring
> ergonomics, not the substrate**: replace with plain TS builder functions over schema-as-facts and Convex
> test functions / a disposable test deployment. E-Verify `wait{onFacts}`, `notify`, and timers map to
> Convex **actions + scheduler**, not Datalog. So the e2e is achievable now minus the DSL sugar and the
> async Flow runtime (defer the latter; build the reconciler as a scheduler state machine). See
> [`convex.md`](./convex.md) §6.

A single staffing scenario, defined once with nice Effect DSLs, that exercises the **full breadth** of
the vision — configurable entities (including a customer-defined `venue`), four kinds of form, per-form
reuse scoping, the reconciler, an inline integration Flow, attribute-level authorization, and bitemporal
audit — and is precise enough to **implement as an actual e2e test** (§8). Everything is grounded in
today's domain: `employer`, `client`, `job` are current Onboarded entities; `venue` is the one new,
customer-defined type, included to exercise "configurable objects, no migration."

> Status: **spec for implementation.** The DSL surfaces are proposed; the scenario and its expected
> outcomes (§6–§7) are the test contract.

---

## 0. The scenario in one breath

Maria is placed by staffing agency **Acme** at several **clients**, doing different **jobs** at different
**venues**. Each placement accrues compliance obligations, but the right things are **reused**:

- an **I-9** is reusable across placements with the same **employer** (Acme),
- an **employee handbook** acknowledgment is per **client**,
- a **forklift-operator quiz** is per **job** (only forklift work),
- a **stadium safety disclosure** is per **venue**.

That single matrix exercises obligations, the reconciler's reuse-or-collect, four form kinds, an
integration (E-Verify on the I-9), authorization (the SSN stays private), and time-travel (the I-9
expires and re-fires). §6 is the transaction sequence; §7 is the expected-outcome table.

---

## 1. The domain (`entity-dsl`)

```typescript
import { Attribute, Entity } from "@repo/domain/entity-dsl";
import { Schema } from "effect";

const Email = Schema.String.pipe(Schema.pattern(/^[^@]+@[^@]+$/));
const Ssn = Schema.String.pipe(Schema.pattern(/^\d{3}-?\d{2}-?\d{4}$/));

// — current Onboarded entities —
export const Employer = Entity.make("employer", { label: "Employer" })
  .attribute(Attribute.make("employer/name", Schema.String, { required: true }))
  .attribute(
    Attribute.make("employer/ein", Schema.String, { unique: "account" })
  );

export const Client = Entity.make("client", { label: "Client" })
  .attribute(Attribute.make("client/name", Schema.String, { required: true }))
  .attribute(Attribute.make("client/handbookDoc", Schema.String)); // a document handle

export const Job = Entity.make("job", { label: "Job" })
  .attribute(Attribute.make("job/name", Schema.String, { required: true }))
  .attribute(Attribute.make("job/code", Schema.String)); // e.g. "forklift-driver"

export const Employee = Entity.make("employee", { label: "Employee" })
  .attribute(
    Attribute.make("employee/firstName", Schema.String, { required: true })
  )
  .attribute(
    Attribute.make("employee/lastName", Schema.String, { required: true })
  )
  .attribute(Attribute.make("employee/email", Email))
  .attribute(Attribute.make("employee/workAuthorization", Schema.String))
  .attribute(Attribute.make("employee/ssn", Ssn, { pii: true })) // gated by authz (§5)
  .attribute(
    Attribute.make("employee/dob", Schema.DateFromSelf, { pii: true })
  );

// — the NEW customer-defined type: venue (no migration; exercises configurability) —
export const Venue = Entity.make("venue", { label: "Venue", owner: "customer" })
  .attribute(Attribute.make("venue/name", Schema.String, { required: true }))
  .attribute(Attribute.make("venue/disclosure", Schema.String)); // the disclosure text

// — the subject: placement —
export const Placement = Entity.make("placement", { label: "Placement" })
  .attribute(
    Attribute.ref("placement/employer", "employer", { required: true })
  )
  .attribute(
    Attribute.ref("placement/employee", "employee", { required: true })
  )
  .attribute(Attribute.ref("placement/client", "client"))
  .attribute(Attribute.ref("placement/job", "job"))
  .attribute(Attribute.ref("placement/venue", "venue")) // REF to the custom type
  .attribute(Attribute.make("placement/state", Schema.String))
  .attribute(Attribute.make("placement/startDate", Schema.DateFromSelf))
  .attribute(
    Attribute.make("placement/status", Schema.String, { default: "draft" })
  );

// — role bindings: the compliance engine targets roles, not these names (workflows.md §2.5.1) —
export const Roles = Entity.roles({
  subject: "placement",
  principal: "employee",
  principalRef: "placement/employee", // exactly-one (enforced)
});
```

## 2. The forms (`form-dsl`) — abstract, reusable definitions

A form is an **abstract artifact**: what it's `about` (the principal role it documents) and its
presentation (sections / fields / kind). Crucially it does **not** know which subject requires it or how
it's reused — that's not a property of the document, it's a property of how a compliance program _uses_
it. So **reuse scope lives on the requirement (§3), not the form.** This keeps a form a true library
artifact (`library.md`): the same I-9 can be required by a `placement` _and_ a `contractor-engagement`,
reused on different dimensions, with no change to the form.

```typescript
import { Form } from "@repo/domain/form-dsl";

// (a) DOCUMENT + VERIFICATION
export const I9 = Form.make("i9", { label: "Form I-9", about: "employee" })
  .section("employee", { assignee: "principal" }, (s) =>
    s
      .field("employee/legalName", { required: true })
      .field("employee/workAuthorization", { required: true })
      .field("employee/ssn", { required: true })
  ) // PII — see §5
  .section("employer", { assignee: { role: "hr" } }, (s) =>
    s.attest(
      "i9/employerAttestation",
      "I examined the documents and they appear genuine."
    )
  );

// (b) ACKNOWLEDGMENT
export const Handbook = Form.make("handbook", {
  label: "Employee Handbook",
  about: "employee",
})
  .document({ source: "client/handbookDoc" }) // present the client's handbook
  .acknowledge(
    "handbook/acknowledged",
    "I have read and agree to the handbook."
  );

// (c) QUIZ
export const ForkliftQuiz = Form.make("forklift-quiz", {
  label: "Forklift Operator Quiz",
  about: "employee",
})
  .quiz({ passScore: 80 }, (q) =>
    q
      .question("maxLoad", "What is the rated load limit?", [
        "Whatever fits",
        "The plate rating",
        "2x the plate",
      ])
      .question("horn", "When do you sound the horn?", [
        "Never",
        "At blind corners",
        "Only outdoors",
      ])
  )
  .record("forklift-quiz/score", { from: "quizScore" });

// (d) DISCLOSURE
export const StadiumDisclosure = Form.make("stadium-disclosure", {
  label: "Venue Safety Disclosure",
  about: "employee",
})
  .disclosure({ source: "venue/disclosure" })
  .acknowledge(
    "stadium-disclosure/acknowledged",
    "I understand the venue safety rules."
  );
```

## 3. The requirements (`requirement-dsl`) — connect a form to a subject + its reuse policy

A **requirement** is the compliance-configuration object that _uses_ a form for a subject type. It carries
the three things that are specific to "how this program requires this form," none of which belong on the
abstract form:

- **when** — the guard `Rule` (the per-form condition: forklift only for forklift jobs; disclosure only
  when a venue is set);
- **trigger** — which subject attribute fires it (defaults to the guard's subject-local attribute; given
  explicitly when the guard reaches across a REF, like `job/code`);
- **reuseScope** — the dimensions the reconciler keys reuse on.

```typescript
import { Requirement } from "@repo/domain/requirement-dsl";
import { Rule } from "@repo/domain/rule-dsl";

const US_WORK_STATES = ["CA", "CO", "NY", "TX" /* … */];

export const Requirements = [
  Requirement.make({
    subject: "placement",
    form: I9,
    when: Rule.in("placement/state", US_WORK_STATES),
    reuseScope: ["placement/employer"], // an I-9 is reusable per employer
  }),
  Requirement.make({
    subject: "placement",
    form: Handbook,
    when: Rule.exists("placement/client"),
    reuseScope: ["placement/client"], // a handbook ack is per client
  }),
  Requirement.make({
    subject: "placement",
    form: ForkliftQuiz,
    trigger: "placement/job", // the guard reads job/code across the REF
    when: Rule.eq("job/code", "forklift-driver"),
    reuseScope: ["placement/job"], // the quiz is per job
  }),
  Requirement.make({
    subject: "placement",
    form: StadiumDisclosure,
    when: Rule.exists("placement/venue"),
    reuseScope: ["placement/venue"], // disclosure is per venue
  }),
];
```

Each `Requirement.make` lowers to three things: the **abstract form** (created once, shareable), a
**policy-Flow** (`on` the subject change · `when` the guard · `do assert requires-form` — `workflows.md`
§8.2), and a **requirement record** (`requirement/subjectType`, `requirement/form`, `requirement/scopesOn`)
that the reconciler reads.

The **reconciler** (intrinsic, `compliance.md` §4) turns each `requires-form` fact into reuse-or-collect
using the **requirement's** `reuseScope` — no demo code; it's the engine. That is what produces the §7
matrix. Because the scope is on the requirement, the _same_ abstract I-9 reused per-employer here could be
reused per-engagement for a `contractor` subject simply by adding a second requirement.

## 4. The E-Verify integration (`module-dsl` + a Flow)

E-Verify is an inline integration (`integrations.md`): it owns `everify/case`, and an inbound Flow runs
on I-9 completion — call out, `wait` for the webhook result on the tx feed, then branch. This exercises
`http`, `wait { onFacts }`, `branch`, and `notify` from the Flow IR.

```typescript
import { Module } from "@repo/domain/module-dsl";

export const EverifyOnI9 = Flow.make("everify-on-i9", {
  label: "E-Verify on I-9 completion",
})
  .on({ entityType: "task", event: "attr-changed", attrs: ["task/status"] })
  .when(
    Rule.all(Rule.eq("task/form", "i9"), Rule.eq("task/status", "completed"))
  )
  .do((f) =>
    f
      .http("openCase", {
        method: "POST",
        url: "{{ env.everifyBaseUrl }}/cases",
        body: {
          ssn: "{{ employee.ssn }}",
          firstName: "{{ employee.firstName }}",
        },
      })
      .wait("settled", {
        onFacts: {
          subject: "{{ state.openCase.caseId }}",
          attr: "everify/case/status",
          anyOf: ["employment_authorized", "tentative_nonconfirmation"],
        },
      })
      .branch(
        "tnc",
        Rule.eq("state.settled.value", "tentative_nonconfirmation"),
        (yes) => yes.notify({ to: "principal", template: "tnc-next-steps" }),
        (no) => no.notify({ to: "principal", template: "i9-complete" })
      )
  );

export const EverifyModule = Module.make("everify", {
  label: "E-Verify",
  version: "1.0.0",
})
  .entity(/* everify/case entity */)
  .flow(EverifyOnI9)
  .secret("EVERIFY_API_KEY", { required: true });
```

## 5. Authorization (`grant-dsl`)

A recruiter sees the basics and the placement graph, but **not** PII — `employee/ssn`/`dob` are simply
omitted, so they're invisible (`authorization.md` §2–§3).

```typescript
import { Grant } from "@repo/domain/grant-dsl";

export const RecruiterRole = Grant.role("recruiter").canRead(
  ["employee/firstName", "employee/lastName", "employee/email", "placement/*"],
  { where: Rule.reachable("placement/employee") } // employees who are on a placement
);
// employee/ssn, employee/dob NOT listed → not readable by recruiters
```

## 6. The scenario (`scenario-dsl`) — the test case

A `Scenario` is an ordered list of transactions with inline assertions. It is the e2e test, expressed as
data; §8 runs it. Expectations read against the reconciler's output and the query layer.

```typescript
import { Scenario } from "@repo/domain/scenario-dsl";

export const StaffingE2E = Scenario.make("staffing-e2e")
  .seed((s) =>
    s
      .entity("employer", "acme", {
        "employer/name": "Acme Staffing",
        "employer/ein": "12-3456789",
      })
      .entity("client", "stadiumco", {
        "client/name": "StadiumCo",
        "client/handbookDoc": "doc:sc-handbook",
      })
      .entity("client", "otherco", {
        "client/name": "OtherCo",
        "client/handbookDoc": "doc:oc-handbook",
      })
      .entity("job", "forklift", {
        "job/name": "Forklift Driver",
        "job/code": "forklift-driver",
      })
      .entity("job", "usher", { "job/name": "Usher", "job/code": "usher" })
      .entity("venue", "bigstadium", {
        "venue/name": "Big Stadium",
        "venue/disclosure": "Hard hats required…",
      })
      .entity("venue", "smallvenue", {
        "venue/name": "Small Venue",
        "venue/disclosure": "Badge at all times…",
      })
      .entity("employee", "maria", {
        "employee/firstName": "Maria",
        "employee/lastName": "Lopez",
        "employee/email": "maria@x.com",
      })
  )

  // P1 — everything is new
  .step("P1: Acme · StadiumCo · forklift · BigStadium", (s) =>
    s
      .create("placement", "p1", {
        employer: "acme",
        employee: "maria",
        client: "stadiumco",
        job: "forklift",
        venue: "bigstadium",
        state: "CA",
      })
      .expectRequired("p1", [
        "i9",
        "handbook",
        "forklift-quiz",
        "stadium-disclosure",
      ])
      .expectCollected("p1", [
        "i9",
        "handbook",
        "forklift-quiz",
        "stadium-disclosure",
      ])
  ) // none reusable yet

  // Maria completes P1; E-Verify fires on the I-9
  .step("Maria completes P1", (s) =>
    s
      .complete("p1", "i9", {
        "employee/ssn": "123-45-6789",
        "employee/workAuthorization": "citizen",
      })
      .complete("p1", "handbook")
      .complete("p1", "forklift-quiz", { quizScore: 90 })
      .complete("p1", "stadium-disclosure")
      .expectIntegrationRan("everify", { principal: "maria" })
      .expectCompliant("p1")
  )

  // P2 — same employer, job, venue → reuse; new client → collect handbook
  .step("P2: Acme · OtherCo · forklift · BigStadium", (s) =>
    s
      .create("placement", "p2", {
        employer: "acme",
        employee: "maria",
        client: "otherco",
        job: "forklift",
        venue: "bigstadium",
        state: "CA",
      })
      .expectReused("p2", ["i9", "forklift-quiz", "stadium-disclosure"])
      .expectCollected("p2", ["handbook"])
  )

  // P3 — same employer + same client(stadiumco) → reuse; usher (not forklift) → not required; new venue → collect
  .step("P3: Acme · StadiumCo · usher · SmallVenue", (s) =>
    s
      .create("placement", "p3", {
        employer: "acme",
        employee: "maria",
        client: "stadiumco",
        job: "usher",
        venue: "smallvenue",
        state: "CA",
      })
      .expectReused("p3", ["i9", "handbook"])
      .expectNotRequired("p3", ["forklift-quiz"])
      .expectCollected("p3", ["stadium-disclosure"])
  )

  // Expiry / re-verification — the reconciler loop reversed
  .step("I-9 expires after 1 year", (s) =>
    s
      .advanceTime("400 days")
      .expectUnsatisfied("p1", "i9")
      .expectRequired("p1", ["i9"])
  ) // re-collected

  // Bitemporal audit — time-travel to the compliant instant
  .step("Audit: was P1 compliant the day Maria finished?", (s) =>
    s.asOf("$P1.completedAt").expectCompliant("p1")
  )

  // Authorization — a recruiter query must not surface the SSN
  .step("Recruiter cannot see PII", (s) =>
    s
      .as("recruiter")
      .query({ type: "employee", select: ["employee/ssn"] })
      .expectDenied("employee/ssn")
  );
```

## 7. Expected-outcome matrix (the reuse breadth, explicit)

The heart of the test — each cell is an assertion in §6:

| Placement (employer · client · job · venue)     | I-9 (per employer) | Handbook (per client) | Forklift quiz (per job) | Stadium disclosure (per venue) |
| ----------------------------------------------- | ------------------ | --------------------- | ----------------------- | ------------------------------ |
| **P1** Acme · StadiumCo · forklift · BigStadium | collect            | collect               | collect                 | collect                        |
| **P2** Acme · OtherCo · forklift · BigStadium   | **reuse**          | collect               | **reuse**               | **reuse**                      |
| **P3** Acme · StadiumCo · usher · SmallVenue    | **reuse**          | **reuse**             | _not required_          | collect                        |

Every "reuse" is the generated reuse query matching the prior completed task on that form's `scopesOn`
dimension; every "collect" is a non-match; "not required" is the guard (`job/code = forklift-driver`)
not firing. This single table validates the reconciler across four distinct scope dimensions.

## 8. The test harness

How §6 becomes a real e2e test, on the substrate and per the repo's conventions (transaction-isolated,
`pnpm test`):

1. **Apply the demo as config** (`config.md`): the entities (§1), forms (§2), Flows (§3), module (§4),
   and grant (§5) are `apply`-ed to a fresh **test account** — one transaction, the schema is now live.
   (This also exercises config-as-code and the JIT API surfacing `employee`/`placement`/`venue`.)
2. **Run the scenario** as an Effect program: each `.step` is a DB transaction (the writes) followed by
   its assertions. `create`/`complete` write facts via `assertFact`; the reconciler Flow runs inline;
   `expectRequired`/`expectReused`/`expectCollected`/`expectCompliant` read back via the query/list
   layer; `expectIntegrationRan` stubs E-Verify and asserts the inbound webhook fact; `advanceTime`
   parks/resumes the `wait`; `asOf` issues a time-travel query; `as("recruiter")` runs under that grant.
3. **Isolation**: the whole scenario runs in a transaction rolled back at the end (per `AGENTS.md`), or
   against a disposable test account.

```typescript
// staffing-e2e.test.ts
it("staffing compliance: obligations, cross-dimension reuse, integration, audit", () =>
  Effect.gen(function* () {
    const account = yield* TestAccount.fresh();
    yield* Config.apply(account, DemoConfig); // §1–§5 as one config
    yield* Scenario.run(account, StaffingE2E); // §6 — assertions throw on mismatch
  }).pipe(runTest));
```

`Scenario.run` is generic: any `Scenario` value is executable, so this same harness covers future demos.

## 9. What it exercises (breadth coverage)

Each vision doc, made concrete by one part of the demo:

| Doc                                      | Exercised by                                                                                                                 |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [`triples.md`](./triples.md)             | entities/attributes/facts; the `asOf` audit step                                                                             |
| [`workflows.md`](./workflows.md)         | the four policy-Flows + the E-Verify Flow — uses `requireForm`, `http`, `wait{onFacts}`, `branch`, `notify`, `rerun`, guards |
| [`compliance.md`](./compliance.md)       | obligations → reconciler reuse-or-collect; the §7 matrix; expiry/re-verification                                             |
| [`library.md`](./library.md)             | forms are versioned definitions (extend the scenario with a handbook v2 upgrade to exercise the overlay merge)               |
| [`integrations.md`](./integrations.md)   | the E-Verify module + inbound Flow + `everify/case`                                                                          |
| [`authorization.md`](./authorization.md) | the recruiter grant; the SSN-denied step                                                                                     |
| [`performance.md`](./performance.md)     | reuse matches via the `@>` projection (the hot path under the assertions)                                                    |
| [`config.md`](./config.md)               | the demo is `apply`-ed as one config; `venue` is a customer-defined type                                                     |
| [`api.md`](./api.md)                     | the JIT API exposes `employee`/`placement`/`venue` endpoints for the test client                                             |
| [`ai.md`](./ai.md)                       | the forklift quiz is the kind of form an LLM could draft, gated by validate/preview                                          |

If the e2e test built from §6 passes, the core of the vision is demonstrably working end-to-end on one
realistic staffing scenario.

---

## Assumptions & open items

- The DSL surfaces (`entity`/`form`/`flow`/`module`/`grant`/`scenario`-dsl) are proposed here; the
  authoritative Flow IR they lower to is `workflows.md` §8, and the config apply/plan is `config.md`.
- `expectReused` vs `expectCollected` asserts the reconciler's _decision_; the §7 matrix is the source of
  truth for those decisions.
- Form _kinds_ (document, acknowledgment, quiz, disclosure) are presentation/validation metadata over
  attribute projections — the quiz's `passScore` and the disclosure's `source` are form-builder features,
  not new substrate primitives.
- Extending the scenario with a **library upgrade** (handbook v1→v2 with an account overlay) and a
  **second employee** (to show reuse is per-principal) are the natural next assertions.
