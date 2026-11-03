# quality-gate

## 0.2.0

### Minor Changes

- f71e744: Internal pull requests no longer need a changeset: `check-changesets --title` (and `reusable-changesets.yml`) exempts Conventional Commits titles `ci`, `build`, `test` and `chore`, except `chore(deps)`, since runtime dependency updates reach users. The README now lists what a project must add: `@vitest/coverage-v8` at the bundled Vitest version, and `allowBuilds: { quality-gate: false }`.

## 0.1.1

### Patch Changes

- c23596d: CI runs pull request checks only on pull requests into `canary`. The release pull request into `main` no longer gets a failed run: its head is `canary`, already checked on push.
- 431f90b: Dependabot keeps the npm dependencies and GitHub Actions up to date on `canary`, with the same 14-day cooldown as pnpm, and a weekly `pnpm audit` covers the security alerts Dependabot cannot raise on a pnpm 12 lockfile.

## 0.1.0

### Minor Changes

- b509646: First version of the OKQ quality gate: a Vite+ base config (`quality-gate/vite`), a `quality-gate` CLI (report, secrets, dead code, duplication, commitlint, changeset check, release notes), and reusable workflows for the pull request report, the changeset check, the canary → main release pull request and the release.
