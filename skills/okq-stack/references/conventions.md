# OKQ conventions

Every rule here was decided by Maxime and applied on the OKQ repositories (2026-11). Tooling details live in the [quality-gate README](https://github.com/maximeshr/quality-gate); this file says what the rules are and why.

## Contents

- [Language](#language)
- [Stack](#stack)
- [Quality rule](#quality-rule)
- [Lint rules](#lint-rules)
- [Branches and merging](#branches-and-merging)
- [Changesets and releases](#changesets-and-releases)
- [Repository settings](#repository-settings)
- [READMEs](#readmes)
- [Agent skills](#agent-skills)
- [Working rules for agents](#working-rules-for-agents)

## Language

Documentation, tickets, pull request descriptions, changesets, commit messages and skill content are written in **American English**. Maxime talks in French in the conversation; answer him in French.

## Stack

| Area            | Rule                                                                                                                                                                                                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tooling         | Vite+ (`vp`) only: `vp check` (Oxfmt, type-aware Oxlint with the [lint rules](#lint-rules), TypeScript), `vp test` (Vitest), `vp pack` or the framework build. All config in `vite.config.ts`. No ESLint, Prettier, husky, lint-staged.                                                                                 |
| Package manager | pnpm, the version pinned by quality-gate, in `devEngines.packageManager` (`onFail: "download"`); no `packageManager` field. The package manager is exempt from the 5-day cooldown.                                                                                                                                      |
| Node            | Develop on the current LTS (`devEngines.runtime`, `.nvmrc`); `engines.node` is the minimum the runtime dependencies need; `@types/node` follows that major. Apps follow their host's major (okq.me: Node 24 on Vercel).                                                                                                 |
| Language        | ESM only (`"type": "module"`), strict TypeScript.                                                                                                                                                                                                                                                                       |
| Quality         | `quality-gate` dev dependency pinned to a git tag (`github:maximeshr/quality-gate#vX.Y.Z`), `allowBuilds: { quality-gate: false }`, `@vitest/coverage-v8` at the Vitest version bundled with vite-plus.                                                                                                                 |
| Dependencies    | No version younger than 5 days (`minimumReleaseAge: 7200`, Dependabot `cooldown.default-days: 5`), one window for every package, except security fixes or versions already shipped, each excluded as an exact version with its reason and age-out date. vite-plus, `oxlint`, `@oxlint/*` and `ultracite` move together. |
| Publishing      | npm packages with provenance through trusted publishing (no token).                                                                                                                                                                                                                                                     |
| Agent skills    | The `okq` Claude Code plugin, shipped by quality-gate (`okq-stack`, `align-project`, `merge-risk`, `delete-comments`), enabled in `.claude/settings.json` and pinned to the same tag as the quality-gate dependency. See [Agent skills](#agent-skills).                                                                 |

## Quality rule

- The base configuration only changes when a rule is wrong for **every** project. A project that fails the gate is **fixed in the project**, never by loosening the base.
- A project only adds what its structure needs: build entries, test paths and timeouts, generated or hand-written content to ignore, Knip entries Knip cannot find, a `setup` step for generated types.
- Duplication budget: jscpd fails above **5 %** duplicated code (Markdown excluded). Under it, clones are allowed but worth removing when a refactor is cheap.
- Never break users of a published package: keep the public API (mark an intentional duplicate export `@alias` instead of removing it).
- A refactor that can change rendering proves it does not: compare computed styles and geometry, before and after, on every affected page, at desktop and mobile widths, light and dark.

## Lint rules

Agents write most of the code, so the base config rejects what agents get wrong most: loose types, escape hatches and comment noise. Three rule sets, all at `error`, all shipped by quality-gate (`src/vite.js`), nothing to install in the project:

| Rule set                                                                                | Where it comes from                                                                                                                                                               | Set up                                                                                                                                                              |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Ultracite](https://www.ultracite.ai/providers/oxlint) Oxlint presets `core` + `vitest` | npm `ultracite`, imported as `ultracite/oxlint/<preset>`                                                                                                                          | in the base; a framework project adds its preset with `defineQualityGate({ presets: ["react", "next"] })` (`astro`, `next`, `playwright`, `react`, `svelte`, `vue`) |
| [anti-slop](https://github.com/dmmulroy/anti-slop), Dillon Mulroy's Oxlint plugin       | `ultracite/oxlint/anti-slop`, the copy Ultracite vendors                                                                                                                          | in the base, extended last (it turns off the core rules it fights)                                                                                                  |
| Comment rules                                                                           | [`eslint-plugin-no-comment-slop`](https://github.com/jantimon/eslint-plugin-no-comment-slop) (its 12 rules) + quality-gate's own `comments` plugin (`quality-gate/oxlint-plugin`) | in the base, loaded as Oxlint JS plugins from absolute paths                                                                                                        |

- **anti-slop has no official npm package**: its README says to vendor it. Use Ultracite's vendored copy through quality-gate; never install `oxlint-plugin-anti-slop` from npm (not Dillon Mulroy's).
- **Comments** follow pstack's `/no-comments` (comment-sicko) line: a comment says _why_, never _what_. Kept: license headers, public API docs (JSDoc), constraints forced by an external dependency or protocol, issue links. Rejected: comments that restate the code (`comments/no-restating-comment`), more than 3 lines, trailing comments, banners, jargon, em dashes, `//` on exports.
- **Suppressions**: `// oxlint-disable-next-line <rule> -- <why the rule is wrong here>`; without `-- reason` it fails (`comments/require-suppression-reason`). `@ts-ignore` is banned; `@ts-expect-error` needs a description. Suppress only a rule that is wrong at that line, never to get hard code through; otherwise rename, extract or retype.
- **Type assertions** need a `// SAFETY: <checked invariant>` comment right before them (anti-slop); prefer a type guard or parsing at the boundary.
- **Fixing findings**: `vp check --fix`, then `vp lint --fix --fix-suggestions` (blank lines, `toStrictEqual`, ...), review the diff (`vitest/consistent-test-it` renames `test` → `it` without fixing the import), fix the rest by hand. Mechanical fixes in their own commit.
- Ultracite, `oxlint` and `@oxlint/plugins` follow the Oxlint that vite-plus bundles (a newer Ultracite can name rules an older Oxlint lacks: "Rule '…' not found"). A project upgrading quality-gate also moves to the vite-plus version quality-gate uses, in the same pull request.

## Branches and merging

| Rule                                                                                                                                                                                                                                                         | Why                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `canary` is the default branch; `main` is production. If `canary` does not exist, create it from `main`.                                                                                                                                                     | GitHub never deletes the default branch: `delete_branch_on_merge` once deleted `canary`.                                                                          |
| **Merge commits only**: squash and rebase merging are disabled, in the repository settings and in both rulesets. Rebasing your own branch onto `canary` before merging is fine.                                                                              | A squash or a rebase rewrites commits: `main` stops containing the `canary` commits, the release cannot fast-forward `canary`, and consumed changesets come back. |
| Two rulesets with explicit targets: **Protect canary**, **Protect main**: no deletion, no force-push, pull request with **0 required approvals**, required checks (the project's CI jobs + `report / report` + `changesets / changeset`), deploy key bypass. | `~DEFAULT_BRANCH` targets move with the default branch; required reviews block a solo maintainer.                                                                 |
| Public and private repositories get the same protection (GitHub Pro).                                                                                                                                                                                        | —                                                                                                                                                                 |

## Changesets and releases

- Every pull request into `canary` adds a useful changeset: the right bump, a summary of at least 20 characters written for a user.
- **Internal pull requests are exempt**, recognized by their Conventional Commits title: `ci`, `build`, `test`, `docs`, `chore`, except `chore(deps)` (a runtime dependency update reaches users).
- Releases are automatic: each push to `canary` opens or updates the `canary` → `main` release pull request with the full notes; merging it versions, updates `CHANGELOG.md`, publishes (packages), tags, creates the GitHub release, and brings `main` back into `canary`. Never edit a version or push a tag by hand.
- Internal-only changes do not open a release pull request; to ship them (apps), open a `canary` → `main` pull request by hand.
- A project without a tag gets a baseline tag on its production commit before its first release.

## Repository settings

Applied by the `align-project` skill (`scripts/apply-settings.sh`), checked by its `scripts/audit.sh`:

- Default branch `canary`; the two rulesets; merge commits only.
- _Allow GitHub Actions to create and approve pull requests_ on; default workflow token read-only.
- Release deploy key (ed25519, write) in the `RELEASE_DEPLOY_KEY` secret for **Actions and Dependabot**.
- Dependabot: alerts and security updates on; `target-branch: canary`, 5-day cooldown, grouped updates; a weekly `pnpm audit` (Dependabot raises no alerts on a pnpm 12 lockfile).
- npm packages: trusted publisher = the repository, workflow `release.yml`, no environment.
- Hosts keep `main` as production (Vercel `link.productionBranch`).

## READMEs

- [Standard Readme](https://github.com/RichardLitt/standard-readme): its section order and required sections (title, short description, table of contents from 100 lines, Install, Usage, Contributing, License).
- Templates per project type in quality-gate (`templates/README.library.md`, `README.cli.md`, `README.app.md`) and a shared `templates/CONTRIBUTING.md`.
- When aligning an existing README: reorganize, do not rewrite; nothing is lost; deliberate rewrites are listed in the pull request.
- License: MIT with a `LICENSE` file for public projects; private projects (okq.me): "© Maxime Sahroui. All rights reserved."
- Checked by this skill's audit, not by quality-gate.

## Agent skills

quality-gate is also a Claude Code plugin marketplace: its `okq` plugin ships the skills every OKQ project uses. Each project enables it in `.claude/settings.json`, pinned to the tag of its quality-gate dependency, so agents (local or cloud) get the same skills as the gates:

```json
{
  "extraKnownMarketplaces": {
    "okq": { "source": { "source": "github", "repo": "maximeshr/quality-gate", "ref": "vX.Y.Z" } }
  },
  "enabledPlugins": { "okq@okq": true }
}
```

| Skill             | Use                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `okq-stack`       | these conventions and the day-to-day operations                                                            |
| `align-project`   | bring a project onto the stack, audit it, upgrade quality-gate                                             |
| `merge-risk`      | assess a pull request before merging (vendored from [Warp](https://www.warp.dev/merge-risk), MIT)          |
| `delete-comments` | audit comments: delete tautologies and stale ones, move decisions into ADRs, file issues for excused hacks |

- Every pull request body carries the `merge-risk` assessment.
- An agent merges into `canary` only at **low** merge risk, when the project allows agent merges, after reviewing its diff, with every required check green. Medium or high: Maxime merges.
- The skills move with quality-gate: upgrading quality-gate also moves the plugin `ref` to the same tag.

## Working rules for agents

- **Fetch and check the branch before working**: `git fetch origin`, then confirm the current branch, that it is based on the latest `origin/canary` and has no unexpected local changes; rebase or merge `canary` before adding commits, and fetch again before pushing. Why: a branch built on a stale `canary` conflicted with a release merged meanwhile.
- **Never merge into `main`**: releasing (npm publish, production deploy) is Maxime's decision. Agents merge into `canary` only at low merge risk, when the project allows it (see [Agent skills](#agent-skills)).
- Plan first, get Maxime's go, then execute phase by phase; stop at the checkpoints he sets.
- Ask before outward-facing or hard-to-reverse actions not covered by the plan (deleting repositories, publishing, force-pushing).
- Only report a check you saw pass; say what was not tested; correct a wrong earlier statement explicitly.
- Bypassing hooks (`--no-verify`) is for emergencies only; never to get your own change through.
