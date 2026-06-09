---
title: PL Positioning
status: draft
created: 2026-04-29
updated: 2026-04-29
tags: [research, prior-art, positioning, novelty]
---

# PL Positioning

This document maps the language/DSL work in this package against the
programming-languages research traditions it draws from, says honestly
where it is derivative, and identifies the small set of intersections
that may be genuinely novel.

It exists because we keep rediscovering ideas that have decades of prior
art and occasionally encountering open questions that don't. Future
contributors, human and agent, should read this before claiming novelty
in design discussions, and before reinventing things the literature has
settled.

The companion docs that motivated this writeup:

- `elaboration-migration.md` — current state of descriptor migration.
- `elaboration-future.md` — the typed-dataflow elaborator vision.
- `design-decisions.md` — load-bearing decisions, including the
  "structural projection only" boundary.

## What this project is, in PL terms

Open Ontology's language layer is, structurally:

- A **homoiconic Lisp host** with hygienic macros (the kernel).
- An **elaborator-reflection** system: hosts register typed forms via a
  descriptor protocol; the kernel ships with no domain vocabulary.
- A **descriptor language** (`define-elaboration`) for declaring how
  forms project to canonical IR. Currently a small structural
  projection notation, intended to grow into a typed dataflow calculus.
- A **canonical IR** consumed by an Effect-TS interpreter at runtime,
  not lowered to host source.
- A **time-traveling triple store** with **Datalog queries** as the
  runtime data substrate.

The combination is unusual. Each component is well-trodden.

## The traditions this project draws from

### 1. Attribute grammars

**Origin.** Knuth, "Semantics of Context-Free Languages," 1968.

**Core idea.** Annotate the productions of a context-free grammar with
synthesized and inherited attributes computed by equations. Each tree
node carries attribute values; values flow through a dependency graph
the system topo-sorts.

**Modern implementations.**

- **JastAdd** (Lund University, Hedin et al). Reference attributes
  (RAGs) let an attribute on one node point across the tree to another
  node — that's `:lookup-declaration` exactly. Circular attributes
  handle fixed points. Collection attributes aggregate across the tree.
  Demand-driven, cached, incremental. The **ExtendJ** Java compiler is
  built on JastAdd.
- **Silver** (University of Minnesota, Van Wyk et al). Stronger type
  theory than JastAdd; introduces _forwarding_ (a kind of structural
  inheritance between productions).
- **Eli system**. Older, C-flavored.

**How we relate.** The dataflow descriptor language sketched in
`elaboration-future.md` is recognizably an attribute grammar. `:bind`
nodes are local synthesized attributes. `:lookup-declaration` is a
reference attribute. The topo-sort over the descriptor DAG is the
standard AG evaluation strategy.

**What we should not claim novel.** The descriptor formalism itself.
JastAdd has shipped this for 25 years.

### 2. Declarative name binding

**Origin.** Spoofax language workbench (TU Delft, Visser et al).

**Core idea.** Express "in this scope, this name refers to a
declaration of this kind, with this type" as data, not as code. The
compiler reads the declaration and generates name resolution, scoping,
and type checking automatically.

**Modern implementations.**

- **NaBL** (Name Binding Language). The original.
- **NaBL2 / Statix.** Constraint-based successor; scope graphs with
  resolution policies as data.
- **NaBL3.** Latest iteration.

**How we relate.** `:lookup-declaration` and `:type-of` in
`elaboration-future.md` are NaBL2 in miniature. If we ever build the
typed-dataflow elaborator, we should read the NaBL2 papers first;
they've solved most of the design tensions.

**What we should not claim novel.** Cross-form name and type lookup as
typed declarative primitives. Spoofax has shipped this in production.

### 3. Bidirectional programming

**Origin.** Foster, Greenwald, Moore, Pierce, Schmitt, "Combinators
for bidirectional tree transformations," POPL 2005.

**Core idea.** A _lens_ is a pair `(get : S -> V, put : (S, V) -> S)`
satisfying round-trip laws. Lenses compose; bidirectional
transformations from non-bidirectional ones, with type-level
guarantees.

**Modern work.**

- **Boomerang** language (Pierce et al).
- **Symmetric lenses** (Hofmann, Pierce, Wagner) for cases where
  neither side is canonical.
- **Edit lenses** and **delta lenses** (Hoffman, Diskin, Xiong) for
  tracking changes rather than states.
- **Putback-based bidirectional programming** (Pacheco et al) for
  effectful forward computations.

**How we relate.** The "Forward vs Bidirectional" descriptor split
in `elaboration-future.md` maps directly. Pure structural descriptors
admit a `put`; descriptors that invoke effects don't. The type-row
marking on descriptors ("which effects does this touch") is a known
move in lens land.

**What we should not claim novel.** Type-tracked bidirectional
projection with an effectful boundary. The framing exists, even if
not perfectly settled.

### 4. Self-adjusting computation / incremental compilation

**Origin.** Acar, "Self-Adjusting Computation," PhD thesis, CMU, 2005.

**Core idea.** Track dependencies during computation; when an input
changes, recompute only what depends on it. The result is correct as
long as the computation is deterministic and the dependency tracking
is sound.

**Modern implementations.**

- **Adapton** (Hammer, Acar). Academic incremental computation library.
- **Salsa** (rust-analyzer). Production incremental query database for
  Rust IDE infrastructure.
- **Pants v2 rule engine** (Twitter/Pants Build). Build-system framing.
- **Glean** (Meta). Read-only typed Datalog for code facts; not
  incremental in the SAC sense but in the same neighborhood.
- **Differential Dataflow** (McSherry, Murray, Isaacs). Incremental
  Datalog with strong semantics.
- **IncA** (Erdweg, TU Delft). Incremental Datalog specifically for
  IDE program analyses.

**How we relate.** The persistent caching idea, the dependency-tracked
elaboration, and the "recompile what changed" story all come from this
tradition. We have not yet built it; when we do, IncA and Salsa are
the canonical references.

**What we should not claim novel.** Incremental dependency-tracked
computation. The literature is deep.

### 5. Algebraic effects and effect handlers

**Origin.** Plotkin, Power, "Algebraic Operations and Generic
Effects," 2003. Plotkin, Pretnar, "Handlers of Algebraic Effects," 2009.

**Core idea.** Effects are algebraic operations; handlers are
catamorphisms over their free monad. Effect rows in the type system
track which operations a computation may invoke.

**Modern implementations.**

- **Eff** (Bauer, Pretnar). The original calculus.
- **Koka** (Leijen, Microsoft Research). Row polymorphism, syntactic
  ergonomics.
- **Frank** (McBride, Lindley). "Do be do be do."
- **OCaml 5** effect handlers. Production runtime support.
- **Idris's Elaborator Reflection** (David Christiansen, PhD thesis,
  2016). User-extensible elaboration as a typed effectful program.
- **Lean 4** elaborator macros. Effect-flavored meta-programs.

**How we relate.** Decision 2 in `design-decisions.md` explicitly
chose elaboration-time capability resolution over row-polymorphic
runtime effects. The proposed `:elaborate-in <namespace>` clause is a
named effect operation in the algebraic-effects sense.

Christiansen's thesis is the most directly relevant single document
for the future-direction work; if we pick up the typed-dataflow
elaborator, read it first.

**What we should not claim novel.** Algebraic effects, effect rows,
handler dispatch, or elaborator reflection in the general sense.

### 6. Language workbenches and DSL-oriented programming

**Origin.** Multiple. Felleisen et al, "Language-Oriented Programming"
(Racket lineage); Fowler, "Domain-Specific Languages" (general
positioning); JetBrains MPS as commercial precedent.

**Core idea.** The host language is built around hosting other
languages. Macros, syntactic extension, projectional editing, typed
metamodels.

**Modern systems.**

- **Racket** with `syntax-parse`, `syntax-spec`, **Turnstile** (typed
  macros). The cleanest research instance of a host-for-DSLs.
- **Rosette** (Bornholt, Torlak). Symbolic execution as a Racket DSL.
- **JetBrains MPS**. Projectional editor with typed metamodels;
  bidirectional authoring is shipped commercially.
- **Spoofax**. Mentioned above; also a workbench.
- **Lean 4** as a meta-programming platform.

**How we relate.** The descriptor protocol, the prelude-as-DSL story,
and the "engine knows nothing about the domain" stance are
language-workbench positioning. The Lisp-as-host choice is most
similar to Racket; the typed elaboration vision is most similar to
Lean 4 or Idris.

**What we should not claim novel.** The general "host-for-DSLs"
framing. It is a 30-year tradition.

### 7. Datalog as a program-analysis substrate

**Origin.** Datalog's roots are in deductive databases (1980s);
program-analysis applications start with Reps's "Demand
Interprocedural Program Analysis Using Logic Databases" (1994) and
mature in Whaley & Lam's bddbddb (2004).

**Modern implementations.**

- **Soufflé**. Production-grade Datalog with synthesis and
  optimization. Used in industrial security analysis.
- **Doop** (Bravenboer, Smaragdakis). Java pointer analysis as
  Datalog; the canonical demonstration that hard analyses fit
  declaratively.
- **Glean**. Meta's typed Datalog for code facts.
- **IncA**. Incremental Datalog for IDE analyses.
- **Differential Datalog (DDLog)**. Incremental, used by VMware NSX.

**How we relate.** Open Ontology already commits to Datalog as the
runtime query language. The "unified Datalog substrate" idea in
`elaboration-future.md` extends that commitment to elaboration and
IDE indexing.

**What we should not claim novel.** Datalog as an analysis substrate.

## Where this project sits in the design space

A taxonomy with rough comparisons:

| Dimension                          | This project                                   | Closest analog                       |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------ |
| Host language                      | Homoiconic Lisp                                | Racket                               |
| Type system                        | HM with elaboration-time effect handlers       | OCaml                                |
| Elaboration model                  | Descriptor protocol with structural projection | JastAdd                              |
| Cross-form analysis (planned)      | `:lookup-declaration` primitive                | NaBL2 / Statix                       |
| Cross-namespace dispatch (planned) | `:elaborate-in` named effect                   | Idris elaborator reflection          |
| Bidirectional projection (planned) | Forward/Bidirectional type-row split           | Boomerang lenses                     |
| Incremental cache (planned)        | Content-addressed query graph                  | Salsa / IncA                         |
| Runtime IR substrate               | Time-traveling triple store + Datalog          | Datomic + Glean                      |
| Distribution model                 | Runtime-loaded preludes                        | MPS (closest), but MPS is build-time |
| Domain positioning                 | Operational ontology authoring                 | none well-known                      |

No existing system occupies the same cell across all rows. The
project's distinctive structural commitment is **runtime-loaded typed
elaboration descriptors over a temporally-rich Datalog substrate, in
a Lisp host, positioned for operational ontology authoring**.

## What is _not_ novel and should not be claimed as such

To save effort and reputation:

- The descriptor language as a structural projection notation. AG
  systems have done this since the 1970s.
- Cross-form lookup and typed name binding as data. NaBL2.
- Bidirectional projection from a single declarative spec. Lenses.
- Effect rows and handler dispatch. Algebraic effects.
- Elaborator reflection or user-extensible elaboration. Idris, Lean.
- Macro hygiene, homoiconicity, syntax-parse-shaped pattern matching.
  Racket and Scheme.
- Incremental compilation through dependency tracking. Salsa, SAC.
- Datalog as analysis substrate. Soufflé, Doop, Glean.
- Time-travel as a database property. Datomic.
- Content-addressed build caches. Bazel, Nix.
- Runtime-loaded language extensions. Many Lisp dialects, Smalltalk,
  Pharo, Self.

If a contributor proposes a design and the proposal cleanly maps onto
one of the above, the prior art should be cited and the proposal
treated as engineering, not research.

## Where this project may sit at a research frontier

Three intersections look genuinely under-explored. None has been
implemented yet, and the assessment may be wrong; the discipline is
to build the system first and write the contribution from real
findings, not to chase novelty for its own sake.

### A. Unified Datalog substrate for elaboration, runtime, and tooling

The structural claim is that elaboration state, application runtime
state, and IDE index can share a single typed Datalog fact base, with
one set of incremental dependency-tracking semantics, one rule
language, and one provenance model.

Most existing systems separate these layers. Glean unifies compile-time
facts but is read-only after build. IncA is IDE-only. Spoofax
generates imperative analyses from declarative AGs. The argument that
all three layers can and should share substrate is not, to our
knowledge, made coherently in published work.

Open Ontology is unusually positioned to make it because it already
commits to Datalog as the runtime query language and to a typed
declarative descriptor language. The remaining step is to compile
descriptors to rules over the same fact base and let standard
incremental Datalog (Differential Dataflow, IncA-style evaluation)
do the rest.

A respectable engineering-track paper could come from this. SLE,
OOPSLA, or ICFP experience-report shaped.

### B. Bitemporal incremental elaboration

Open Ontology's runtime is time-traveling: every fact is timestamped,
queries can ask "what did X look like at time T." If the descriptor
language compiles to that fact base, the elaboration cache itself
acquires temporal semantics. Two time axes (code time, data time)
intersect with one cache axis.

Standard incremental compilation (Salsa, IncA) assumes one time axis.
Standard time-traveling databases (Datomic) handle the other but do
not address derived computation. The combination is, as far as we
know, unstudied.

The interesting questions:

- What does the cache key for a derived value look like when its
  inputs are temporal? `(content_hash, fact_base_version)` is a start;
  the invalidation algebra is open.
- What's the semantics of "what would the IR have been at time T given
  code version C′"? Two histories, one derivation.
- What temporal queries on derived results are well-defined? "Show me
  how this view IR has evolved" is intuitive; the formal account is
  not obvious.

This is more theoretically novel than (A), with a higher chance of
producing nothing usable. POPL/ICFP-shaped if it works.

### C. Effectful bidirectional descriptors with a typed boundary

Standard lens theory assumes pure forward computation. Effectful lens
proposals exist but lack a clean type-theoretic account. The proposed
design — descriptors are bidirectional iff their effect row is empty,
with partial inverses available when effects can supply witnesses —
may be a small contribution to the lens algebra.

The interesting questions:

- What's the largest class of descriptors admitting _partial_
  inversion? Inverse-given-witness is a candidate combinator.
- How do effect rows compose with bidirectionality? Type rules need
  care.
- What are the laws? Lens laws generalize how, exactly?

Most theoretically interesting, most likely to die from "this is a
special case of [paper from 2014]." Worth pursuing only if a concrete
type-theory question forces itself onto the implementation path, not
because it would be a nice paper.

## Reading list

Roughly ordered by relevance to this project's open work.

1. **David Christiansen, "Type-Directed Elaboration of Quasiquotations:
   A High-Level Syntax for Low-Level Reflection," PhD thesis, 2016.**
   The single most relevant document. Read first if picking up the
   typed-dataflow elaborator.
2. **Visser et al on NaBL2 / Statix.** The Spoofax papers on
   declarative name binding. Particularly: Néron, Tolmach, Visser,
   Wachsmuth, "A Theory of Name Resolution," ESOP 2015.
3. **Erdweg et al, "IncA: A DSL for the Definition of Incremental
   Program Analyses," ASE 2016.** The Datalog + incrementality + IDE
   positioning that maps closely onto our goals.
4. **Foster et al, "Combinators for Bidirectional Tree
   Transformations," POPL 2005.** The lens foundation. Read alongside
   Hofmann/Pierce/Wagner on symmetric lenses.
5. **Hedin, "Reference Attributed Grammars," Informatica 2000.** The
   JastAdd foundation; the cleanest articulation of cross-tree
   reference attributes as a typed primitive.
6. **Plotkin, Pretnar, "Handlers of Algebraic Effects," ESOP 2009.**
   The effect-handler foundation. Skim to set vocabulary; the
   subsequent literature has refined practical details.
7. **Acar, "Self-Adjusting Computation," PhD thesis, 2005.** Skim for
   the vocabulary and the two-level (input vs. derived) framing.
   Salsa's documentation is the practical companion.
8. **McSherry et al on Differential Dataflow.** If pursuing the
   unified-Datalog substrate, the engineering substrate to lean on.
9. **Felleisen et al, "A Programmable Programming Language," CACM 2018.** The Racket language-oriented programming positioning, in a
   short readable paper.

Each of these is a depth-first hop, not a survey. A balanced reader
familiar with type systems and macros can absorb the core ideas in a
weekend per item; the full literature behind each is much deeper but
not required to do work in this project.

## How to use this doc

When proposing a design in this area:

1. **Check the "not novel" list.** If the proposal cleanly fits, treat
   it as engineering. Cite the prior art. Don't claim novelty.
2. **Check the "may sit at a frontier" list.** If the proposal lives
   at one of those intersections, write the question down concretely
   in `research-questions.md` (TODO: create). Pursue it as a side
   thread; don't let it block engineering.
3. **If neither,** the design is probably a known idea we have not
   yet cataloged. Look for the analog in the reading list or
   adjacent literature before treating the design as new.

The discipline this doc enforces is honesty: most of what we do is
synthesis of known ideas, and that's the right shape for industrial
PL infrastructure. The places we may genuinely contribute are narrow
and clearly identified. Both framings should be respected.

## Status and limits

This document is the author's best read of the field as of writing.
It is incomplete in predictable ways:

- The traditions surveyed are biased toward Western academic PL.
  Industrial PL infrastructure (LLVM, Roslyn, GraalVM, MLIR) is
  under-represented.
- Database, knowledge-representation, and ontology-engineering
  literatures are deliberately excluded; they deserve their own
  positioning doc.
- Live-programming research (Hazel, Dark, Glamorous Toolkit) is not
  covered. Worth adding when relevant.
- The novelty assessments are subjective and may be falsified by a
  paper the author has not read.

If you find a published precedent for one of the "may sit at a
frontier" claims, update this doc and move the claim to the "not
novel" section. That's the contribution this doc most wants from
future readers.
