---
name: align-project
description: Move one of Maxime's projects (under ~/okq, github.com/maximeshr) onto his OKQ stack, element by element — package manager to pnpm, Vite+ tooling, quality-gate base config and hooks, CI and the quality report, Changesets and the shared release workflows, npm trusted publishing, Dependabot, branches canary/main with rulesets and merge commits only, repository settings, hosting, README/CONTRIBUTING/LICENSE. Use it whenever the user wants to migrate, align, bring up to date or audit a project against his stack ("aligne casquette-app", "passe ergy.coach sur la stack", "is kannard.org conform?"), upgrade quality-gate in a project, bootstrap a new project on the stack, or write a migration ticket — even when he only names the project. The target state itself is defined by the okq-stack skill.
---

# Align a project with the OKQ stack

The target state is the OKQ stack: read `../okq-stack/SKILL.md` and `../okq-stack/references/conventions.md` first, they say what "aligned" means and why. This skill gets a project there, one element at a time, without breaking it or its users.

## Parts

| Part                                                                                   | Use                                                                                    |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `references/elements.md`                                                               | Every element of a project: target, how to detect a gap, how to migrate, what to watch |
| `references/playbook.md`                                                               | The order (phases), the checkpoints, the pull request and ticket templates             |
| `references/pitfalls.md`                                                               | What broke on real migrations, by symptom                                              |
| `scripts/audit.sh <owner/repo> <local-path>`                                           | Read-only conformity check (~60 checks, settings and files); exit 1 on any gap         |
| `scripts/apply-settings.sh <owner/repo> [--checks "a,b"] [--no-gate-checks] [--apply]` | GitHub settings in the safe order; dry run unless `--apply`                            |

Find the repository behind a directory with `git -C ~/okq/<dir> remote get-url origin` (`okq-me` is `okq.me`, `ergy-coach` is `ergy.coach`).

## Workflow

1. **Audit.** Run `scripts/audit.sh`. Read the project too: package manager, framework (generated types?), how it builds and deploys (npm, Vercel), CI job names, existing protection, open pull requests, the local clone (unpushed work, current branch). Map every gap to its element in `references/elements.md`.
2. **Plan, then stop.** Present the plan to Maxime in French: the elements to change, grouped into the phases of `references/playbook.md`, what changes for users (public API, rendering, deploy), the decisions he must take (each with a recommendation), and the checkpoints. Wait for his go. Write tickets when he wants them (American English, executable by another agent).
3. **Migrate phase by phase** (playbook): tooling → repository settings → branch and release flow → documentation. Each phase is a pull request (or a settings run) that ends green before the next starts. Inside a phase, migrate element by element and check each one.
4. **Fix the project, not the base.** When the quality report fails, the project changes. When a base rule is wrong for every project, propose a quality-gate change instead of a local override.
5. **Verify.** `scripts/audit.sh` passes; CI, Quality and Release are green on `canary`; a direct push to `canary` is rejected; hosting still deploys production from `main`. Post a progress comment on the project's ticket.
6. **Hand over** what only Maxime does: merging the first release pull request (npm publish or production deploy), npm trusted publisher checks, decisions left open. List what was not tested.

## Rules that matter during a migration

- **Read before changing.** Run the audit and read the files; never assume a project matches another.
- **Order of repository settings**: `canary` and both rulesets exist before the default branch moves (a `~DEFAULT_BRANCH` ruleset would otherwise leave `main` unprotected). `apply-settings.sh` does it in that order.
- **One element, one reason.** Separate commits for mechanical changes (formatting) and real ones, so the review stays readable.
- **Prove what you claim**: diff resolved versions when switching package manager; validate build changes on a preview deploy before they reach `canary`; prove "no visual change" for refactors that touch rendering (computed styles and geometry, before and after); check README reorganizations line by line.
- **Never break users of a published package**: no removed export, no raised `engines`, no format change without a major changeset and a migration note.
- **Merge commits only; never merge into `main`; ask before outward-facing or irreversible actions** (publishing, making a repository public, deleting, hosting changes).
- **Language**: everything written to the repository in American English; talk to Maxime in French.
