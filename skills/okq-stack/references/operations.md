# Operations

Day-to-day work in a project that is on the OKQ stack. For bringing a project onto the stack, use the `align-project` skill.

## Contents

- [Start a change](#start-a-change)
- [Commit](#commit)
- [Open a pull request](#open-a-pull-request)
- [Add a changeset](#add-a-changeset)
- [Merge into canary](#merge-into-canary)
- [Release](#release)
- [Dependabot pull requests](#dependabot-pull-requests)
- [Check a project locally](#check-a-project-locally)
- [Prove that a refactor changes nothing](#prove-that-a-refactor-changes-nothing)

## Start a change

Always fetch first and check you are on the right, up-to-date branch: a branch cut from a stale `canary` ends in conflicts with work merged meanwhile (quality-gate#30 conflicted with the v0.7.0 release).

```sh
git fetch origin
git status -sb                              # which branch, ahead/behind, uncommitted work
git switch canary && git pull --ff-only
git switch -c <type>/<short-name>          # feat/, fix/, docs/, chore/, ci/, build/, refactor/, test/
vp install                                  # after any change to package.json or the lockfile
```

Resuming work on an existing branch: `git fetch origin`, then `git log --oneline HEAD..origin/canary`; if `canary` moved, rebase (or merge) onto it **before** adding commits. Fetch again before each push.

Rebasing the branch onto `canary` later is fine (`git rebase origin/canary`, then `git push --force-with-lease` on your own branch).

## Commit

Conventional Commits, present tense, lowercase subject: `fix: keep the focus ring on the search field`. The hooks run on their own:

- pre-commit: secretlint and `vp check --fix --deny-warnings` on the staged files;
- commit-msg: commitlint;
- pre-push: full `vp check`, tests, the comment ratchet, Knip, jscpd (plus the project's own, e.g. okq.me's `vp run verify`).

A hook failure is information: fix the cause, do not `--no-verify`.

## Open a pull request

- Into `canary`, always. `gh pr create --base canary`.
- One change per pull request, small enough to review.
- Body: what changed and why, the proof (commands and their real output), what was not tested, the `merge-risk` assessment, and "Internal pull request (`<type>`): no changeset" when it applies.
- The quality report is posted as a comment on the pull request (one comment, updated on each push). A red gate is fixed in the project; the base configuration only changes for a rule that is wrong everywhere (a quality-gate pull request).

## Add a changeset

User-facing change → `vp exec changeset`, pick the bump, write the summary for a user of the project (at least 20 characters): what changes for them, not what the code does.

- `patch`: a fix, a refactor shipped as a release, a dependency update that reaches users.
- `minor`: a new feature (or a breaking change while the version is `0.x`).
- `major`: a breaking change for users (removed or renamed public API, new minimum Node.js).

Internal pull requests need none: titles `ci`, `build`, `test`, `docs`, `chore` (not `chore(deps)`). A changeset added anyway is still checked.

## Merge into canary

- `gh pr merge <n> --merge --delete-branch` — merge commits only.
- Wait for the required checks (the project's CI jobs, `report / report`, `changesets / changeset`). A pull request created before an upgrade may need `gh pr update-branch <n>`.
- Agents merge into `canary` only at low merge risk (`merge-risk` skill), when the project allows it, with checks green. Otherwise leave it to Maxime.
- After the merge: check the CI, Quality and Release runs on `canary` (`gh run list --branch canary`).

## Release

Each push to `canary` with a pending changeset opens or updates the release pull request `Release <package>@<version>` (`canary` → `main`), with the full notes.

- **Maxime merges it**, with a merge commit (the only option). That publishes (npm) or deploys production (apps).
- Then check: the Release run on `main`, the tag `vX.Y.Z`, the GitHub release, `canary` equal to `main` again (`git rev-parse origin/main origin/canary`), and the package or the site.
- If `canary` had moved, a `main` → `canary` sync pull request opens: merge it with a merge commit (its CI run waits for approval; its required checks already passed on the same commit).
- Internal-only changes never open a release pull request. To ship them (an app), open `canary` → `main` by hand; the release run finds nothing to version and the deploy still happens.

## Dependabot pull requests

They target `canary`. Internal titles (`build(deps-dev)`, `ci(deps)`) need no changeset; `chore(deps)` gets a `patch` changeset written for it. Merge when the checks are green; a group with a major bump deserves a look at the release notes first.

## Check a project locally

```sh
vp check                              # format, lint, types
vp test
vp exec quality-gate report           # every gate, writes quality-report.md (add --setup "vp run astro sync" when types are generated)
```

Conformity with the stack (settings and files): the `align-project` skill's `scripts/audit.sh`.

## Prove that a refactor changes nothing

For component or style refactors: build before and after, then compare, for every element of every affected page, the computed styles and the geometry, at 1280 px and 390 px, light and dark (Playwright). Validate the comparison on the same build twice first (no false positives); compare timer-driven pages with JavaScript off. Report the pages and the result in the pull request.
