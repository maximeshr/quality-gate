---
"quality-gate": minor
---

The base config now runs on vite-plus 1.7.0 (Oxlint 1.94, Oxfmt 0.79, Vitest 5.1.0), and quality-gate's own `oxlint` and `@oxlint/plugins` move to 1.94.0. Upgrade the project's vite-plus to 1.7.0 in the same pull request as quality-gate; `@vitest/coverage-v8` stays at 5.1.0.

From 1.7.0, `@voidzero-dev/vite-plus-core` follows the Vite version: the `vite` catalog entry becomes `npm:@voidzero-dev/vite-plus-core@8.3.8000` (`@1.7.0` does not exist and fails with `ERR_PNPM_NO_MATCHING_VERSION`). vite-plus 1.7.0 also replaces `oxlint-tsgolint` with `tsrs` for type-aware lint.
