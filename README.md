# quality-gate

[![CI](https://github.com/maximeshr/quality-gate/actions/workflows/ci.yml/badge.svg?branch=canary)](https://github.com/maximeshr/quality-gate/actions/workflows/ci.yml)

Shared quality gate for OKQ projects: one Vite+ (`vp`) base configuration, one CLI, and reusable GitHub Actions workflows that post a quality report on every pull request and run the `canary` → `main` release flow.

It is the shared stack of the OKQ projects: every project spreads the same base configuration, runs the same gates locally (git hooks) and in CI (one report comment per pull request), and releases through the same `canary` → `main` flow.

## Table of contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Branches and releases](#branches-and-releases)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)

## Background

### Rule

The base configuration only changes when a rule is wrong for every project. A project that fails the gate is fixed in that project, not by loosening the base. A project may only add what its structure needs: build entries, test paths and timeouts, generated or vendored folders to ignore, and Knip entries Knip cannot find on its own.

### Gates

| Gate                           | Tool                                                                                                        | Config                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Format + lint + types          | `vp check --deny-warnings` (Oxfmt, type-aware Oxlint with `vite-plus/prefer-vite-plus-imports`, TypeScript) | `quality-gate/vite`                                   |
| Tests + coverage               | `vp test --coverage`                                                                                        | `quality-gate/vite`                                   |
| Dead code, unused dependencies | Knip                                                                                                        | zero-config (`knip.json` only for structural entries) |
| Duplication                    | jscpd on `src/` (Markdown excluded): fails above 5 % duplicated, not on each clone                          | `configs/jscpd.json`                                  |
| Secrets                        | secretlint, recommended preset                                                                              | `configs/secretlintrc.json`                           |
| SAST                           | Semgrep `p/typescript` + `p/nodejs` (CI only)                                                               | —                                                     |
| Build                          | `vp run build`, when the project has a `build` script                                                       | the project                                           |

Commit messages follow Conventional Commits (`configs/commitlint.config.js`). The report runs every gate even when one fails, and lists each failure with its output.

## Install

```sh
vp add -D "quality-gate@github:maximeshr/quality-gate#v0.4.0" @vitest/coverage-v8@<vitest version>
```

- `@vitest/coverage-v8` must be the Vitest version bundled with vite-plus (`vp toolchain vitest`): the base config collects coverage, and Vitest loads the provider from the project.
- quality-gate's `prepare` script only installs its own git hooks. pnpm refuses to install a git dependency that wants to run it, so declare it in `pnpm-workspace.yaml`:

  ```yaml
  allowBuilds:
    # quality-gate's `prepare` only installs its own git hooks: never run it here.
    quality-gate: false
  ```

The tools (Knip, jscpd, secretlint, commitlint) are dependencies of quality-gate: the project does not add them.

## Usage

### `vite.config.ts`

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

### Git hooks

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

### CI

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
    uses: maximeshr/quality-gate/.github/workflows/reusable-report.yml@v0.4.0
    permissions:
      contents: read
      pull-requests: write
  changesets:
    uses: maximeshr/quality-gate/.github/workflows/reusable-changesets.yml@v0.4.0
    permissions:
      contents: read
    secrets:
      RELEASE_DEPLOY_KEY: ${{ secrets.RELEASE_DEPLOY_KEY }}
```

A project still on `main` only (before adopting the branch flow) keeps `pull_request:` without a branch filter and only the `report` job.

When `vp check` needs generated files that a fresh checkout does not have (Astro content types, Next.js route types), pass a `setup` command to the report; it runs first and shows as its own gate:

```yaml
report:
  uses: maximeshr/quality-gate/.github/workflows/reusable-report.yml@v0.4.0
  with:
    setup: vp run astro sync
```

Locally: `vp exec quality-gate report --setup "vp run astro sync"`.

### Scripts

Keep `package.json` scripts to this baseline. `vp check` and `vp test` are built-ins: do not wrap them in `check` or `test` scripts, and run Changesets with `vp exec changeset`.

| Project       | Scripts                                                                                                                                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every project | `"prepare": "vp config"`, plus `build` and `dev` when it builds                                                                                                                                                                                             |
| Published lib | `"build": "vp pack"`, `"dev": "vp pack --watch"`, `"prepublishOnly": "vp run build"`, `"check:version": "quality-gate check-version"`, `"check:package": "quality-gate check-package"`, `"release": "vp pack && vp run check:package && changeset publish"` |
| App           | `build` and `dev` from its framework (`astro build`, `astro dev`, ...)                                                                                                                                                                                      |

`check-version` fails when the `package.json` version was edited by hand (neither published nor in `CHANGELOG.md`); run it in CI. `check-package` packs the project, then runs publint (strict) and attw on the tarball npm receives (`--profile esm-only` by default); `release` runs it before publishing. Both replace the `scripts/check-*.mjs` copies: drop them, and drop `publint` and `@arethetypeswrong/cli` from the dev dependencies.

### First report

Run `vp exec quality-gate report` locally (it writes `quality-report.md`), then fix what it finds in the project. Typical first findings: exports only used in their own file (Knip), dead code, a missing `@vitest/coverage-v8`.

### README and CONTRIBUTING

READMEs follow [Standard Readme](https://github.com/RichardLitt/standard-readme): its section order, its required sections (title, short description, table of contents from 100 lines, install, usage, contributing, license), in American English. Start from the template for the project type, and copy the shared contributing guide:

| Project type      | Template                                        |
| ----------------- | ----------------------------------------------- |
| Published library | `templates/README.library.md`                   |
| Command-line tool | `templates/README.cli.md`                       |
| App or website    | `templates/README.app.md`                       |
| Every project     | `templates/CONTRIBUTING.md` → `CONTRIBUTING.md` |

They ship with the package: `node_modules/quality-gate/templates/`.

### Upgrade quality-gate

Bump the same tag in `package.json` and in the workflow `uses:` lines, then run `vp install`.

## Branches and releases

- `canary` is the default branch: every pull request targets it. `main` is production. When `canary` does not exist, create it from `main`.
- The only pull request into `main` is the release pull request, merged with a **merge commit**, so both branches keep the same commits. Every pull request is merged with a merge commit, on `canary` too: squash and rebase merging are disabled, and the rulesets only allow merge commits. A squash or a rebase rewrites commits, so `main` would no longer contain the `canary` commits: the release could not fast-forward `canary`, and a consumed changeset would come back with the sync.

### Changesets

- Every pull request into `canary` adds a useful changeset (`vp exec changeset`): a bump and a summary of at least 20 characters written for a user.
- **Internal pull requests (CI, tooling, docs) are exempt.** They are recognized by their Conventional Commits title: `ci`, `build`, `test`, `docs` and `chore`, except `chore(deps)` (a runtime dependency update reaches users; `chore(deps-dev)` does not). A changeset they add anyway is still checked.
- Dependabot pull requests that are not internal get a `patch` changeset written for them.

### Release

1. On every push to `canary`, `reusable-release-pr.yml` opens or updates the `canary` → `main` pull request, titled `Release <package>@<next version>`, with the full release notes: pending changesets grouped by bump, pull requests and commits.
2. On `main`, `reusable-release.yml` versions the package and updates `CHANGELOG.md`, commits, runs `publish-script` when `publish: true` (default `vp run release`: build, `check:package`, `changeset publish`), and only then pushes the release commit: when publishing fails, `main` keeps its changesets and a rerun releases again. It then tags `vX.Y.Z`, creates the GitHub release with the same notes, and fast-forwards `canary` (or opens a `main` → `canary` pull request when `canary` has moved).

The `main` → `canary` sync pull request is opened by `github-actions[bot]`, so GitHub holds its CI run for approval. Its required checks already passed on the same commit (the push run on `main`): merge it with a merge commit. The bot's commits and pushes skip the project's git hooks (`VP_GIT_HOOKS=0`). When `canary` has no pending changeset anymore, the release pull request is closed.

npm publishing uses **trusted publishing** (OIDC, no npm token): on npmjs.com, the package's trusted publisher is the repository with the workflow file `release.yml`. npm checks the **caller** file, not `reusable-release.yml`, so keep the caller named `release.yml` and keep it the only workflow that publishes.

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
    uses: maximeshr/quality-gate/.github/workflows/reusable-release-pr.yml@v0.4.0
    permissions:
      contents: read
      pull-requests: write
  release:
    if: github.ref_name == 'main'
    uses: maximeshr/quality-gate/.github/workflows/reusable-release.yml@v0.4.0
    permissions:
      contents: write
      pull-requests: write
      id-token: write
    with:
      publish: true # false for apps and private packages
      # publish-script: vp run release (default)
    secrets:
      RELEASE_DEPLOY_KEY: ${{ secrets.RELEASE_DEPLOY_KEY }}
```

### Repository settings

| Setting              | Value                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default branch       | `canary`                                                                                                                                                                                                                                                                                                                                                                                                |
| Rulesets             | two rulesets with explicit targets (not `~DEFAULT_BRANCH`). Both: deletion, non-fast-forward, pull request with **no required approval** (solo maintainer: the pull request stays mandatory), required checks `report / report` and `changesets / changeset`, bypass actor deploy keys. **Protect canary** (`refs/heads/canary`) and **Protect main** (`refs/heads/main`) allow **merge commits only**. |
| Merge button         | **merge commits only**: squash and rebase merging are disabled (`gh api -X PATCH repos/<owner>/<repo> -F allow_merge_commit=true -F allow_squash_merge=false -F allow_rebase_merge=false`). Both rewrite commits, so `main` would no longer contain the `canary` commits.                                                                                                                               |
| Actions              | _Allow GitHub Actions to create and approve pull requests_ on (`gh api -X PUT repos/<owner>/<repo>/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true`), or the release pull request cannot be opened.                                                                                                                                          |
| Release deploy key   | an ed25519 key with write access; its private key in the `RELEASE_DEPLOY_KEY` secret for **Actions and Dependabot** (`gh secret set RELEASE_DEPLOY_KEY --app dependabot`).                                                                                                                                                                                                                              |
| Dependabot           | `target-branch: canary`, 14-day cooldown; alerts and security updates on.                                                                                                                                                                                                                                                                                                                               |
| npm (published libs) | trusted publisher: this repository, workflow `release.yml`, no environment.                                                                                                                                                                                                                                                                                                                             |
| Merge                | _Automatically delete head branches_ can stay on: GitHub never deletes the default branch, and the ruleset protects `main`.                                                                                                                                                                                                                                                                             |

These settings apply to public and private repositories alike (rulesets on private repositories need GitHub Pro).

## API

### CLI

```text
quality-gate report [file] [--setup "cmd"] run every gate, write a Markdown report (default quality-report.md); --setup runs first
quality-gate secrets [files...]            secretlint with the base config
quality-gate deadcode                      knip
quality-gate duplication                   jscpd with the base config
quality-gate commitlint [args...]          commitlint with the conventional config (e.g. --edit "$1")
quality-gate check-changesets [--base ref] [--title "PR title"]
                                           fail if the branch adds no useful changeset (internal PRs exempt)
quality-gate check-version                 fail if the package.json version was edited by hand
quality-gate check-package [--profile p]   pack, then publint (strict) and attw (default profile esm-only)
quality-gate release-notes [--from ref] [--to ref] [--repo owner/name] [--output file]
```

### `quality-gate/vite`

| Export                          | What it is                                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `qualityGate`                   | The base Vite+ config: `lint` (type-aware, type check, `vite-plus/prefer-vite-plus-imports`), `fmt`, `test` (coverage), `staged`. Spread it into `defineConfig`. |
| `defineQualityGate({ ignore })` | The base config with extra ignored folders for lint and fmt (generated or vendored only).                                                                        |

### Reusable workflows

| Workflow                  | Inputs                                                                                   | Secrets                                      |
| ------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| `reusable-report.yml`     | `node-version` (default `26`), `setup` (command run before the gates)                    | —                                            |
| `reusable-changesets.yml` | `node-version`                                                                           | `RELEASE_DEPLOY_KEY` (Dependabot changesets) |
| `reusable-release-pr.yml` | `node-version`                                                                           | —                                            |
| `reusable-release.yml`    | `node-version`, `publish` (default `false`), `publish-script` (default `vp run release`) | `RELEASE_DEPLOY_KEY` (required)              |

## Contributing

Pull requests target `canary`. See [CONTRIBUTING.md](CONTRIBUTING.md). `vp install` installs the hooks. quality-gate runs on its own base config, hooks and workflows (`ci.yml`, `release.yml`), and is released by the same `canary` → `main` flow: every change that reaches projects carries a changeset.

## License

[MIT](LICENSE) © Maxime Sahroui
