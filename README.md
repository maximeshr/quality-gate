# quality-gate

Shared quality gate for OKQ projects: one Vite+ (`vp`) base configuration and a reusable GitHub Actions workflow that posts a quality report on every pull request.

Work in progress.

## Rule

The base configuration only changes when a rule is wrong for every project. A project that fails the gate is fixed in that project, not by loosening the base.
