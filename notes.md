## Release notes

### Patch changes

- CI runs pull request checks only on pull requests into `canary`. The release pull request into `main` no longer gets a failed run: its head is `canary`, already checked on push.
- Dependabot keeps the npm dependencies and GitHub Actions up to date on `canary`, with the same 14-day cooldown as pnpm, and a weekly `pnpm audit` covers the security alerts Dependabot cannot raise on a pnpm 12 lockfile.

### Pull requests

- #3 ci: run pull request checks on canary only (maximeshr)
- #4 ci: add dependabot and weekly audit (maximeshr)

### Commits

- `431f90b` ci: add dependabot and weekly audit (#4) (Maxime Sahroui)
- `c23596d` ci: run pull request checks on canary only (#3) (Maxime Sahroui)
