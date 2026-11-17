---
"quality-gate": minor
---

The base config now lints with the Ultracite Oxlint presets (`core`, `vitest`), Dillon Mulroy's anti-slop rules (Ultracite's vendored copy) and comment rules: every `eslint-plugin-no-comment-slop` rule plus the new `comments` plugin, which flags comments that restate the code and `eslint-disable` / `oxlint-disable` directives without a `-- reason`. `@ts-ignore` is rejected and `@ts-expect-error` needs a description. `defineQualityGate({ presets: ["react", "next"] })` adds Ultracite framework presets (`astro`, `next`, `playwright`, `react`, `svelte`, `vue`).

Upgrading reports many new errors in existing projects. Run `vp check --fix`, then `vp lint --fix --fix-suggestions`, review the result, and fix the rest by hand: see "Lint rules" in the README.
