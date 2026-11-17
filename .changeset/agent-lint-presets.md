---
"quality-gate": minor
---

The base config now lints with the Ultracite Oxlint presets (`core`, `vitest`), Dillon Mulroy's anti-slop rules (Ultracite's vendored copy) and comment rules: every `eslint-plugin-no-comment-slop` rule plus the new `comments` plugin, which flags comments that restate the code and `eslint-disable` / `oxlint-disable` directives without a `-- reason`. `@ts-ignore` is rejected and `@ts-expect-error` needs a description. `defineQualityGate({ presets: ["react", "next"] })` adds Ultracite framework presets (`astro`, `next`, `playwright`, `react`, `svelte`, `vue`).

Upgrading reports many new errors in existing projects. Run `vp check --fix`, then `vp lint --fix --fix-suggestions`, review the result, and fix the rest by hand: see "Lint rules" in the README.

The rules need the Oxlint of vite-plus 1.6.0 (Oxlint 1.93, Vitest 5.1.0): upgrade the project's vite-plus to 1.6.0 and `@vitest/coverage-v8` to 5.1.0 in the same pull request.

New versions now wait 5 days instead of 14, for every package: set `minimumReleaseAge: 7200` in `pnpm-workspace.yaml`, drop the exclusions older than 5 days, and set the Dependabot `cooldown.default-days` to 5.
