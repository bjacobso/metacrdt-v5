# MetaCRDT — documentation

This is the single entry point for every design, spec, and reference document in
the project. The repository root [`README.md`](../README.md) is the landing page
and dev guide; everything deeper lives here.

## What MetaCRDT is, in one screen

> Databases store facts. CRDTs synchronize facts. **MetaCRDT synchronizes facts,
> logic, workflows, permissions, agents, and interfaces.**

An append-only, bitemporal fact log whose projections — current state, derived
rules, obligations, workflows, generated UI — are all deterministic *folds* of
the same events. Because derivation is also a fold, the things that are normally
bespoke (audit, time-travel, reuse, obligations) become emergent properties of
the substrate. The reference runtime is [Convex](https://convex.dev); the demo
elaboration is compliance datarooms.

## Organized by altitude

Docs are grouped by **what question they answer** and **how often they change** —
not by topic. Topic is expressed by filename and cross-links.

| Altitude | Directory | Question | Stability |
| --- | --- | --- | --- |
| **Reference** | [`reference/`](./reference/README.md) | *What is true now?* — the model, protocol, architecture, positioning | changes when the design changes |
| **Vision** | [`vision/`](./vision/README.md) | *Why does it exist, where is it going?* — ambitious end-state, brainstorm | slow-changing, aspirational |
| **Plans** | [`plans/`](./plans/README.md) | *What are we building next, and how?* — actionable, slice-sized | fast-changing, retired when shipped |
| **Explorations** | [`explorations/`](./explorations/README.md) | *What if the stack were different?* — speculative tech sketches | non-committal |
| **Archive** | [`archive/`](./archive/) | superseded docs, kept for provenance | frozen |

Above all of these sits an **ephemeral coordination layer**: the gitignored
`PLAN.md` / `TODO.md` scratchpads that agents use to coordinate in-flight work on
a branch. They are deliberately not committed and not part of this tree; committed
docs may link to them as "current pulse" pointers, but their content is throwaway.

## Status legend

Used consistently across every doc, so you always know reality vs. aspiration:

`✅ shipped` · `🚧 in progress` · `📐 designed, not built` · `💭 vision/brainstorm` · `🗄 archived`

## Where to start

- **New to the project?** → [`reference/positioning.md`](./reference/positioning.md)
  (what & why), then [`reference/engine.md`](./reference/engine.md) (how it works).
- **Implementing the protocol?** → [`reference/protocol.md`](./reference/protocol.md).
- **Want the product thesis & the full vision?** →
  [`vision/overview.md`](./vision/overview.md), then the
  [vision reading order](./vision/README.md).
- **Picking up build work?** → [`plans/README.md`](./plans/README.md).
- **Understanding the naming / package map?** →
  [`reference/architecture.md`](./reference/architecture.md).

## Full index

### Reference — *what is true now*
- [`engine.md`](./reference/engine.md) — how the engine works (model, packages, Convex runtime, query/write surface) `✅`
- [`protocol.md`](./reference/protocol.md) — the normative MetaCRDT protocol spec (RFC 2119)
- [`architecture.md`](./reference/architecture.md) — the MetaCRDT umbrella, naming, and layer map
- [`positioning.md`](./reference/positioning.md) — manifesto, positioning, and the honest technical spine
- [`physics.md`](./reference/physics.md) — three coordination worlds over one substrate
- [`targets.md`](./reference/targets.md) — target / storage-adapter / transport model

### Vision — *why & where it's going* (`💭`)
- [`overview.md`](./vision/overview.md) — the thesis, the layers, and the pillars
- [`README.md`](./vision/README.md) — the curated reading order over 18 explorations (start: `triples → workflows → compliance → …`)

### Plans — *what's next* (`🚧` / `📐`)
- [`plans/README.md`](./plans/README.md) — active specs and working rules

### Explorations — *speculative* (`💭`)
- [`explorations/README.md`](./explorations/README.md) — Confect, Foldkit, Alchemy
