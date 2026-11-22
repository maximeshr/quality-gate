# Troubleshooting

Day-to-day incidents in OKQ projects, symptom first. Each one happened (2026-11) and produced a rule in `conventions.md`.

## Contents

- [Branches and merging](#branches-and-merging)
- [Releases](#releases)
- [CI and GitHub Actions](#ci-and-github-actions)
- [Git hooks](#git-hooks)

## Branches and merging

**`canary` disappeared after the release pull request was merged.**
Cause: `delete_branch_on_merge` deleted `canary` as the head branch of a `canary` → `main` pull request. Fix: make `canary` the default branch (GitHub never deletes it) and protect it. Nothing is lost: `canary` was merged into `main`; recreate it from `main`.

**After a release, `canary` was not fast-forwarded and a `main` → `canary` sync pull request opened; merging it brought back an already released changeset.**
Cause: the release pull request was merged with **squash**, so `main` no longer contained the `canary` commits. Fix: merge commits only (repository setting and `allowed_merge_methods: ["merge"]` in both rulesets). If it happened: merge the sync pull request, then delete the resurrected `.changeset/*.md` in a pull request before the next release (the release pull request closes itself when nothing is pending).

## Releases

**The release pull request was never opened: `GitHub Actions is not permitted to create or approve pull requests`.**
Fix: repository setting _Allow GitHub Actions to create and approve pull requests_ (`can_approve_pull_request_reviews=true`), with the default token kept read-only.

**The `main` → `canary` sync pull request shows a CI run waiting for approval (`action_required`).**
Cause: pull requests opened by `github-actions[bot]` do not run workflows without approval. Not blocking: the required checks already passed on the same commit (push run). Merge it with a merge commit.

**A failed run on the release pull request (`pull_request` event, 0 jobs).**
Cause: the release pull request is opened by the bot. Fix: CI `pull_request` only on `branches: [canary]`; the release pull request's head is `canary`, already checked on push.

**npm trusted publishing.**
The trusted publisher is the **caller** workflow `release.yml`, not `reusable-release.yml`. Keep the file name `release.yml` and keep it the only publishing workflow. Check with `npm trust list <package>` (Maxime, logged in with 2FA).

## CI and GitHub Actions

**The project's git hooks ran inside the release job (full pre-push on the bot's push).**
Cause: `vp install` runs `prepare` → `vp config`, which installs the hooks. Fix (quality-gate ≥ 0.3.1): bot jobs set `VP_GIT_HOOKS=0`.

**A pull request created before a quality-gate upgrade still runs the old version.**
Its branch has the old `package.json` and workflow tags. Fix: `gh pr update-branch <n>` (merges the base into the branch, allowed with merge commits only).

**A macOS job stayed queued and was cancelled.**
No runner was assigned (`runner_name` empty). Not a code failure: rerun the failed job (`gh run rerun <id> --failed`).

## Git hooks

**`subject must not be sentence-case`.**
commitlint (Conventional Commits): the subject starts in lowercase (`feat: add the README templates`, not `feat: README templates`).

**The hooks were not installed in a fresh clone.**
`core.hooksPath` is empty until `vp config` runs (from `prepare` on `vp install`). Run `vp config`.
