---
"quality-gate": patch
---

Safer releases. The release pull request is closed when `canary` has no pending changeset anymore, so an already released changeset cannot be released twice. The bot's commits and pushes skip the project's git hooks. The README documents two rulesets: `main` only allows merge commits, since a squashed release pull request cannot fast-forward `canary`.
