## Release notes

### Minor changes

- The base lint config enforces `vite-plus/prefer-vite-plus-imports`: import from `vite-plus` and `vite-plus/test`, never from `vite` or `vitest` directly. The report takes an optional setup command (`report --setup "<cmd>"`, `setup` input of `reusable-report.yml`) that runs before the gates, for frameworks whose types are generated (`vp run astro sync`). pnpm moves to 12.16.1.

### Patch changes

- The duplication gate now fails only when more than 5 % of the code is duplicated, as the configuration intends, instead of on every clone found. Markdown and MDX files (blog posts, docs) are no longer scanned: code samples in prose are not project code.

### Pull requests

- #14 feat: report setup step and the vite-plus imports rule (maximeshr)
- #16 fix: apply the 5 % duplication threshold and skip Markdown (maximeshr)

### Commits

- `8aac592` fix: apply the 5 % duplication threshold and skip Markdown (Maxime Sahroui)
- `25cc61e` feat: report setup step and the vite-plus imports rule (Maxime Sahroui)
