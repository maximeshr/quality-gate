## Release notes

### Patch changes

- Safer releases. The release pull request is closed when `canary` has no pending changeset anymore, so an already released changeset cannot be released twice. The bot's commits and pushes skip the project's git hooks. The README documents two rulesets: `main` only allows merge commits, since a squashed release pull request cannot fast-forward `canary`.

### Pull requests

- #8 feat: harden the release and add check-version and check-package (maximeshr)
- #12 fix: keep releases consistent after a squashed release pull request (maximeshr)
- #13 docs: merge commits only, squash and rebase disabled (maximeshr)

### Commits

- `68d58c1` docs: merge commits only, squash and rebase disabled (Maxime Sahroui)
- `b1dfcd7` fix: keep releases consistent after a squashed release pull request (#12) (Maxime Sahroui)
- `56b5f43` feat: harden the release and add check-version and check-package (#8) (Maxime Sahroui)
