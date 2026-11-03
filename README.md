# quality-gate

Shared quality gate for OKQ projects: one Vite+ (`vp`) base configuration, one CLI, and reusable GitHub Actions workflows that post a quality report on every pull request and run the `canary` → `main` release flow.

## Rule

The base configuration only changes when a rule is wrong for every project. A project that fails the gate is fixed in that project, not by loosening the base. A project may only add what its structure needs: build entries, test paths and timeouts, generated or vendored folders to ignore, and Knip entries Knip cannot find on its own.

## Gates

| Gate                           | Tool                                                              | Config                                                |
| ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Format + lint + types          | `vp check --deny-warnings` (Oxfmt, type-aware Oxlint, TypeScript) | `quality-gate/vite`                                   |
| Tests + coverage               | `vp test --coverage`                                              | `quality-gate/vite`                                   |
| Dead code, unused dependencies | Knip                                                              | zero-config (`knip.json` only for structural entries) |
| Duplication                    | jscpd, 5 % threshold on `src/`                                    | `configs/jscpd.json`                                  |
| Secrets                        | secretlint, recommended preset                                    | `configs/secretlintrc.json`                           |
| SAST                           | Semgrep `p/typescript` + `p/nodejs` (CI only)                     | —                                                     |
| Build                          | `vp run build`, when the project has a `build` script             | the project                                           |

Commit messages follow Conventional Commits (`configs/commitlint.config.js`). The report runs every gate even when one fails, and lists each failure with its output.

## Adopt it in a project

### 1. Install

```sh
vp add -D "quality-gate@github:maximeshr/quality-gate#v0.2.0" @vitest/coverage-v8@<vitest version>
```

- `@vitest/coverage-v8` must be the Vitest version bundled with vite-plus (`vp toolchain vitest`): the base config collects coverage, and Vitest loads the provider from the project.
- quality-gate's `prepare` script only installs its own git hooks. pnpm refuses to install a git dependency that wants to run it, so declare it in `pnpm-workspace.yaml`:

  ```yaml
  allowBuilds:
    # quality-gate's `prepare` only installs its own git hooks: never run it here.
    quality-gate: false
  ```

The tools (Knip, jscpd, secretlint, commitlint) are dependencies of quality-gate: the project does not add them.

### 2. `vite.config.ts`

Spread the base config, then add only what the project's structure needs:

```ts
import { qualityGate } from "quality-gate/vite";
import { defineConfig } from "vite-plus";

export default defineConfig({
  ...qualityGate,
  pack: { entry: ["src/index.ts"], dts: { generator: "tsgo" } },
  test: {
    ...qualityGate.test,
    include: ["tests/**/*.test.ts"],
  },
});
```

Remove the project's own `lint` and `fmt` blocks: they come from the base. Use `defineQualityGate({ ignore: [".astro/**"] })` instead of `qualityGate` to ignore generated folders.

### 3. Git hooks

Add `"prepare": "vp config"` to the `package.json` scripts: `vp install` then installs the hooks from `.vite-hooks/`.

```sh
# .vite-hooks/pre-commit
vp staged
# .vite-hooks/commit-msg
vp exec quality-gate commitlint --edit "$1"
# .vite-hooks/pre-push
vp check --deny-warnings
vp test
vp exec quality-gate deadcode
vp exec quality-gate duplication
```

`vp staged` runs secretlint and `vp check --fix --deny-warnings` on the staged files (the `staged` block of the base config). Hooks can be bypassed (`--no-verify`): CI runs the same gates.

### 4. CI

`.github/workflows/quality.yml`, with the project on the `canary` → `main` flow:

```yaml
name: Quality
on:
  pull_request:
    branches: [canary]
  push:
    branches: [canary, main]
permissions:
  contents: read
jobs:
  report:
    uses: maximeshr/quality-gate/.github/workflows/reusable-report.yml@v0.2.0
    permissions:
      contents: read
      pull-requests: write
  changesets:
    uses: maximeshr/quality-gate/.github/workflows/reusable-changesets.yml@v0.2.0
    permissions:
      contents: read
    secrets:
      RELEASE_DEPLOY_KEY: ${{ secrets.RELEASE_DEPLOY_KEY }}
```

A project still on `main` only (before adopting the branch flow) keeps `pull_request:` without a branch filter and only the `report` job.

### 5. First report

Run `vp exec quality-gate report` locally (it writes `quality-report.md`), then fix what it finds in the project. Typical first findings: exports only used in their own file (Knip), dead code, a missing `@vitest/coverage-v8`.

### Upgrade quality-gate

Bump the same tag in `package.json` and in the workflow `uses:` lines, then run `vp install`.

## Branches and releases

- `canary` is the default branch: every pull request targets it. `main` is production. When `canary` does not exist, create it from `main`.
- The only pull request into `main` is the release pull request, merged with a **merge commit** (never squash or rebase), so both branches keep the same commits.

### Changesets

- Every pull request into `canary` adds a useful changeset (`vp exec changeset`): a bump and a summary of at least 20 characters written for a user.
- **Internal pull requests (CI, tooling) are exempt.** They are recognized by their Conventional Commits title: `ci`, `build`, `test` and `chore`, except `chore(deps)` (a runtime dependency update reaches users; `chore(deps-dev)` does not). A changeset they add anyway is still checked.
- Dependabot pull requests that are not internal get a `patch` changeset written for them.

### Release

1. On every push to `canary`, `reusable-release-pr.yml` opens or updates the `canary` → `main` pull request, titled `Release <package>@<next version>`, with the full release notes: pending changesets grouped by bump, pull requests and commits.
2. On `main`, `reusable-release.yml` versions the package, updates `CHANGELOG.md`, publishes to npm when `publish: true` (with provenance), tags `vX.Y.Z`, creates the GitHub release with the same notes, and fast-forwards `canary` (or opens a `main` → `canary` pull request when `canary` has moved).

The caller, `.github/workflows/release.yml`:

```yaml
name: Release
on:
  push:
    branches: [canary, main]
concurrency: release-${{ github.ref }}
permissions:
  contents: read
jobs:
  release-pr:
    if: github.ref_name == 'canary'
    uses: maximeshr/quality-gate/.github/workflows/reusable-release-pr.yml@v0.2.0
    permissions:
      contents: read
      pull-requests: write
  release:
    if: github.ref_name == 'main'
    uses: maximeshr/quality-gate/.github/workflows/reusable-release.yml@v0.2.0
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    with:
      publish: true # false for apps and private packages
    secrets:
      RELEASE_DEPLOY_KEY: ${{ secrets.RELEASE_DEPLOY_KEY }}
```

### Repository settings

| Setting                     | Value                                                                                                                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default branch              | `canary`                                                                                                                                                                                                                                                       |
| Ruleset (public repos only) | targets `refs/heads/canary` and `refs/heads/main` explicitly (not `~DEFAULT_BRANCH`): deletion, non-fast-forward, pull request, required checks `report / report` and `changesets / changeset`. Bypass actor: deploy keys.                                     |
| Actions                     | _Allow GitHub Actions to create and approve pull requests_ on (`gh api -X PUT repos/<owner>/<repo>/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true`), or the release pull request cannot be opened. |
| Release deploy key          | an ed25519 key with write access; its private key in the `RELEASE_DEPLOY_KEY` secret for **Actions and Dependabot** (`gh secret set RELEASE_DEPLOY_KEY --app dependabot`).                                                                                     |
| Dependabot                  | `target-branch: canary`, 14-day cooldown; alerts and security updates on.                                                                                                                                                                                      |
| Merge                       | _Automatically delete head branches_ can stay on: GitHub never deletes the default branch, and the ruleset protects `main`.                                                                                                                                    |

Private repositories on GitHub Free cannot have rulesets: no branch protection there for now.

## CLI

```text
quality-gate report [file]                 run every gate, write a Markdown report (default quality-report.md)
quality-gate secrets [files...]            secretlint with the base config
quality-gate deadcode                      knip
quality-gate duplication                   jscpd with the base config
quality-gate commitlint [args...]          commitlint with the conventional config (e.g. --edit "$1")
quality-gate check-changesets [--base ref] [--title "PR title"]
                                           fail if the branch adds no useful changeset (internal PRs exempt)
quality-gate release-notes [--from ref] [--to ref] [--repo owner/name] [--output file]
```

## Develop quality-gate

`vp install` installs the hooks. quality-gate runs on its own base config, hooks and workflows (`ci.yml`, `release.yml`), and is released by the same `canary` → `main` flow: every change that reaches projects carries a changeset.
