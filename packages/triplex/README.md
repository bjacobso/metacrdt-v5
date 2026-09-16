# @metacrdt/triplex

Explainable coordination and collection as a consumer of Triplex's public APIs.

Triplex supplies facts, bitemporality, configuration releases, derivations,
materialization, provenance, command receipts, and journal checkpoints. This
package supplies requirement occurrences, reconciliation, collection definitions,
submission validation, and durable wakeup state.

## Run

From the repository root, with Node 24 and dependencies installed:

```sh
pnpm demo:triplex
pnpm test:triplex
```

The [self-verifying example](./examples/compliance.ts) uses a temporary SQLite
database. It publishes a form, opens a training requirement, previews and submits
evidence, closes the connection, and reopens work at expiry with a fresh runtime.
It removes its temporary database when finished.

## Coordinator

Inside an Effect 4 program with an already authorized, database-scoped `Triples`
service and a Triplex derivation pinned to a configuration release:

```ts
import { createCoordinator } from "@metacrdt/triplex";

const coordinator = createCoordinator(triples, {
  consumer: "safety-training/v1",
  definition,
});

const state = yield* coordinator.poll(now);
const work = yield* coordinator.requirements();
// Persisted in Triplex, including when the candidate set is empty:
const wakeup = state.nextWakeupAt;
```

`poll(validAt)` consumes the journal up to a captured commit position. It
reconciles on initialization, relevant source changes, or a due temporal edge.
Unrelated transactions only advance its durable consumer checkpoint.
`reconcileNow(validAt)` forces reevaluation. `state()` reads the last applied
materialization and wakeup without evaluating anything.

Call `poll` on worker startup, feed notifications, and the next wakeup. Use
periodic polling as recovery from lost notifications/timer delivery. A host may
schedule `nextWakeupAt` in its existing job system; the persisted state is the
authoritative schedule and can be reread after a restart. This library does not
start a background worker or promise a delivery latency.

### Lifecycle and recovery

- Candidates have stable logical identities. Each opening gets a separate
  occurrence; resolved history is retained when evidence expires and work reopens.
- An absent candidate resolves its open occurrence. **Resolved means no longer
  derived**, which can mean valid evidence, withdrawn placement, or another domain
  condition. It does not by itself prove a successful submission.
- Provenance revisions update the existing open occurrence. Requirements retain
  the candidate revision, pinned definition/release, materialization ID, and source
  position. The referenced immutable Triplex materialization supplies the full
  explanation; closure points to the run in which the candidate disappeared.
- Every reconciliation compares the **complete candidate set** with durable work.
  It does not depend on the previous materialization's diff, which can disappear
  after a crash between materialization and application reconciliation.
- All requirement changes and the next wakeup commit atomically in one Triplex
  transaction. First initialization uses an atomically unique command receipt;
  subsequent writes compare-and-retract the previously observed coordinator head.
  Concurrent losers receive Triplex conflict/duplicate-command errors. Retry by
  calling `poll` again with the current business time.
- The journal checkpoint advances after reconciliation commits. A lost
  acknowledgement or checkpoint failure causes safe replay. No external effects
  execute during reconciliation.

Requirement records use `:metacrdt/consumer`, `:metacrdt/requirement-candidate`,
`:metacrdt/requirement-status`, and a schema-validated JSON body at
`:metacrdt/requirement`. They are ordinary queryable Triplex facts. Operational
records are valid from zero; `openedAt`, `updatedAt`, and `resolvedAt` carry the
evaluated business time, while Triplex recorded history retains record changes.
Do not treat their status attribute as a reconstructed business-time timeline.

## Collection

`collectionNode` compiles the existing `@metacrdt/collect` form vocabulary into a
typed `metacrdt.collection` config node. Include its referenced evidence attribute
and that attribute's referenced entity types in the same `ConfigStore.commit`.

```ts
const form = yield* collectionNode({
  form: "safety-training",
  title: "Safety training",
  evidenceAttribute: ":evidence/safety",
  validityDays: 365,
  fields: [{ name: "certificate", label: "Certificate number", type: "string", required: true }],
});
```

Load the immutable snapshot pinned by the work with `ConfigStore.snapshotById`.
`prepareSubmission(snapshot, formKey, input)` validates against that release and
returns submission-record and evidence assertions, plus their `TransactOp` form.
The submission body retains typed answers and the release pin. Evidence relates
the subject to its scope and carries the form's validity interval.

`previewSubmission(triples, definition, snapshot, formKey, input)` validates the
same input and evaluates a read-only Triplex overlay. It verifies the release pin
and includes only attributes read by the derivation, as required by the published
Triplex overlay API.

The authenticated host commits `plan.operations` with a stable `commandId`, the
authenticated `actor`, and `configSnapshot: plan.configSnapshot`. The host owns
access checks, collection-session tokens, command receipt handling, and any
additional constraints. Preparing or previewing a submission authorizes nothing.

## Scope and compatibility

- The package pins the published Triplex snapshot
  `0.0.0-next-20260904185815` and Effect `4.0.0-rc.112`. It requires no sibling
  checkout, private imports, or modifications to Triplex. The older runtime and
  Forma packages remain on Effect 3; Effect values/layers do not cross that boundary.
- Each consumer is pinned to one derivation and configuration release. Changing
  that pin fails explicitly. Release migration of existing work is future work;
  creating another consumer creates an independent population, not a migration.
- Only fixed-attribute Triplex provenance derivations are supported. Definitions
  must not read the coordinator's `:metacrdt/` output attributes.
- Reconciliation is bounded to 1,000 retained occurrences by default, configurable
  through `maxOccurrences`. It loads that consumer's history and writes one atomic
  batch. This is an initial correctness-oriented implementation, not a scale claim.
- Only this coordinator should write its requirement/head records. Hosts authorize
  database selection and source commands before providing `Triples`.
- Source writes and application reconciliation are separate transactions. Work is
  an eventually updated projection. Pending journal entries or elapsed temporal
  edges can make it stale; `state()` alone is not a freshness verdict. Reconcile
  before relying on it, and validate critical command invariants against source facts.
- This is not an implementation of the original MetaCRDT event-merge protocol.
  Workflow execution, external effect delivery, ViewSpec/dashboard integration,
  and automated configuration/data migration remain outside this first slice.

See [the architecture decision](../../specs/reference/triplex-coordination.md).
