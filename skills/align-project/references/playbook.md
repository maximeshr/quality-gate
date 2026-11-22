# Playbook

The order in which `elements.md` is applied to one project. Proven on overrepo, create-adr, stable-error and okq.me (2026-11). Do one project at a time, phase by phase; each phase ends green before the next starts.

## Contents

- [Phase 0: audit and plan](#phase-0-audit-and-plan)
- [Phase 1: tooling (pull request into the current default branch)](#phase-1-tooling)
- [Phase 2: repository settings](#phase-2-repository-settings)
- [Phase 3: branch and release flow (pull request into canary)](#phase-3-branch-and-release-flow)
- [Phase 4: README and CONTRIBUTING](#phase-4-readme-and-contributing)
- [Phase 5: verify and hand over](#phase-5-verify-and-hand-over)
- [Upgrading quality-gate in a migrated project](#upgrading-quality-gate)
- [Templates for pull request and ticket text](#templates)

## Phase 0: audit and plan

1. `scripts/audit.sh maximeshr/<repo> ~/okq/<dir>`: the list of gaps.
2. Read the project: package manager, framework (generated types?), build, deploy target (npm, Vercel), CI jobs (their names become required checks), existing protection, open pull requests (Dependabot pull requests on `main` need retargeting), local clone state (unpushed work?).
3. Write the plan in the conversation (or a ticket, see [templates](#templates)) and **get Maxime's go**. Flag what changes for users (public API, rendering, deploy).

## Phase 1: tooling

Pull request into the **current** default branch (`main` before the migration), title `chore: adopt the OKQ stack` (internal: no changeset).

- **bun → pnpm** when needed: `devEngines.packageManager` = pnpm (same version as quality-gate), `pnpm-workspace.yaml` (catalog for vite / vite-plus, overrides for `vite@*` and `vitest@*`, `peerDependencyRules`, `minimumReleaseAge: 7200` with only the exclusions still younger than 5 days), delete `bun.lock`, `bunfig.toml`, `trustedDependencies`. Compare resolved versions with the old lockfile; declare any package the code imports without declaring it. Update every bun reference (CI audits, `vercel.json`, Dependabot ecosystem `npm`, docs, `.claude/settings.json`).
- **quality-gate**: `vp add -D "quality-gate@github:maximeshr/quality-gate#<latest tag>" @vitest/coverage-v8@<vp toolchain vitest>`, `allowBuilds: { quality-gate: false }`.
- **`vite.config.ts`**: spread `qualityGate` (or `defineQualityGate({ ignore, presets })` for generated or hand-written content and framework presets); drop local `lint` / `fmt`; keep only structure (pack entries, test paths, timeouts).
- **Lint rules**: fix the findings of the base rule sets in the project (elements.md, "Lint rules"): auto fixes, reviewed suggestion fixes, then hand fixes, one commit each.
- **Formatting** in its **own commit** (`style: format with the OKQ base config`) when the base style differs, so the review stays readable.
- **Scripts baseline** (quality-gate README, "Scripts"); `prepare: vp config` (plus the type generator when the framework needs it, e.g. `astro sync`).
- **Hooks**: `.vite-hooks/pre-commit` (`vp staged`), `commit-msg` (`vp exec quality-gate commitlint --edit "$1"`), `pre-push` (full check, tests, `deadcode`, `duplication`).
- **`quality.yml`** with the `report` job only, `pull_request:` without branch filter (the branch flow comes in phase 3); `setup:` when types are generated.
- Run `vp exec quality-gate report` and **fix the project, not the base**. Each fix is reviewable: unexported internals, deleted dead code, declared Knip entries for what Knip cannot see. Never remove a public export.
- Proof in the pull request: the commands and their real output.

Merge when green. On `main` with a classic protection requiring a review, the first merges need Maxime's admin rights; phase 2 removes that.

## Phase 2: repository settings

Dry run first, then apply:

```sh
scripts/apply-settings.sh maximeshr/<repo> --checks "<current CI job names>" --no-gate-checks
scripts/apply-settings.sh maximeshr/<repo> --checks "<current CI job names>" --no-gate-checks --apply
```

It sets merge commits only, creates `canary` from `main`, allows Actions to open pull requests, turns on Dependabot alerts and security updates, creates the release deploy key and its two secrets, creates **Protect canary** / **Protect main**, then moves the default branch. Then by hand:

- Remove classic protection or `~DEFAULT_BRANCH` rulesets the script reports.
- A direct push to `canary` must be rejected: `git commit --allow-empty --no-verify -m "test: direct push" && git push origin HEAD:canary` (then `git reset --hard origin/canary`).
- Hosting: the production branch stays `main` (Vercel: `link.productionBranch`).
- Local clone: `git fetch --prune`, `git switch canary`, `git remote set-head origin -a`.

`--no-gate-checks` keeps `report / report` and `changesets / changeset` out until phase 3 adds `quality.yml` with both jobs; rerun without it after phase 3 is green.

## Phase 3: branch and release flow

Pull request into `canary`, title `ci: adopt the canary release flow` (internal).

- `ci.yml`: `pull_request.branches: [canary]`, `push.branches: [canary, main]`.
- `quality.yml`: same triggers, `report` and `changesets` jobs (`RELEASE_DEPLOY_KEY` secret).
- `release.yml`: the shared caller (`reusable-release-pr.yml` on `canary`, `reusable-release.yml` on `main`), `publish: true` for npm packages (file name `release.yml`: npm trusted publisher), `publish: false` for apps; `node-version` when the project is not on Node 26.
- Changesets: `.changeset/config.json` `baseBranch: canary`; private apps `privatePackages: { version: true, tag: true }`; drop `version-packages`.
- `dependabot.yml`: `target-branch: canary` on every ecosystem, 5-day cooldown; weekly `audit.yml` (pnpm audit) when on pnpm 12.
- Baseline tag on the current production commit when the project has none (`v<version>`), so the first release notes start there.
- npm packages: Maxime confirms the trusted publisher (`npm trust list <package>`: repository, `release.yml`, no environment).

After merge: CI, Quality and Release green on `canary`; no release pull request until a changeset is pending. Rerun `apply-settings.sh` without `--no-gate-checks` to require `report / report` and `changesets / changeset`.

## Phase 4: README and CONTRIBUTING

Pull request into `canary`, title `docs: follow Standard Readme and add CONTRIBUTING.md` (internal).

- Start from `node_modules/quality-gate/templates/README.<library|cli|app>.md`: Standard Readme order; required: title, short description, table of contents from 100 lines, Install, Usage, Contributing, License.
- **Reorganize, do not rewrite**: move existing sections under their Standard Readme parent (demoted one level). Check line by line that nothing was lost; list every deliberate rewrite in the pull request.
- `CONTRIBUTING.md` from `templates/CONTRIBUTING.md` (without its guidance comment).
- License: MIT with `LICENSE` for public projects; private projects: "© Maxime Sahroui. All rights reserved."

## Phase 5: verify and hand over

- `scripts/audit.sh` passes (the only accepted warning: a quality-gate tag one release behind).
- The project's tickets get a progress comment (what is done, what is left); close what is fully done.
- What only Maxime does: merging the first release pull request into `main` (npm publish or production deploy). Then check: release workflow, tag, GitHub release, `canary` still exists and equals `main`, production healthy.
- Never report a check you did not see pass; list what was not tested.

## Upgrading quality-gate

One pull request into `canary`, `chore: align with quality-gate <tag>` (internal): the dependency tag, every workflow `uses: …@<tag>`, `devEngines.packageManager` when quality-gate moved pnpm, and whatever the release notes ask (a local rule now in the base, a new input). Run the report locally first.

## Templates

**Ticket** (one per project, American English, executable by an agent):

```markdown
## Context

<why, the OKQ convention link, the current state with facts (default branch, protection, package manager)>

## Steps

1. <phase-level steps with the exact commands>

## Acceptance criteria

- [ ] <observable checks: audit passes, direct push rejected, release pull request opens, …>
```

**Pull request body**: what changed and why (bullets), proof (commands and their real output), what was not tested, criticality, and "Internal pull request (`<type>`): no changeset" when it applies.
