---
"quality-gate": patch
---

CI runs pull request checks only on pull requests into `canary`. The release pull request into `main` no longer gets a failed run: its head is `canary`, already checked on push.
