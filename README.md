# quality-gate

Shared quality gate for OKQ projects: one Vite+ (`vp`) base configuration, one CLI, and reusable GitHub Actions workflows that post a quality report on every pull request and run the `canary` → `main` release flow.

## Rule

The base configuration only changes when a rule is wrong for every project. A project that fails the gate is fixed in that project, not by loosening the base. A project may only add what its structure needs: build entries, generated or vendored folders to ignore, and Knip entries Knip cannot find on its own.

## Gates

| Gate                           | Tool                                                              | Config                                                |
| ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------- |
| Format + lint + types          | `vp check --deny-warnings` (Oxfmt, type-aware Oxlint, TypeScript) | `quality-gate/vite`                                   |
| Tests + coverage               | `vp test --coverage`                                              | `quality-gate/vite`                                   |
| Dead code, unused dependencies | Knip                                                              | zero-config (`knip.json` only for structural entries) |
| Duplication                    | jscpd, 5 % threshold on `src/`                                    | `configs/jscpd.json`                                  |
| Secrets                        | secretlint, recommended preset                                    | `configs/secretlintrc.json`                           |
| SAST                           | Semgrep `p/typescript` + `p/nodejs` (CI)                          | —                                                     |
| Build                          | `vp run build`, when the project has a `build` script             | the project                                           |

Commit messages follow Conventional Commits (`configs/commitlint.config.js`).

## Use it in a project

```sh
vp add -D "quality-gate@github:maximeshr/quality-gate#v0.1.0"
```

`vite.config.ts`:

```ts
import { defineConfig } from "vite-plus";
import { qualityGate } from "quality-gate/vite";

export default defineConfig({
  ...qualityGate,
  pack: { entry: ["src/index.ts"], dts: { generator: "tsgo" } },
});
```

Use `defineQualityGate({ ignore: [".astro/**"] })` instead of `qualityGate` to ignore generated folders.

Git hooks (`.vite-hooks/`, installed by `vp config` from the `prepare` script):

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

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
    branches: [canary]
  push:
    branches: [canary, main]
permissions:
  contents: read
jobs:
  report:
    uses: maximeshr/quality-gate/.github/workflows/reusable-report.yml@v0.1.0
    permissions:
      contents: read
      pull-requests: write
  changesets:
    uses: maximeshr/quality-gate/.github/workflows/reusable-changesets.yml@v0.1.0
    permissions:
      contents: read
    secrets:
      RELEASE_DEPLOY_KEY: ${{ secrets.RELEASE_DEPLOY_KEY }}
```

Run the report locally: `vp exec quality-gate report`.

## Branches and releases

- `canary` is the default branch: every pull request targets it. `main` is production.
- Public repositories protect both branches with a ruleset (no deletion, no force-push, pull request and CI required). The only bypass actor is the release deploy key.
- Every pull request into `canary` adds a useful changeset (`vp exec changeset`): a bump and a summary of at least 20 characters written for a user. Dependabot pull requests get one automatically.
- On every push to `canary`, `reusable-release-pr.yml` opens or updates the `canary` → `main` pull request with the full release notes: pending changesets grouped by bump, pull requests and commits.
- Merge it with a **merge commit**. On `main`, `reusable-release.yml` versions the package, updates `CHANGELOG.md`, publishes to npm when `publish: true`, tags `vX.Y.Z`, creates the GitHub release with the same notes, and fast-forwards `canary` (or opens a `main` → `canary` pull request when `canary` has moved).

The release needs a write deploy key: its private key in the `RELEASE_DEPLOY_KEY` secret (Actions and Dependabot), and the key added as a bypass actor of the ruleset. See `.github/workflows/release.yml` for the caller.
