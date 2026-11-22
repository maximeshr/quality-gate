# Migration pitfalls

What breaks when a project moves onto the OKQ stack, symptom first. Each one happened on a real migration (2026-11). Day-to-day incidents (releases, sync pull requests, hooks in CI) are in `../okq-stack/references/troubleshooting.md`.

## Contents

- [Branches and merging](#branches-and-merging)
- [Releases](#releases)
- [pnpm and dependencies](#pnpm-and-dependencies)
- [Vercel](#vercel)
- [Quality gates](#quality-gates)

## Branches and merging

**Switching the default branch removed the protection of `main`.**
Cause: an existing ruleset targeted `~DEFAULT_BRANCH`, so it followed the default branch to `canary`. Fix: rulesets with explicit targets (`refs/heads/canary`, `refs/heads/main`), created **before** switching the default branch.

**Merging into `main` needed admin rights.**
Cause: classic branch protection with one required review, on a solo repository. Fix: rulesets with 0 required approvals (the pull request stays mandatory), then delete the classic protection.

## Releases

**The first release notes of a project list its whole history.**
Cause: no tag yet, so the notes start at the root commit. Fix: tag the current production commit (`v<current version>`) before the first release.

## pnpm and dependencies

**`ERR_PNPM_GIT_DEP_PREPARE_NOT_ALLOWED` when adding quality-gate.**
quality-gate's `prepare` only installs its own hooks. Fix: `allowBuilds: { quality-gate: false }` in `pnpm-workspace.yaml` (bun: `trustedDependencies: []` already blocks it).

**`Cannot find module '<pkg>'` after moving from bun to pnpm.**
Cause: the code imported a package it never declared; bun hoisted it, pnpm is strict. Fix: declare it, at the version already installed (one copy). Seen with `shiki` (imported by the Astro config).

**`MISSING DEPENDENCY @vitest/coverage-v8`.**
The base config collects coverage. Add `@vitest/coverage-v8` at the Vitest version bundled with vite-plus (`vp toolchain vitest`).

**`ERR_PNPM_NO_MATURE_MATCHING_VERSION`.**
The 5-day cooldown (`minimumReleaseAge: 7200`) blocks a fresh version, sometimes by hours. Pick the previous version, or exclude an exact version with its reason and age-out date (security fix, or already shipped). Name patterns cannot carry a version (`ERR_PNPM_INVALID_MINIMUM_RELEASE_AGE_EXCLUDE`). The package manager itself is exempt.

**`npm view` fails with `EBADDEVENGINES` inside a project.**
`devEngines` pins pnpm, so npm refuses. Run `npm view` from another directory.

**Catalogs (`catalog:`) fail with bun.**
bun catalogs need a `workspaces` field; a single-package bun project pins versions directly. pnpm catalogs work in `pnpm-workspace.yaml`.

## Vercel

**`npx pnpm@x install` fails with `EBADDEVENGINES`.**
npx goes through npm. Vercel reads the pnpm version from `devEngines` itself: use `pnpm install --frozen-lockfile`.

**Moving the GitHub default branch to `canary`.**
Vercel stores its production branch separately (`link.productionBranch`); check it stays `main`: `vercel api /v9/projects/<id>?teamId=<team>`.

**Validate a build change before it reaches `canary`.**
`vercel deploy --scope <team>` from the branch builds a preview with the branch's `vercel.json`.

## Quality gates

**`vp check` fails in CI (type errors) but passes locally.**
Cause: generated types (Astro content collections, Next.js routes) are missing on a fresh checkout. Fix: `setup: vp run astro sync` in the report (quality-gate ≥ 0.4.0); keep the generator in `prepare` too (`vp config && astro sync`), or the first pre-commit of a fresh clone or worktree fails.

**jscpd failed on a single clone despite the 5 % threshold.**
Cause: jscpd 5's `--exit-code` fails on any clone. Fixed in quality-gate 0.4.0 (threshold applied; Markdown excluded).

**Knip reports a tool, a font, or a manual script as unused.**
Things used by name or path (tools launched by quality-gate, `@fontsource/*` loaded by path, a script run by hand) are invisible to Knip. Declare them in the project's `knip.json` (`ignoreDependencies`, `entry`); an explicit `entry` replaces the detected ones, so list the main entry too.

**Knip reports a duplicate export that is the public API.**
Never remove a public export to please Knip. Mark the intentional alias `/** @alias */`.
