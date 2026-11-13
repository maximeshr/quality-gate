---
"quality-gate": minor
---

The quality report compares coverage with the base branch: each total shows its change, a new table lists the coverage of the files the pull request changes, and a new gate fails when line coverage drops by more than 0.5 point. The report workflow keeps each branch's coverage in the Actions cache, so projects have nothing to configure; the gate is skipped until the base branch has run once. Locally: `quality-gate report --base <ref> --baseline <coverage-summary.json>`.
