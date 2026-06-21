# machine.md — the machine boundary as a Forma elaboration

> `💭` Exploration, not a decision — see [`README.md`](./README.md). This is the
> promotion [`effect-cluster.md`](./effect-cluster.md) §5 invited: the `shelly`
> thread earned more than a section, so it gets its own. The claim is the same
> one [`workato.md`](./workato.md) / [`n8n.md`](./n8n.md) proved for
> **integration** and [`effect-cluster.md`](./effect-cluster.md) proved for
> **execution** — *the durable artifact is the IR + emitter seam, not the
> vendor* — applied to a fourth boundary: the **machine**. Companion to
> [`../reference/targets.md`](../reference/targets.md) (the host/storage/transport
> axes), [`alchemy.md`](./alchemy.md) (infra-as-program), and
> [`phase-space.md`](./phase-space.md) §2 (where this is an Axis-2 target). Home
> and registry: **`machine.metacrdt.com`**.

---

## 0. The claim, in one line

A `machine.md` is a **literate, agent-executable description of a development
machine** — narrative for humans, Forma for the engine — that an agent
*converges* a fresh VM toward, emitting a `machine.lock` that is a **proof of
convergence, not a script**.

The integration explorations earned the rule *one emitter is an integration;
two is an architecture.* The machine boundary's restatement: **one provisioner
is a setup script; two is an architecture.** [exe.dev](https://exe.dev) + its
built-in agent Shelley is one provisioner. Nix, cloud-init, a devcontainer, a
bare SSH-plus-agent loop are peers behind the same seam. What is durable is the
**machine spec** (Forma → IR → machine facts); the provisioner is replaceable.

```text
Ontology  →  Forma Lisp  →  Canonical IR  →  Machine facts  →  Provisioner adapter
                                              (desired state)   ├─ exe.dev / Shelley
                                                                ├─ bare SSH + agent
                                                                ├─ cloud-init
                                                                ├─ Nix profile
                                                                └─ devcontainer.json
```

This is the same `ReactDOM.render` / `ReactNative.render` move the rest of the
stack makes one layer below the DSL: one description, many realizations.

---

## 1. What a `machine.md` is

It is a Markdown file with three layers, in this order. The narrative is for the
human reviewing the PR; the fenced `forma` blocks are the only thing the engine
reads; the checks are the contract that closes the loop.

```text
# 1. Narrative      — what is this machine FOR? (prose, ignored by the engine)
# 2. Desired state  — (define-machine …) Forma blocks (the spec)
# 3. Verification   — (check …) forms whose green/red is observable fact
```

The literate framing is deliberate and is the whole point of choosing Markdown
over a bare `Machinefile`: the same artifact is the onboarding README *and* the
provisioning program. It is to a dev machine what a `define-integration` is to
an iPaaS recipe — the contract, not the vendor export.

### Normative core (the part that makes it a spec, not a vibe)

A conforming `machine.md` and its runtime obey RFC 2119 keywords:

- A `machine.md` **MUST** contain exactly one top-level `(define-machine <name> …)`
  form. Additional `define-machine` forms **MAY** appear only as `(:extends …)`
  targets resolved from the registry (§5).
- The engine **MUST** ignore all prose and all non-`forma` fenced blocks. A
  `machine.md` with zero `forma` blocks is a README, not a machine — the runtime
  **MUST** refuse it rather than guess.
- Every `(:capability …)` and `(:service …)` **MUST** have a corresponding
  `(check …)` or be reachable by one; the runtime **MUST** treat an unverifiable
  desired-state clause as an error, not a no-op. *Desired state you can't
  observe is a wish, not a fact.*
- The runtime **MUST** be idempotent: applying a converged `machine.md` twice
  produces no changes and an identical `machine.lock` modulo timestamps.
- The agent **MUST NOT** perform any action gated by `(:must-ask …)` (§6)
  without explicit human confirmation, even when running unattended.
- Secrets **MUST** be referenced by *name* only (`(secret …)`); a literal
  secret value in a `machine.md` is a spec error the runtime **MUST** reject.

---

## 2. The ontology — a machine is a small fact set

`machine.md` is not a new modeling language; it is the substrate's
desired-vs-observed ontology pointed at a host. The nouns are machine facts:

| Forma form | Machine fact | Observed by |
| --- | --- | --- |
| `(:capability node@22 pnpm@9 ripgrep)` | a tool/runtime is present at a version | `which` / `--version` probe |
| `(:service postgres :5432)` | a named daemon is listening on a port | port probe / health endpoint |
| `(:repo …)` | a working tree is cloned at a ref | `git rev-parse` |
| `(:dotfile …)` | a config file has known content | content hash |
| `(:secret n8n-key)` | a named secret is *available* (not its value) | presence in the agent's vault |
| `(:check id (:run …) (:retries n))` | an observable predicate is green | exit code |
| `(:extends org://acme/base)` | inherit another machine's facts | registry resolution (§5) |
| `(:permission …)` / `(:must-ask …)` | what the agent may do unattended | the agent's policy gate (§6) |

Reframed in the repo's own nouns, exactly as [`effect-cluster.md`](./effect-cluster.md)
§3 sketched it — now with the verification layer made first-class:

```lisp
(define-machine metacrdt-workstation
  (:extends org://acme/base-workstation)

  (:capability node@22 pnpm@9 ripgrep jq)
  (:repo metacrdt
    (:url    "git@github.com:metacrdt/metacrdt.git")
    (:ref    main)
    (:after  (run "pnpm install --frozen-lockfile")))

  (:service postgres :5432)
  (:service redis    :6379)
  (:service app      :3000 (:from (run "pnpm dev")))

  (:check  toolchain     (:run "node --version && pnpm --version"))
  (:check  install-clean (:run "pnpm install --frozen-lockfile"))
  (:check  tests-pass    (:run "pnpm test"))
  (:check  dev-responds  (:run "curl -fsS localhost:3000/health" (:retries 5))))
```

`machine.md`'s lisp surface is the same Forma core documented in
[`forma.md`](../vision/forma.md) / [`dsl.md`](../vision/dsl.md) — `define-machine`
is just another `define-*` head whose elaboration target is *the machine
boundary*. No new parser, no new type system; the seam reuses
[`@forma/ts`](../vision/forma.md).

---

## 3. Reconciliation semantics — the lock is a proof, not a script

This is the load-bearing distinction and the reason `machine.md` is substrate
work rather than a fancy shell script.

```text
substrate:   desired facts    vs  observed facts    → Effect program → new facts
machine.md:  desired machine  vs  observed machine  → Effect program → machine.lock
```

The agent reads the spec, probes the host for the *observed* facts, computes the
delta, and runs the smallest set of convergent actions to close it. The
`machine.lock` it writes is **not** a replayable install script — it is a
**materialized view of "what actually reached green on this OS,"** the same
relationship the substrate draws between a fold and a projection. The lock is to
the `machine.md` what a current-row is to the event log.

The verbs follow directly from "it's a reconciliation loop, not a build":

| Verb | Meaning | Substrate analogue |
| --- | --- | --- |
| `machine apply` | converge observed → desired | run the fold |
| `machine verify` | run all `(check …)`; report green/red **without mutating** | read the projection |
| `machine diff` | desired vs observed, no actions | what *would* the fold change |
| `machine doctor` | explain *why* a check is red | trace a derivation |
| `machine repair` | re-converge only the red facts | incremental refold |
| `machine snapshot` | freeze observed facts into a `machine.lock` | materialize |

`machine verify` being a pure read is what makes the spec testable in CI: a base
image either still converges or it doesn't, and the answer is an exit code.

### Does it converge to git?

The question from the originating thread resolves cleanly in this frame: **no.**
Git is the *transport* — where the `machine.md` lives, how PRs review it — the
same role it plays for every spec in this repo. The *runtime* is the
reconciliation loop. `machine.md` converges to **Terraform-for-machines**, and
one layer deeper to the same desired-vs-observed-facts ontology the whole
substrate is built on.

---

## 4. The provisioner seam — exe.dev is one adapter

The provisioner is the machine-boundary analogue of an execution-host adapter
([`effect-cluster.md`](./effect-cluster.md)) or an iPaaS emitter
([`n8n.md`](./n8n.md)). The IR describes *what machine* without naming *who
provisions it*; each adapter realizes the machine facts in its own idiom:

| Machine fact | exe.dev / Shelley | cloud-init | Nix profile | devcontainer |
| --- | --- | --- | --- | --- |
| `(:capability node@22)` | agent runs `apt`/`brew`, judges | `packages:` list | `home.packages` | `features` / image |
| `(:service postgres :5432)` | agent starts + `systemd` unit | `runcmd:` | `services.postgresql` | `docker-compose` sidecar |
| `(:secret n8n-key)` | minted into agent vault | (out of band) | agenix / sops | `secrets` mount |
| `(:check …)` | agent runs, retries, repairs | `bootcmd` exit code | activation script | `postCreateCommand` |
| the whole spec | `--prompt $(cat machine.md)` | generated `cloud-init.yaml` | generated `flake.nix` | generated `devcontainer.json` |

exe.dev is the **reference provisioner** for the same reason DO+alarms is the
reference durable-execution adapter in [`effect-cluster.md`](./effect-cluster.md)
§2: it is the one with an *agent* in the loop, so it realizes the "agent judges,
asks before dangerous actions, repairs" semantics natively instead of by
codegen. The bare invocation today is already real:

```sh
exe new --prompt "$(cat machine.md)"
# or, once machine.metacrdt.com hosts the runner:
ssh exe.dev new --prompt /dev/stdin < machine.md
```

The Nix and cloud-init columns are *emitters* — they lower the same IR to a
declarative artifact and lose the agentic repair loop in exchange for
determinism. That trade is the machine-boundary version of "Workato vs n8n vs
native Flow": pick the provisioner by deployment, not by the spec. The honest
decision table:

| Situation | Provisioner |
| --- | --- |
| Fresh VM, want an agent to judge/repair/explain | exe.dev / Shelley |
| Immutable, reproducible, no agent at runtime | Nix profile (emitted) |
| Cloud fleet bootstrap, no agent | cloud-init (emitted) |
| Editor-local, ephemeral container | devcontainer (emitted) |
| The whole stack should be one alchemy program | exe.dev VM as a `define-resource` ([`alchemy.md`](./alchemy.md)) |

**Guard the IR.** The first provisioner-specific affordance that leaks into the
machine-fact IR (a Nix derivation hash, an exe.dev prompt string, a cloud-init
`runcmd`) breaks the seam this doc exists to prove — the identical caveat
[`n8n.md`](./n8n.md) §5 puts on the Integration IR. Capabilities enter the IR as
*semantics* (`node@22`, `service on :5432`) or not at all.

---

## 5. `machine.metacrdt.com` — registry, runner, and corpus

Per the [branding](../vision/branding.md) taxonomy, `metacrdt.com` is where
first-party kernel products live; `machine.metacrdt.com` is one such product —
the home of the `machine.md` standard and three concrete surfaces:

1. **The registry.** Named base machines resolvable via `(:extends org://acme/…)`.
   `org://acme/base-workstation` is published once; every team `machine.md`
   inherits and overrides it. This is the inheritance edge of the ontology — a
   `define-machine` that `:extends` another is the machine-boundary analogue of
   one ontology composing another in [`ontology.run`](../vision/branding.md).
2. **The runner.** `machine apply | verify | diff | doctor | repair | snapshot`
   as a hosted endpoint plus the exe.dev bridge of §4. CI points `machine verify`
   at a base image on every push; a red check is a build failure, not a Slack
   message.
3. **The corpus.** Every `machine.lock` is an observation: *"this is how
   `node@22` + `pnpm@9` actually reached green on Ubuntu 24.04 / macOS 15 on
   2026-06-18."* Aggregated, the locks are a drift-tested dataset of real
   convergence outcomes — the machine-boundary analogue of [`n8n.md`](./n8n.md)
   §2's vendored, drift-tested recipes. When a base image's `apply` stops
   matching its historical lock, that *is* the drift signal.

A `create-machine` scaffolder (the thread's `npx create-shelly`) emits the
literate skeleton — `machine.md`, `AGENTS.md`, `.env.example`, the `(check …)`
stubs — so the standard has an on-ramp, not just a spec.

---

## 6. The permissions model — the distinct-product heart

[`effect-cluster.md`](./effect-cluster.md) §5 flagged that this surface's blast
radius (handing an agent root on a fresh VM) is what makes it *its own product*
rather than a substrate feature. The spec earns that separation by making the
agent's authority an explicit, reviewable part of the document — not an ambient
property of "the agent can do anything."

```lisp
(define-machine metacrdt-workstation
  (:permission
    (:may install-packages clone-repos write-dotfiles start-services)
    (:must-ask delete-data change-ssh-config expose-public-endpoint touch-secret-value)))
```

- `(:may …)` is the unattended allowlist — the agent converges these without a
  prompt. Anything not listed is implicitly `must-ask`. **Deny by default.**
- `(:must-ask …)` names the irreversible / outward-facing actions the agent
  **MUST** confirm (§1, normative) even running headless — the machine-boundary
  expression of this harness's own "confirm before hard-to-reverse or
  outward-facing actions" rule.
- Secrets cross the boundary by **name, never value**: `(:secret n8n-key)`
  declares *availability*; the value lives in the agent's vault (1Password,
  exe.dev's secret store). A `machine.md` is therefore safe to commit and review
  in a public PR — it contains the *shape* of the machine and the *names* of its
  secrets, and nothing you'd rotate if it leaked.

This block is what lets a `machine.md` be reviewed like code: a diff that adds
`expose-public-endpoint` to `(:may …)` is a security review, visible in the PR,
not a surprise at runtime.

---

## 7. Worked example — the metacrdt monorepo workstation

The full literate document an author commits to the repo root:

````markdown
# machine.md — MetaCRDT monorepo workstation

## What this machine is for

A from-scratch dev box for the MetaCRDT monorepo: Node 22 + pnpm, the
Postgres/Redis the demo elaboration needs, and a dev server reachable over
exe.dev HTTPS. Inherits the org base workstation; adds only the repo specifics.

## Desired state

```forma
(define-machine metacrdt-workstation
  (:extends org://acme/base-workstation)
  (:capability node@22 pnpm@9 ripgrep jq)
  (:repo metacrdt
    (:url "git@github.com:metacrdt/metacrdt.git") (:ref main)
    (:after (run "pnpm install --frozen-lockfile")))
  (:service postgres :5432)
  (:service redis    :6379)
  (:service app      :3000 (:from (run "pnpm dev")))
  (:secret github-deploy-key)
  (:permission
    (:may      install-packages clone-repos write-dotfiles start-services)
    (:must-ask delete-data change-ssh-config expose-public-endpoint)))
```

## Verification — done when these are green

```forma
(check toolchain     (:run "node --version && pnpm --version"))
(check install-clean (:run "pnpm install --frozen-lockfile"))
(check tests-pass    (:run "pnpm test"))
(check dev-responds  (:run "curl -fsS localhost:3000/health" (:retries 5)))
```
````

`machine apply` converges it and writes a `machine.lock` — the proof, not the
recipe:

```jsonc
{
  "machine": "metacrdt-workstation",
  "extends": "org://acme/base-workstation@3",
  "os": "ubuntu-24.04", "arch": "arm64",
  "converged": {
    "node":  { "want": "22",   "got": "22.14.0", "via": "apt nodesource" },
    "pnpm":  { "want": "9",    "got": "9.7.1",   "via": "corepack" },
    "postgres": { "port": 5432, "got": "listening", "via": "systemd" }
  },
  "checks": {
    "toolchain": "green", "install-clean": "green",
    "tests-pass": "green", "dev-responds": "green (3 retries)"
  }
}
```

That lock is the row that joins the §5 corpus: one more data point on how this
spec actually reaches green on this OS.

---

## 8. Honest caveats

- **Handing an agent root on a fresh VM is the threat model, and §6 is necessary
  but not sufficient.** The `(:may …)` allowlist constrains *intended* actions;
  it does nothing about a compromised `(:after (run …))` payload or a malicious
  `:extends` target in the registry. `machine.metacrdt.com` resolving
  `org://…` references is a supply-chain surface — base machines need signing
  and pinning (`@3` in the lock is a start) before this leaves the 💭 folder.
- **The lock is a proof of *what happened*, not a guarantee of *what will*.** A
  green `machine.lock` from 2026-06-18 says node 22 installed via nodesource that
  day; it is evidence, not a frozen closure. Teams that need true reproducibility
  want the **Nix emitter** (§4), and should know they're trading the agentic
  repair loop for a derivation hash. Don't sell the lock as something it isn't.
- **"One spec, many provisioners" is earned per adapter, not asserted** — the
  same discipline [`effect-cluster.md`](./effect-cluster.md) §5 and
  [`targets.md`](../reference/targets.md) put on every Layer. exe.dev/Shelley is
  the one provisioner with an agent today; Nix/cloud-init/devcontainer are
  emitter sketches until each has a conformance run (apply → verify green on a
  clean image) in `@metacrdt/testkit`.
- **This is a distinct product surface, not a substrate feature.** It shares the
  reconciliation *shape* with the data and execution boundaries, and reuses the
  Forma core — but its audience (dev-environment provisioning), its security
  model (§6), and its registry (§5) are orthogonal to the ontology product.
  Folding it in conceptually must not imply a shared roadmap slice; it earns its
  own slice or it stays a sketch.
- **Deflationary, on purpose.** Like [`effect-cluster.md`](./effect-cluster.md),
  the honest reading is that `machine.md` is *not a new architecture* — it is the
  substrate's existing desired-vs-observed loop applied to one more boundary,
  with exe.dev as a ready-made agentic provisioner. The value is the
  confirmation that the seam generalizes to a fourth boundary — **not** a mandate
  to build five provisioner adapters before the data and execution boundaries
  have shipped theirs.
