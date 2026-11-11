---
"quality-gate": minor
---

Monorepos can now use the shared release flow: the new `release-package` input of `reusable-release.yml` and `reusable-changesets.yml` names the package whose version tags the release and that Dependabot changesets bump, e.g. `apps/web/package.json`. A release whose changesets do not bump that package now stops with an error instead of reusing an existing tag.
