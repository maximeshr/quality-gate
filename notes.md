## Release notes

### Minor changes

- Internal pull requests no longer need a changeset: `check-changesets --title` (and `reusable-changesets.yml`) exempts Conventional Commits titles `ci`, `build`, `test` and `chore`, except `chore(deps)`, since runtime dependency updates reach users. The README now lists what a project must add: `@vitest/coverage-v8` at the bundled Vitest version, and `allowBuilds: { quality-gate: false }`.

### Pull requests

- #6 feat: exempt internal pull requests from changesets (maximeshr)

### Commits

- `f71e744` feat: exempt internal pull requests from changesets (#6) (Maxime Sahroui)
