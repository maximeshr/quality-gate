## Release notes

### Minor changes

- quality-gate is now a Claude Code plugin marketplace. Its `okq` plugin ships the OKQ agent skills: `okq-stack` (conventions), `align-project` (alignment, audit, settings), `merge-risk` (pull request risk assessment, vendored from Warp) and the new `delete-comments` (comment audit with ADRs and issues). Enable it in `.claude/settings.json`, pinned to the quality-gate tag; `align-project`'s audit now checks it.

### Pull requests

- #37 feat: ship the OKQ agent skills as a Claude Code plugin (maximeshr)

### Commits

- `c1c6830` feat: ship the OKQ agent skills as a Claude Code plugin (Maxime Sahroui)
