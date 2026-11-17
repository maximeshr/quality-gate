## Release notes

### Minor changes

- The base config now lints with the Ultracite Oxlint presets (`core`, `vitest`), Dillon Mulroy's anti-slop rules (Ultracite's vendored copy) and comment rules: every `eslint-plugin-no-comment-slop` rule plus the new `comments` plugin, which flags comments that restate the code and `eslint-disable` / `oxlint-disable` directives without a `-- reason`. `@ts-ignore` is rejected and `@ts-expect-error` needs a description. `defineQualityGate({ presets: ["react", "next"] })` adds Ultracite framework presets (`astro`, `next`, `playwright`, `react`, `svelte`, `vue`).

  Upgrading reports many new errors in existing projects. Run `vp check --fix`, then `vp lint --fix --fix-suggestions`, review the result, and fix the rest by hand: see "Lint rules" in the README.

  The rules need the Oxlint of vite-plus 1.6.0 (Oxlint 1.93, Vitest 5.1.0): upgrade the project's vite-plus to 1.6.0 and `@vitest/coverage-v8` to 5.1.0 in the same pull request.

  New versions now wait 5 days instead of 14, for every package: set `minimumReleaseAge: 7200` in `pnpm-workspace.yaml`, drop the exclusions older than 5 days, and set the Dependabot `cooldown.default-days` to 5.

### Patch changes

- `quality-gate toString`, `constructor` and other names inherited from `Object.prototype` are now rejected as unknown commands (exit 1 with the usage) instead of silently exiting 0.

### Pull requests

- #30 feat: lint with ultracite, anti-slop and comment rules (maximeshr)
- #31 fix: reject commands inherited from Object.prototype (maximeshr)

### Commits

- `5d90fca` fix: reject commands inherited from Object.prototype (Maxime Sahroui)
- `8c183af` refactor: make the merged canary code pass the new lint rules (Maxime Sahroui)
- `d6324fb` build: wait 5 days for every new version instead of 14 (Maxime Sahroui)
- `e3a1963` build: upgrade vite-plus to 1.6.0 with a 5-day release age for its tools (Maxime Sahroui)
- `579158c` refactor: make quality-gate pass its new lint rules (Maxime Sahroui)
- `dbf20e0` feat: lint with ultracite, anti-slop and comment rules (Maxime Sahroui)
