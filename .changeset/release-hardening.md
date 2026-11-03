---
"quality-gate": minor
---

Release hardening. `reusable-release.yml` takes a `publish-script` input (default `vp run release`, so libraries keep their build and package checks before publishing), publishes before pushing the release commit (a failed publish can be rerun), and no longer fails when the tag already exists. New CLI commands `check-version` and `check-package` replace the `scripts/check-*.mjs` copies in each library. `docs` pull requests are now internal: no changeset required. The README documents the scripts baseline, npm trusted publishing, and protection for every repository.
