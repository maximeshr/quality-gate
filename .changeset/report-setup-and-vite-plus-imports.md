---
"quality-gate": minor
---

The base lint config enforces `vite-plus/prefer-vite-plus-imports`: import from `vite-plus` and `vite-plus/test`, never from `vite` or `vitest` directly. The report takes an optional setup command (`report --setup "<cmd>"`, `setup` input of `reusable-report.yml`) that runs before the gates, for frameworks whose types are generated (`vp run astro sync`). pnpm moves to 12.16.1.
