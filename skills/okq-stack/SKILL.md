---
name: okq-stack
description: Maxime's OKQ stack and working practices — the target state of every project under ~/okq (github.com/maximeshr). Vite+ (`vp`) and pnpm, the shared quality-gate (base config, git hooks, one quality report per pull request), the canary → main branch flow (canary default, merge commits only, rulesets), Changesets releases, Dependabot, American English docs and Standard Readme. Use it for any work inside an OKQ project — starting a change, committing, opening or merging a pull request, writing a changeset, releasing, handling a Dependabot pull request, fixing a release or branch incident (canary missing, sync pull request, release pull request not opening) — and whenever the user asks how things are done in his stack ("c'est quoi ma convention pour…", "comment je release overrepo ?"). To move a project onto the stack, use the align-project skill.
---

# OKQ stack

This is how Maxime's projects are built and how work happens in them. The rules came from real incidents; `references/conventions.md` gives each rule with its reason. Read it when a rule matters to what you are about to do: merge commits only, the internal-PR exemption and "never merge into main" are what keeps releases working.

## The stack at a glance

| Area            | Choice                                                                                                                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tooling         | Vite+ (`vp check`, `vp test`, `vp pack` / framework build), config in `vite.config.ts`                                                                                                                          |
| Package manager | pnpm, version pinned by quality-gate in `devEngines`                                                                                                                                                            |
| Language        | ESM, strict TypeScript; Node.js LTS for development, `engines` at the real minimum                                                                                                                              |
| Quality         | [quality-gate](https://github.com/maximeshr/quality-gate): base config, git hooks, CI report (format, lint, types, tests, Knip, jscpd ≤ 5 %, secretlint, Semgrep, build)                                        |
| Lint rules      | Ultracite Oxlint presets, Dillon Mulroy's anti-slop (Ultracite's vendored copy), comment rules (`eslint-plugin-no-comment-slop` + quality-gate's `comments` plugin): see `references/conventions.md#lint-rules` |
| Branches        | `canary` default, `main` production, merge commits only, two rulesets                                                                                                                                           |
| Releases        | Changesets; `canary` → `main` release pull request with full notes; npm trusted publishing or app deploy                                                                                                        |
| Dependencies    | Dependabot on `canary`, 5-day cooldown (pnpm `minimumReleaseAge` too), weekly `pnpm audit`                                                                                                                      |
| Docs            | American English; Standard Readme; shared `CONTRIBUTING.md`                                                                                                                                                     |
| Agent skills    | the `okq` Claude Code plugin from quality-gate, pinned in `.claude/settings.json`                                                                                                                               |

## References

| Need                                                                                                                | Read                                                                 |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| The rules and why                                                                                                   | `references/conventions.md`                                          |
| Lint findings: what the rule sets want, comments, suppressions, fixing                                              | `references/conventions.md#lint-rules`                               |
| Day-to-day: change, commit, pull request, changeset, merge, release, Dependabot                                     | `references/operations.md`                                           |
| Something went wrong (canary missing, sync pull request, release pull request not opening, hooks in CI, commitlint) | `references/troubleshooting.md`                                      |
| Tooling details (CLI, reusable workflows, templates)                                                                | the [quality-gate README](https://github.com/maximeshr/quality-gate) |
| Bringing a project onto the stack, auditing conformity, upgrading quality-gate                                      | the `align-project` skill                                            |

Projects live in `~/okq/<dir>`, on GitHub as `maximeshr/<name>` (`okq-me` is `okq.me`, `ergy-coach` is `ergy.coach`): check with `git -C ~/okq/<dir> remote get-url origin`.

## Practices

- **Fetch first, check the branch.** Before any work and before each push: `git fetch origin`, right branch, up to date with `origin/canary`.
- **Every change goes through a pull request into `canary`.** Branch from `canary`, Conventional Commits, one change per pull request.
- **Merge commits only.** `gh pr merge <n> --merge`. Never squash or rebase-merge; rebasing your own branch onto `canary` is fine.
- **Never merge into `main`.** The release pull request publishes or deploys production: Maxime merges it. Agents merge into `canary` only at low `merge-risk`, when the project allows it.
- **A useful changeset for every user-facing change**; internal pull requests (`ci`, `build`, `test`, `docs`, `chore`, not `chore(deps)`) need none.
- **Write code the lint rules accept**: comments say why, never what; no suppression without `-- reason`; no type assertion without `// SAFETY:`; fix findings, do not silence them.
- **Fix the project, not the base.** A red gate is fixed where it fails; a base rule only changes when it is wrong for every project, through a quality-gate pull request and release.
- **Never break users of a published package**; prove that a refactor changes nothing when it touches rendering.
- **Proof, not claims.** Pull requests list the commands run and their real output; report only checks you saw pass, say what was not tested, correct a wrong earlier statement explicitly.
- **Plan, then work in phases with checkpoints**; ask before outward-facing or irreversible actions (publishing, deleting, force-pushing shared branches, hosting changes).
- **American English** in everything written to repositories; talk to Maxime in French.
