export const navLinks = [
  { href: "#principles", label: "Principles" },
  { href: "#protocol", label: "Protocol" },
  { href: "#layers", label: "Layers" },
  { href: "#status", label: "Status" },
] as const;

export const sourceLinks = {
  repo: "https://github.com/benjacobson/homepage",
  specs: "https://github.com/benjacobson/homepage/tree/main/specs",
  protocol: "https://github.com/benjacobson/homepage/blob/main/specs/reference/protocol.md",
} as const;

export const hero = {
  eyebrow: "Research Preview",
  title: "MetaCRDT",
  thesis:
    "Databases store facts. CRDTs synchronize facts. MetaCRDT synchronizes facts, logic, workflows, permissions, agents, and interfaces.",
  body:
    "A convergence substrate for structured coordination across distributed runtimes: immutable events, bitemporal reads, deterministic folds, and derivation that converges with the base facts.",
} as const;

export const problem = {
  eyebrow: "The Problem",
  title: "Business software keeps rebuilding the same primitives.",
  body:
    "Things, facts about things over time, rules that derive new facts, processes that wait for the world to change, and obligations that fall out of all three. MetaCRDT starts from those primitives once, correctly, on an append-only bitemporal fact log.",
  points: [
    "Audit trails are not a feature bolted onto state; they are the shape of the log.",
    "What did we know when is a normal read coordinate, not a special forensic path.",
    "Products become declared configurations over facts instead of separate applications.",
  ],
} as const;

export const firstPrinciples = {
  eyebrow: "First Principles",
  title: "The log is a CRDT. Everything else is a fold.",
  body:
    "State is not mutated in place. Current facts, historical reads, Datalog derivations, obligations, workflow state, generated views, and agent explanations are deterministic projections of the same event set.",
  properties: [
    {
      name: "Fact Convergence",
      meaning: "Operational facts merge as a grow-only set of immutable events.",
    },
    {
      name: "Provenance",
      meaning: "Every assertion records who made it, when, and why.",
    },
    {
      name: "Derived Coherence",
      meaning: "Rules, obligations, views, and workflows recompute from facts.",
    },
    {
      name: "Agent Participation",
      meaning: "Agents write proposals and actions under the same semantics as humans.",
    },
  ],
} as const;

export const protocol = {
  eyebrow: "The Protocol, Animated",
  title: "Events accumulate. Folds explain what is visible.",
  body:
    "The draft protocol defines assert, retract, tombstone, and untombstone events; content-addressed EventIds; Hybrid Logical Clock timestamps; a deterministic total order; grow-only-set merge; and the bitemporal visibility predicate.",
  bullets: [
    "Merge is set union: commutative, associative, and idempotent.",
    "Order is deterministic: HLC, then actorId, then EventId.",
    "Transaction time and valid time are independent axes.",
  ],
} as const;

export const meta = {
  eyebrow: "The Meta",
  title: "Derivation also converges.",
  body:
    "Rules, obligations, permissions, workflow runs, and generated views are pure deterministic folds over visible facts. They are recomputed from the shared event set, not synchronized as separate state.",
  tagline: "Truth has a tense, and derivation inherits it.",
} as const;

export const layerStack = String.raw`+-------------------------------------------------------------+
| Products       compliance . onboarding . staffing . ...    |
| (configured)   config-as-code lowers to the layers below    |
+-------------------------------------------------------------+
| Emergence      obligations . reuse . tasks . derived state  |
| (rules+flows)  durable workflows . actions . reconcilers    |
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
  eyebrow: "The Layer Stack",
  title: "Each layer is only facts.",
  body:
    "The platform machinery, a tenant's configured shape, and runtime data live in one store with origin facets: system, configured, and data. A product is a set of type, attribute, form, flow, requirement, and action definitions in the same log as the data they govern.",
} as const;

export const conformance = {
  eyebrow: "Conformance",
  title: "A protocol ladder from core log to coordination.",
  levels: [
    { level: "L1 Core", requires: "Data model, log/merge, ordering, and fold." },
    { level: "L2 Bitemporal", requires: "L1 plus the bitemporal visibility predicate." },
    { level: "L3 Derivation", requires: "L2 plus deterministic derivation and provenance." },
    { level: "L4 Sync", requires: "L3 plus anti-entropy synchronization." },
    { level: "L5 Coordination", requires: "L4 plus capabilities, membership, quorum, and authorization." },
  ],
} as const;

export const status = {
  eyebrow: "Status",
  title: "Research Preview, with built and frontier work marked explicitly.",
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
  label: "Research Preview",
  text:
    "The log is a CRDT today. The multi-replica convergence runtime is research. The homepage is static and independent of the Convex reference app.",
} as const;
