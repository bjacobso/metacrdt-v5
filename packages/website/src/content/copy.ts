export const navLinks = [
  { href: "#problem", label: "Abstract" },
  { href: "#principles", label: "Model" },
  { href: "#protocol", label: "Protocol" },
  { href: "#meta", label: "Derivation" },
  { href: "#status", label: "Status" },
] as const;

export const sourceLinks = {
  repo: "https://github.com/bjacobso/convex-triples",
  specs: "https://github.com/bjacobso/convex-triples/tree/main/specs",
  protocol: "https://github.com/bjacobso/convex-triples/blob/main/specs/reference/protocol.md",
} as const;

export const hero = {
  eyebrow: "Draft Protocol Specification · Research Preview",
  title: "MetaCRDT",
  thesis:
    "A convergent, bitemporal event protocol for facts, derivations, workflows, permissions, agents, and interfaces.",
  body:
    "MetaCRDT models operational state as a grow-only set of immutable, content-addressed events. Application state is not synchronized directly; it is reconstructed as a deterministic fold at a transaction-time and valid-time coordinate.",
  meta: ["Version 0.1", "Draft", "Static explainer", "No backend dependency"],
} as const;

export const problem = {
  eyebrow: "Abstract",
  title: "Convergence as a projection over bitemporal event history.",
  body:
    "MetaCRDT specifies a representation for structured coordination domains in which facts, schema, rule output, workflow state, permissions, and agent actions are explained by the same append-only event log. The central construction is deliberately small: the log is a CRDT; every readable artifact is a pure fold over that log.",
  points: [
    "History is conserved. Assertions, retractions, tombstones, corrections, actors, reasons, and clocks remain part of the substrate.",
    "Reads are bitemporal. A query asks what was known at transaction time tx about valid time vt.",
    "Derived state is local. Obligations, workflows, rules, and views are recomputed rather than replicated as independent state.",
  ],
} as const;

export const firstPrinciples = {
  eyebrow: "1. Model",
  title: "A two-layer construction: event G-Set plus deterministic folds.",
  body:
    "A replica holds a set of immutable events keyed by EventId. Merging replicas is set union. Given an equal event set, each replica sorts events by the protocol order and computes identical projections for current state, historical state, Datalog output, obligations, workflow runs, generated views, and provenance.",
  properties: [
    {
      name: "Invariant 1 · Fact convergence",
      meaning: "Operational facts merge as a grow-only set of immutable events.",
    },
    {
      name: "Invariant 2 · Provenance",
      meaning: "Every event carries actor identity, clock metadata, and optional causal references.",
    },
    {
      name: "Invariant 3 · Derived coherence",
      meaning: "Rules, obligations, views, and workflows are deterministic functions of visible facts.",
    },
    {
      name: "Invariant 4 · Agent participation",
      meaning: "Agents author proposals and actions under the same merge and provenance semantics as humans.",
    },
  ],
} as const;

export const protocol = {
  eyebrow: "2. Protocol Mechanics",
  title: "Event identity, ordering, visibility, and merge are specified independently.",
  body:
    "The draft protocol defines four event kinds (`assert`, `retract`, `tombstone`, `untombstone`), content-addressed EventIds, Hybrid Logical Clock timestamps, a replica-independent total order, grow-only-set merge, and a deterministic bitemporal visibility predicate.",
  bullets: [
    "Merge: L1 union L2. Commutative, associative, idempotent.",
    "Order: HLC, then actorId, then EventId.",
    "Visibility: txTime bounds what was known; validTime bounds what was true in the modeled world.",
  ],
} as const;

export const meta = {
  eyebrow: "3. Derived Coherence",
  title: "If derivation is a deterministic fold, derived state converges without synchronization.",
  body:
    "Let D be a pure rule over visible facts at coordinate C. If two replicas have observed the same event set L, then visible(L, C) is equal on both replicas, and D(visible(L, C)) is equal as well. Derived facts therefore inherit convergence from the base log while retaining source EventIds for explanation.",
  tagline: "Truth has a tense; derivation inherits that tense.",
} as const;

export const layerStack = String.raw`+-------------------------------------------------------------+
| Configured     product definitions . flows . requirements   |
| surfaces       actions . generated views                    |
+-------------------------------------------------------------+
| Derivation     obligations . reuse . tasks . permissions    |
| layer          workflows . rule output . materializations    |
+-------------------------------------------------------------+
| Engine         Datalog joins . negation . closure . agg     |
|                materialization + provenance                 |
+-------------------------------------------------------------+
| Substrate      bitemporal triples . append-only event log   |
|                schema-as-facts . rebuildable projections    |
+-------------------------------------------------------------+
| Convex         transactional mutations . reactive reads      |
|                indexes . scheduler . crons . components      |
+-------------------------------------------------------------+`;

export const layers = {
  eyebrow: "4. Reference Architecture",
  title: "The reference runtime is an implementation, not the protocol boundary.",
  body:
    "The repository currently uses Convex as a centralized reactive reference runtime. The protocol itself is target-neutral: the substrate is the event model, merge function, fold, bitemporal visibility predicate, derivation discipline, and conformance ladder.",
} as const;

export const conformance = {
  eyebrow: "5. Conformance Levels",
  title: "Implementations may conform incrementally from core log semantics to coordination.",
  levels: [
    { level: "L1 Core", requires: "Data model, log/merge, ordering, and fold." },
    { level: "L2 Bitemporal", requires: "L1 plus the bitemporal visibility predicate." },
    { level: "L3 Derivation", requires: "L2 plus deterministic derivation and provenance." },
    { level: "L4 Sync", requires: "L3 plus anti-entropy synchronization." },
    { level: "L5 Coordination", requires: "L4 plus capabilities, membership, quorum, and authorization." },
  ],
} as const;

export const status = {
  eyebrow: "6. Implementation Status",
  title: "Research preview: centralized reference runtime now, multi-replica runtime frontier.",
  built: [
    "Convex reference runtime",
    "datarooms/compliance elaboration",
    "@metacrdt/core",
    "bitemporal visibility via core in the read path",
    "@metacrdt/schema, @metacrdt/query, @metacrdt/convex, @forma/ts, @metacrdt/runtime, @metacrdt/cloudflare, @metacrdt/local, @metacrdt/node, and @metacrdt/testkit",
    "docs/spec/architecture package plan",
  ],
  frontier: [
    "commutative supersession in the write path",
    "HLC + version-vector sync across replicas",
    "Durable Object + SQLite triple-store parity",
    "production database lifecycle and migrations beyond the current Node SQL DDL plan",
    "full historical SQL-indexed Datalog/query providers beyond the shared EventStore-backed service and current projection-backed query provider",
  ],
} as const;

export const footer = {
  label: "Draft · Research Preview",
  text:
    "The log is a CRDT today. Multi-replica convergence, HLC/version-vector sync, and production coordination profiles remain frontier work. This page is a static explanatory companion to the specification.",
} as const;
