## Release notes

### Minor changes

- Monorepos can now use the shared release flow: the new `release-package` input of `reusable-release.yml` and `reusable-changesets.yml` names the package whose version tags the release and that Dependabot changesets bump, e.g. `apps/web/package.json`. A release whose changesets do not bump that package now stops with an error instead of reusing an existing tag.

### Patch changes

- Dependencies: chore(deps): bump the minor-and-patch group with 4 updates.

### Pull requests

- #19 ci: bump voidzero-dev/setup-vp from 1.21.2 to 1.22.0 in the actions group (dependabot[bot])
- #20 chore(deps): bump the minor-and-patch group with 4 updates (dependabot[bot])
- #21 feat: support monorepos in the release workflows (maximeshr)

### Commits

- `98fd8cb` feat: support monorepos in the release workflows (Maxime Sahroui)
- `70f9d6c` chore: add changeset for #20 (github-actions[bot])
- `a837ea8` chore(deps): bump the minor-and-patch group with 4 updates (dependabot[bot])
- `1d62c53` ci: bump voidzero-dev/setup-vp (dependabot[bot])
