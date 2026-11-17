## Release notes

### Minor changes

- The quality report compares coverage with the base branch: each total shows its change, a new table lists the coverage of the files the pull request changes, and a new gate fails when line coverage drops by more than 0.5 point. The report workflow keeps each branch's coverage in the Actions cache, so projects have nothing to configure; the gate is skipped until the base branch has run once. Locally: `quality-gate report --base <ref> --baseline <coverage-summary.json>`.

### Patch changes

- The CLI now rejects an unknown option or an extra argument with an error and the usage, instead of ignoring it: a typo such as `--profle` no longer runs the command with its defaults.

### Pull requests

- #24 docs: stop hard-coding the release tag in the README (maximeshr)
- #25 refactor: parse the CLI options with node:util parseArgs (maximeshr)
- #26 test: cover the report, the release notes and the package check (maximeshr)
- #27 feat: compare the coverage with the base branch in the report (maximeshr)

### Commits

- `7b6dcaf` feat: compare the coverage with the base branch in the report (Maxime Sahroui)
- `71a8190` test: cover the report, the release notes and the package check (Maxime Sahroui)
- `9b4d744` refactor: parse the CLI options with node:util parseArgs (Maxime Sahroui)
- `6eab9fd` docs: stop hard-coding the release tag in the README (Maxime Sahroui)
