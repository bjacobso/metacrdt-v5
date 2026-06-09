# Migrate `convex-triples` from npm workspaces to pnpm

> **This is a self-contained task prompt.** It assumes no prior context. Hand it to
> a fresh agent (or run it yourself) as an independent change that can be reviewed
> and merged on its own. It does **not** depend on, and must not pull in, any other
> in-flight work. The goal is purely: switch the repo's package manager from npm to
> pnpm, with identical build/test/dev behavior afterward.

## Why

This repository currently uses **npm workspaces** (`package-lock.json`,
`packageManager: npm@11.6.2`). We are standardizing on **pnpm** so that we can later
vendor packages that ship with pnpm-native `workspace:*` and `catalog:` dependency
protocols without a lossy conversion step. Migrating the package manager first, as
an isolated PR, keeps that future change small and keeps this change easy to review
and revert.

**Success = after the migration, `pnpm install && pnpm build && pnpm test &&
pnpm typecheck` all pass, and the previously-published behavior of every root script
is preserved.** Do not change any application logic, package source, or test
behavior. This is a tooling-only migration.

## Current state (verify before you start; do not assume)

- Package manager: `npm@11.6.2`, single lockfile `package-lock.json`.
- Root `package.json` has `"workspaces": ["packages/*"]` and `"private": true`.
- Workspace packages (all under `packages/*`):
  `@metacrdt/cloudflare`, `@metacrdt/convex`, `@metacrdt/core`, `@metacrdt/forma`,
  `@metacrdt/local`, `@metacrdt/node`, `@metacrdt/query`, `@metacrdt/runtime`,
  `@metacrdt/schema`, `@metacrdt/testkit`, `@metacrdt/views`.
- **Sibling deps are referenced by fixed version** (e.g. `"@metacrdt/core": "0.1.0"`),
  which npm resolves to the local workspace because the versions match. pnpm needs
  these expressed as `workspace:*`.
- Build orchestration is **Turbo** (`turbo.json`); bundling is **tsdown**
  (`tsdown.config.ts`); the app is **Vite**; tests are **vitest**; backend is
  **Convex**. None of these are npm-specific, but several root scripts shell out to
  `npm`.
- There is **no `.github/workflows`**, **no `.npmrc`**, **no `.nvmrc`/.node-version`**
  in this repo today. (Re-verify — if CI has since been added, you must update it too.)
- There is a `skills-lock.json` — this is **unrelated** to npm; leave it untouched.
- `.context/` contains git submodules with their own pnpm setups — **out of scope,
  do not touch anything under `.context/`.**

## Steps

### 1. Root `package.json`

- Change `"packageManager": "npm@11.6.2"` → `"packageManager": "pnpm@<latest 10.x>"`
  (pin an exact version, e.g. `pnpm@10.11.0`; check the latest stable 10.x).
- **Remove** the `"workspaces"` array — pnpm uses `pnpm-workspace.yaml` instead
  (next step). Leave `"private": true` in place.
- Rewrite every script that invokes npm:
  - `npm run <x>` → `pnpm run <x>` (or just `pnpm <x>`).
  - `npm test --workspace <pkg>` → `pnpm --filter <pkg> test`. These are the
    `test:cloudflare`, `test:core`, `test:convex-package`, `test:forma`,
    `test:local`, `test:query`, `test:runtime`, `test:schema` scripts.
  - Leave `convex`, `vite`, `vitest`, `turbo`, `tsc`, and
    `static-hosting`/`confect` invocations exactly as they are.
- Do **not** change dependency version ranges in the root (except sibling
  `@metacrdt/*` deps, next step).

### 2. Create `pnpm-workspace.yaml`

```yaml
packages:
  - "packages/*"
```

Optionally add a `catalog:` block now if you want to centralize shared versions
(e.g. `typescript`, `vitest`, `effect`), but this is **not required** for the
migration and adds review surface — prefer to keep versions inline and skip the
catalog unless asked. If you do add a catalog, every consuming `package.json` must
switch the corresponding dep to `"catalog:"`.

### 3. Convert sibling workspace deps to `workspace:*`

In **every** `packages/*/package.json` (and the root `package.json`), change each
intra-repo dependency that points at another `@metacrdt/*` package from its fixed
version to the workspace protocol:

```diff
-    "@metacrdt/core": "0.1.0",
+    "@metacrdt/core": "workspace:*",
```

Known sites (re-grep to confirm none were added): root (`@metacrdt/views`),
`cloudflare` (`core`, `query`, `runtime`, `testkit`), `convex` (`core`, `runtime`,
`testkit`), `local` (`core`, `runtime`, `testkit`), `node` (`core`, `runtime`,
`testkit`), `runtime` (`core`, `query`), `testkit` (`core`, `query`, `runtime`),
`views` (`forma`). Grep to be exhaustive:

```bash
grep -rn '"@metacrdt/' package.json packages/*/package.json | grep -v '"name"'
```

Use `workspace:*` (not `workspace:^`) to match the current loose, version-agnostic
linking. These packages are `private`/unpublished, so the protocol won't leak.

### 4. Lockfile swap

- Delete `package-lock.json`.
- Run `pnpm install`. This generates `pnpm-lock.yaml` and a pnpm-style
  `node_modules` (symlinked, with a virtual store). Commit `pnpm-lock.yaml`.
- If `node_modules` is gitignored (check `.gitignore`), no change needed; if not,
  ensure it stays ignored.

### 5. `.npmrc` for pnpm behavior (review carefully)

pnpm uses a strict, isolated `node_modules` by default, which can break tooling that
assumes a hoisted (npm/yarn-classic) layout. Convex codegen, tsdown, Vite plugins,
and `convex-test`/`@edge-runtime/vm` are the likely sensitivity points. Start strict;
only loosen if something breaks:

- First run install + the full verification suite (step 7) with **default** pnpm
  settings (no `.npmrc`).
- **If and only if** you hit module-resolution failures that trace to pnpm's strict
  layout, add a minimal `.npmrc`. Prefer the narrowest fix:
  - `public-hoist-pattern[]=<specific-package>` for a single offender, or
  - `shamefully-hoist=true` as a last resort (document why in the PR).
- Native/postinstall builds (`esbuild`, `rolldown`, `workerd` if present) may require
  pnpm's build-script approval. If install warns about ignored build scripts, add the
  needed entries under `pnpm.onlyBuiltDependencies` in root `package.json` (e.g.
  `["esbuild"]`). Verify against the actual install warnings — don't guess the list.

### 6. Update docs and any tooling that says "npm"

- `README.md` references npm in the quick-start and scripts sections (around the
  "Getting started"/commands blocks: `npm install`, `npm run dev:web`, `npm test`,
  `npm run build`, `npm run pack:packages`, `npm run typecheck`, etc.). Replace with
  the pnpm equivalents (`pnpm install`, `pnpm dev:web`, `pnpm test`, …). Keep prose
  meaning identical.
- Search the whole repo (excluding `.context/` and `node_modules`) for stragglers:
  ```bash
  grep -rn "npm run\|npm test\|npm install\|npm ci\|--workspace\|package-lock\|npm@" \
    --include="*.json" --include="*.mjs" --include="*.ts" --include="*.md" \
    . | grep -v node_modules | grep -v "/.context/"
  ```
  Fix each hit. The `confect-codegen-sidecar.mjs` script under `scripts/` — check
  whether it shells out to `npm`; if so, update it.
- If a `.github/workflows` directory now exists, switch its setup to
  `pnpm/action-setup` + `actions/setup-node` with `cache: pnpm`, and replace
  `npm ci`/`npm run` invocations.

### 7. Verify (must all pass)

Run from the repo root, in order, and confirm green:

```bash
pnpm install
pnpm build:packages   # turbo package builds
pnpm typecheck        # builds packages, typechecks packages, then root tsc
pnpm test             # builds packages, runs vitest backend suite
pnpm test:packages    # all @metacrdt/* package tests via turbo
pnpm pack:packages    # dry-run pack check per package
```

Also sanity-check the per-package filter scripts resolve correctly, e.g.:

```bash
pnpm test:forma       # -> pnpm --filter @metacrdt/forma test
```

And confirm the app dev path still works (build only, don't leave a server running):

```bash
pnpm build:app        # vite build
```

If `convex dev`-based scripts can't run headless in your environment, at minimum
confirm `pnpm dev` resolves and starts the package build step without a
package-manager error (you can interrupt before Convex connects).

## Acceptance criteria

- [ ] `package-lock.json` removed; `pnpm-lock.yaml` committed.
- [ ] `pnpm-workspace.yaml` present with `packages/*`.
- [ ] Root `packageManager` is `pnpm@<pinned>`; `workspaces` array removed.
- [ ] All intra-repo `@metacrdt/*` deps use `workspace:*`.
- [ ] All root scripts run under pnpm; `--workspace` flags converted to `--filter`.
- [ ] No remaining `npm`/`package-lock` references outside `.context/` and
      `node_modules` (verified by the grep in step 6).
- [ ] `pnpm install/build/typecheck/test/test:packages/pack:packages` all pass.
- [ ] `.context/` and `skills-lock.json` untouched.
- [ ] PR description documents any `.npmrc`/`onlyBuiltDependencies` additions and why.

## Out of scope (do not do)

- Any change under `.context/` (git submodules).
- Adding or moving packages, renaming scopes, or restructuring `packages/`.
- Upgrading dependency versions (other than the sibling-protocol change).
- Introducing a `catalog:` unless explicitly requested.
- CI authoring beyond updating an existing workflow, if one exists.
