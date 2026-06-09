# Reference — what is true now

The durable, normative description of the system *as designed and as running*.
These change when the design changes — not before. For aspiration see
[`../vision/`](../vision/README.md); for in-flight build work see
[`../plans/`](../plans/README.md).

| Doc | What it is |
| --- | --- |
| [`engine.md`](./engine.md) | How the engine works end to end: the fact-log model, the package graph, the Convex reference runtime (tables, auth, generated UI), and the query/write surface. The reference-implementation walkthrough. |
| [`protocol.md`](./protocol.md) | The normative **MetaCRDT protocol specification** (RFC 2119): immutable events, content-addressed ids, HLC, the `≺` order, G-Set merge, the bitemporal visibility predicate, derivation, provenance, and sync. |
| [`architecture.md`](./architecture.md) | The **MetaCRDT umbrella**: naming (substrate vs. Open Ontology vs. Alpha Ontology vs. Schematics/Forma vs. Onboarded), and the package/layer map. |
| [`positioning.md`](./positioning.md) | **Manifesto + positioning + the honest technical spine.** What we believe, the pillars mapped to code, why "the log is a CRDT," and the explicitly-named frontier. |
| [`physics.md`](./physics.md) | The generality argument: very different coordination worlds (compliance, co-signing, agent swarms) as three blueprints over one substrate. |
| [`targets.md`](./targets.md) | What a MetaCRDT **target** is, vs. a storage adapter vs. a transport; managed-vs-open hosts; the eventual package dependency graph. |

**Suggested order for a newcomer:** [`positioning.md`](./positioning.md) (what &
why) → [`engine.md`](./engine.md) (how) → [`protocol.md`](./protocol.md) (the
precise contract) → [`architecture.md`](./architecture.md) (the map).
