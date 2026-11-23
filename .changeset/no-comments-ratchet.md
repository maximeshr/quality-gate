---
"quality-gate": minor
---

New comment ratchet: the `comments/no-comments` rule reports every comment except the contracts of the `delete-comments` skill (license header, JSDoc on an export or a member, JSDoc types in JavaScript, `// SAFETY:` before an assertion, `// EXTERNAL: <why>, https://<link>`, tool directives). `quality-gate comments` fails when a file has more comments than `comments-baseline.json` allows (new files at zero) and tightens the baseline when counts drop; it runs in the report (Comments (no rise)) and belongs in the pre-push hook. After upgrading, run `vp exec quality-gate comments --reset`, commit `comments-baseline.json`, and add `vp exec quality-gate comments` to `.vite-hooks/pre-push`: without a baseline, the report fails on every existing comment.
