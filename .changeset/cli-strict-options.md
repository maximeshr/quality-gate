---
"quality-gate": patch
---

The CLI now rejects an unknown option or an extra argument with an error and the usage, instead of ignoring it: a typo such as `--profle` no longer runs the command with its defaults.
