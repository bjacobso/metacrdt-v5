# Explorations — speculative technology sketches

> `💭` **These are non-committal.** Each doc asks "what would this project look
> like if a particular technology sat underneath it?" They are deliberately kept
> separate from [`../reference/`](../reference/README.md) (what is true now) so a
> reader never mistakes a sketch for a decision. None of these is on the critical
> path; promote a doc to a [plan](../plans/README.md) only when it earns a slice.

| Doc | The "what if" |
| --- | --- |
| [`confect.md`](./confect.md) | What the whole backend becomes if written in **Effect** on Convex via [Confect](https://github.com/rjdellecese/confect) — schema, the config DSL, flows, and the Datalog engine rebuilt on Effect `Schema`. |
| [`foldkit.md`](./foldkit.md) | The **client as a pure projection** — the Elm-architecture Model/Message/update stack in Effect, taken to "the client is a per-session fold of the log." |
| [`alchemy.md`](./alchemy.md) | **Infrastructure as part of the program** — resources, bindings, deploys, and edge actors (R2, Queues, Durable-Object-per-group) modeled as one type-safe Effect program via [Alchemy](https://alchemy.run), with Convex as system of record. |
| [`algebra-dsl.md`](./algebra-dsl.md) | **Operational Algebra as an Effect/Schema TS DSL** in the `HttpApi` idiom — `Algebra.make(...)` as data, executors as the boundary, authority as middleware, typed Datalog, and the §5 residue surfacing as the `R` channel. |
| [`shadow-rooms.md`](./shadow-rooms.md) | **One Forma document, three parallel elaborations** — a private group-activity product ("shadow rooms") authored once in Forma and elaborated into the ontology IR, ViewSpec projections, and a generated Alchemy v2 Effect program (`define-stack`/`define-resource`/`define-actor` → `alchemy.run.ts`). |
| [`workato.md`](./workato.md) | **The integration boundary elaborated into an iPaaS** — `define-integration` emits a generated Workato custom connector (dynamic schema from schema-as-facts, connection token minted from a `define-grant`) plus vendored, drift-tested recipes; the iPaaS is a dumb pipe, the ontology is the contract, and the durable artifact is the Integration IR + emitter seam. |
| [`phase-space.md`](./phase-space.md) | **Phase space — every point is an elaboration.** A structured walk along three axes (new domains, new elaboration targets, new physics laws): rooms-of-one, care circles, covenants, forma→agent-harness, forma→simulation, retro-propagating revocation, memory decay, counterfactual rooms, treaties, attention conservation. The three axes are what the "meta" in MetaCRDT quantifies over. |

Related, but committed reference rather than exploration: the substrate's runtime
targets are described in [`../reference/targets.md`](../reference/targets.md).
