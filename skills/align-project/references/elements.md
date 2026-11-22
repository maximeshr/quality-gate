# Elements

Every element of a project that the OKQ stack defines, in migration order. For each: the **target** (the why is in `../okq-stack/references/conventions.md`), how to **detect** a gap (`scripts/audit.sh` check names), how to **migrate**, and what to **watch** (`pitfalls.md`).

## Contents

- [Files and tooling](#files-and-tooling): package manager, runtime and module format, Vite+, quality-gate, base config, scripts, git hooks, dependency policy
- [CI and releases](#ci-and-releases): CI workflows, Changesets, release workflow, npm publishing, Dependabot
- [Repository settings](#repository-settings): branches, merging, rulesets, automation, security
- [Hosting](#hosting)
- [Documentation](#documentation): README, CONTRIBUTING and LICENSE, agent instructions

## Files and tooling

### Package manager

- **Target**: pnpm at quality-gate's version, in `devEngines.packageManager` (`onFail: "download"`); no `packageManager` field; `pnpm-lock.yaml`.
- **Detect**: "package manager is pnpm", "pnpm … matches quality-gate", "packageManager field absent".
- **Migrate**: from bun — `devEngines` to pnpm, delete `bun.lock`, `bunfig.toml`, `trustedDependencies`; move `overrides` into `pnpm-workspace.yaml`; `vp install`; diff the resolved versions against the old lockfile and explain every difference; replace every bun command in CI, hosting, docs and `.claude/settings.json`. From npm or yarn — same, starting from their lockfile.
- **Watch**: undeclared imports that only worked through hoisting; bun catalogs; `npm` refusing to run inside the project (`EBADDEVENGINES`).

### Runtime and module format

- **Target**: `devEngines.runtime` on the current LTS (apps: the host's major), `.nvmrc`; `engines.node` = the real minimum of the runtime dependencies; `@types/node` on that major; `"type": "module"`, ESM only; strict TypeScript.
- **Detect**: "ESM"; read `engines`, `devEngines`, `tsconfig.json`.
- **Migrate**: a CommonJS published package moving to ESM is a **breaking change** for its users (major changeset, a migration note in the README). Raising `engines` is breaking too.

### Vite+ tooling

- **Target**: Vite+ only — `vp check`, `vp test` (imports from `vite-plus/test`), `vp pack` or the framework build. No ESLint, Prettier, Biome, Jest, standalone Vitest, tsup, husky, lint-staged.
- **Migrate**: `vp migrate` when coming from another toolchain, then remove the old tools and their config files; rewrite `from "vitest"` → `from "vite-plus/test"`, `from "vite"` → `from "vite-plus"` (the base lint rule enforces it).

### quality-gate

- **Target**: `"quality-gate": "github:maximeshr/quality-gate#<latest tag>"`; `allowBuilds: { quality-gate: false }` in `pnpm-workspace.yaml`; `@vitest/coverage-v8` at `vp toolchain vitest`.
- **Detect**: "quality-gate dev dependency", "on the latest release" (warning), "allowBuilds denies quality-gate", "@vitest/coverage-v8".
- **Migrate**: `vp add -D "quality-gate@github:maximeshr/quality-gate#<tag>" @vitest/coverage-v8@<version>`. Upgrading: read the tag's release notes; bump the dependency and every workflow `@tag` together.

### Base config

- **Target**: `vite.config.ts` spreads `qualityGate` (or `defineQualityGate({ ignore, presets })`, `presets` = the Ultracite presets of the project's frameworks: `astro`, `next`, `playwright`, `react`, `svelte`, `vue`); no local `lint` / `fmt` rules or style; only structure (pack entries, test paths, timeouts, generated or hand-written content to ignore).
- **Detect**: "uses quality-gate/vite", "no local fmt style".
- **Migrate**: drop the local blocks; reformat in a **separate commit** (`style: format with the OKQ base config`); run `vp exec quality-gate report` and fix what it finds **in the project**: unexport internals, delete dead code, declare in `knip.json` what Knip cannot see (tools used by name, assets loaded by path, manual scripts). A stricter local rule worth keeping belongs in the base (quality-gate pull request).
- **Watch**: generated types (Astro, Next.js): `setup` in the report and the generator in `prepare`; never remove a public export (`@alias`).

### Lint rules

- **Target**: the project passes the base [lint rules](../../okq-stack/references/conventions.md#lint-rules) (Ultracite, anti-slop, comment rules) with no local override and no suppression without `-- reason`. No `eslint-plugin-*`, `oxlint-plugin-anti-slop` or vendored anti-slop copy in the project: quality-gate ships them.
- **Detect**: `vp check` on quality-gate ≥ the release that added them, with the project on the same vite-plus version as quality-gate (an older bundled Oxlint stops on "Rule '…' not found"); `rg -n "oxlint-disable|eslint-disable|@ts-ignore|@ts-expect-error" src tests`.
- **Migrate**, after upgrading quality-gate, in this order, one commit each: (1) `vp check --fix` (`style: apply the base lint fixes`); (2) `vp lint --fix --fix-suggestions`, reviewed line by line (`refactor: apply the base lint suggestions`); (3) hand fixes, grouped by rule (`refactor: <rule family>`); (4) comments: delete what restates the code, shorten the rest to the _why_. Run `vp test` after each step.
- **Watch**: a published package keeps its public API (an anti-slop rename of an exported symbol is breaking: keep it, or `@alias` + changeset); `vitest/consistent-test-it` renames `test` → `it` without the import; `require-readable-spacing` and `sort-keys` touch many lines, keep them in the mechanical commits; a rule that is wrong for every project is a quality-gate pull request, not a suppression.

### Scripts

- **Target**: every project `prepare: "vp config"` (+ the type generator when needed); libraries `build`, `dev`, `prepublishOnly`, `check:version: quality-gate check-version`, `check:package: quality-gate check-package`, `release: vp pack && vp run check:package && changeset publish`; apps their framework's `build` / `dev`. No `check`, `test`, `changeset`, `version-packages` scripts.
- **Detect**: "prepare script runs vp config", "no … script".
- **Migrate**: replace copied `scripts/check-*.mjs` with the CLI commands and drop `publint`, `@arethetypeswrong/cli`; remove scripts that only duplicate another (keep what CI, hosting or hooks call); `version-packages` goes with the release workflow switch.

### Git hooks

- **Target**: `.vite-hooks/pre-commit` `vp staged`; `commit-msg` `vp exec quality-gate commitlint --edit "$1"`; `pre-push` full `vp check`, `vp test`, `vp exec quality-gate deadcode`, `vp exec quality-gate duplication` (or the project's own verify script plus Knip and jscpd).
- **Detect**: the three ".vite-hooks/…" checks.
- **Migrate**: from husky: move each hook's commands to `.vite-hooks/<hook>`, lint-staged rules into the `staged` block (the base already has one), `prepare` → `vp config`, then remove husky. Check `git config core.hooksPath` = `.vite-hooks/_`.

### Dependency policy

- **Target**: `minimumReleaseAge: 7200` (5 days) with exact, dated exclusions (security fix or already shipped); `overrides` for `vite@*` / `vitest@*` on vite-plus's versions, plus any security override with its advisory id.
- **Migrate**: from `20160` (14 days): set `7200` and drop every exclusion older than 5 days; carry over only those still younger. Never exclude a whole package by name.

## CI and releases

### CI workflows

- **Target**: `ci.yml` (the project's jobs) on `pull_request: [canary]` and `push: [canary, main]`; `quality.yml` with `report` (+ `setup` when types are generated, `node-version` when not on Node 26) and `changesets` (`RELEASE_DEPLOY_KEY`), same triggers; actions pinned (by tag, or by SHA where the project already does).
- **Detect**: "quality.yml calls reusable-report and reusable-changesets", "workflows pin the same quality-gate tag".
- **Migrate**: before the branch flow exists, `quality.yml` runs `report` only on every pull request; the `canary` triggers and the `changesets` job come with the branch flow.

### Changesets

- **Target**: `@changesets/cli`; `.changeset/config.json` `baseBranch: "canary"`; private apps `privatePackages: { version: true, tag: true }`; a `version` field in `package.json`.
- **Detect**: ".changeset/config.json baseBranch is canary".
- **Migrate**: `vp add -D @changesets/cli`; the config; the README section on releases.

### Release workflow

- **Target**: `release.yml` (that exact name) calling `reusable-release-pr.yml` on `canary` and `reusable-release.yml` on `main` (`publish: true` for npm packages, `false` for apps); a tag for the current production version.
- **Detect**: "release.yml calls the shared release workflows"; `gh api repos/<repo>/tags`.
- **Migrate**: replace `changesets/action` or a custom release; create a baseline tag `v<version>` on the production commit when none exists.

### npm publishing

- **Target**: trusted publishing — publisher = `maximeshr/<repo>`, workflow `release.yml`, no environment; provenance on every version.
- **Detect**: Maxime runs `npm trust list <package>` (needs his npm login with 2FA); provenance: `npm view <package> --json dist.attestations`.
- **Migrate**: `npm trust github <package> --file release.yml --repo maximeshr/<repo> --allow-publish` (Maxime).

### Dependabot

- **Target**: `.github/dependabot.yml` with every ecosystem on `target-branch: canary`, `cooldown.default-days: 5`, groups (vite-plus with vite/vitest/oxlint/ultracite, minor-and-patch); `audit.yml` weekly `pnpm audit --audit-level=high`.
- **Detect**: "Dependabot targets canary", "5-day cooldown", "pnpm minimumReleaseAge is 5 days".
- **Migrate**: ecosystem `npm` for pnpm; retarget or close open Dependabot pull requests on `main`.

## Repository settings

Applied by `scripts/apply-settings.sh` (dry run first), in this order on purpose.

### Branches

- **Target**: `canary` and `main` exist; default branch `canary`.
- **Detect**: "default branch is canary", "branch … exists".
- **Migrate**: create `canary` from `main`; switch the default branch **after** the rulesets exist.

### Merging

- **Target**: merge commits only (squash and rebase disabled); auto-delete head branches on.
- **Detect**: "merge commits allowed", "squash merging disabled", "rebase merging disabled".

### Rulesets

- **Target**: **Protect canary** and **Protect main**, explicit targets; deletion, non-fast-forward, pull request (0 approvals, merge commits only), required checks (the project's CI jobs + `report / report` + `changesets / changeset`), bypass: deploy keys. No classic branch protection, no `~DEFAULT_BRANCH` ruleset.
- **Detect**: the per-branch checks, "no ruleset targets ~DEFAULT_BRANCH", "bypass actor is DeployKey".
- **Migrate**: `apply-settings.sh --checks "<CI job names>"`, with `--no-gate-checks` until `quality.yml` runs both jobs; delete the old protection afterwards; test a direct push to `canary` (must be rejected).

### Automation and security

- **Target**: Actions may create pull requests (token read-only by default); a write deploy key with `RELEASE_DEPLOY_KEY` in the Actions and Dependabot secrets; Dependabot alerts and security updates on.
- **Detect**: the "GitHub: automation and secrets" checks.

## Hosting

- **Target** (apps): production deploys from `main`, previews from `canary`; the install command uses the pinned pnpm.
- **Detect**: Vercel `vercel api /v9/projects/<id>?teamId=<team>` → `link.productionBranch`; `vercel.json` `installCommand`.
- **Migrate**: `installCommand: pnpm install --frozen-lockfile` (Vercel reads `devEngines`); keep the production branch on `main`; validate a build change with `vercel deploy` from the branch before it reaches `canary`; check `canary` is live after each merge.

## Documentation

### README

- **Target**: Standard Readme — title, badges, short and long description, table of contents (100+ lines), Install, Usage, extra sections, API (libraries), Contributing, License; American English; from `node_modules/quality-gate/templates/README.<library|cli|app>.md`.
- **Detect**: the "README …" checks.
- **Migrate**: **reorganize, do not rewrite**: move existing sections under their Standard Readme parent (demoted one level), check line by line that nothing is lost, list every deliberate rewrite in the pull request; fix statements that became false (e.g. "after npm publish").

### CONTRIBUTING and LICENSE

- **Target**: `CONTRIBUTING.md` from `templates/CONTRIBUTING.md` (without the guidance comment); public projects MIT with `LICENSE`; private projects "© Maxime Sahroui. All rights reserved."
- **Detect**: "CONTRIBUTING.md present", "LICENSE present".

### Agent skills

- **Target**: `.claude/settings.json` declares the `okq` marketplace (`maximeshr/quality-gate`, `ref` = the quality-gate dependency tag) and enables `okq@okq`; pull request bodies carry the `merge-risk` assessment.
- **Detect**: "Claude Code enables the okq plugin", "okq plugin pinned to the quality-gate tag".
- **Migrate**: add the settings block from the okq-stack conventions ("Agent skills"); replace a vendored copy of `merge-risk` or a project-local comment skill by the plugin; replace a criticality scale in `AGENTS.md` by the merge-risk rule. Bump the `ref` with every quality-gate upgrade.

### Agent instructions

- **Target**: `AGENTS.md` / `CLAUDE.md` describe the same flow: `canary` default, pull requests into `canary`, changesets, merge commits only, who merges into `main`, the project's checks.
- **Migrate**: update every statement the migration made false (package manager, commands, branch names, lockfile name).
