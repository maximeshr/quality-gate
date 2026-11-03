---
"quality-gate": patch
---

The duplication gate now fails only when more than 5 % of the code is duplicated, as the configuration intends, instead of on every clone found. Markdown and MDX files (blog posts, docs) are no longer scanned: code samples in prose are not project code.
