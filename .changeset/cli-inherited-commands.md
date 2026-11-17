---
"quality-gate": patch
---

`quality-gate toString`, `constructor` and other names inherited from `Object.prototype` are now rejected as unknown commands (exit 1 with the usage) instead of silently exiting 0.
