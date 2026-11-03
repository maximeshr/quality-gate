# quality-gate

## 0.4.0

### Minor Changes

- 25cc61e: The base lint config enforces `vite-plus/prefer-vite-plus-imports`: import from `vite-plus` and `vite-plus/test`, never from `vite` or `vitest` directly. The report takes an optional setup command (`report --setup "<cmd>"`, `setup` input of `reusable-report.yml`) that runs before the gates, for frameworks whose types are generated (`vp run astro sync`). pnpm moves to 12.16.1.

### Patch Changes

- 8aac592: The duplication gate now fails only when more than 5 % of the code is duplicated, as the configuration intends, instead of on every clone found. Markdown and MDX files (blog posts, docs) are no longer scanned: code samples in prose are not project code.

## 0.3.1

### Patch Changes

- b1dfcd7: Safer releases. The release pull request is closed when `canary` has no pending changeset anymore, so an already released changeset cannot be released twice. The bot's commits and pushes skip the project's git hooks. The README documents two rulesets: `main` only allows merge commits, since a squashed release pull request cannot fast-forward `canary`.

## 0.3.0

### Minor Changes

- 65ccf42: Release hardening. `reusable-release.yml` takes a `publish-script` input (default `vp run release`, so libraries keep their build and package checks before publishing), publishes before pushing the release commit (a failed publish can be rerun), and no longer fails when the tag already exists. New CLI commands `check-version` and `check-package` replace the `scripts/check-*.mjs` copies in each library. `docs` pull requests are now internal: no changeset required. The README documents the scripts baseline, npm trusted publishing, and protection for every repository.

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
