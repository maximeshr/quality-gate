---
name: delete-comments
description: Audit the code comments in a scope, delete what the code already says or should say, move decisions into ADRs, and file issues for the hacks comments excuse. Use when the user asks to clean up, delete or audit comments, or before a quality-gate upgrade that tightens comment rules.
argument-hint: "[files, folder or diff; default: the diff against canary]"
---

# Delete comments

A comment is a liability: it drifts from the code, and it lets a hack pass as intentional. This skill keeps only the comments that carry a contract, and gives every other piece of knowledge a better home.

## Scope

The files or folder the user names. Otherwise the current branch diff against `origin/canary`, working tree included. Never touch files outside the scope, generated code, or vendored code.

## Categories

Read each comment with the code around it, then give it exactly one category:

| Category        | What it is                                                   | Action                                  |
| --------------- | ------------------------------------------------------------ | --------------------------------------- |
| Tautology       | repeats what the code already shows                          | delete                                  |
| Stale           | names code, behavior or context that no longer exists        | delete                                  |
| Excuse          | justifies a hack, a workaround, a `TODO` or a "fine for now" | delete, then file an issue for the hack |
| Decision record | documents a non-obvious decision and its reason              | move it into an ADR, then delete        |
| Contract        | a comment the OKQ lint rules keep (below)                    | keep                                    |

Contracts are the only comments that stay:

- License headers.
- JSDoc that defines a public API, or that the base lint rules require on a member.
- A constraint forced by an external dependency, platform or protocol, ideally with an issue or RFC link.
- A lint suppression with a `-- reason`, or a `// SAFETY:` comment before a type assertion.

When unsure between Contract and anything else, the comment is not a contract. A surprise in our own code is never a contract: it is an Excuse, and the fix is a rename, an extraction or a type.

## Steps

1. List every comment in scope with its file and line, and categorize it.
2. Tautology and Stale: delete the comment. Check whether the code it described needs a better name instead.
3. Excuse: delete the comment, then file one issue per hack with `gh issue create`: title, the file and line, what the hack does, and what the proper fix is. Group comments that excuse the same hack into one issue.
4. Decision record: create the ADR with `create-adr` (`pnpm dlx create-adr "<decision title>"`, written to `docs/adr/`), fill in its context, decision and consequences from the comment and the code, then delete the comment.
5. Run `vp check` and `vp test`: deleting a comment must not change behavior.
6. Commit as `chore: delete code comments` (internal, no changeset), separate from any code change.

## Report

- Comments found, then the count per category.
- The issues filed, with their links.
- The ADRs created, with their paths.
- The contracts kept, with one line each on why.
- The lines removed: run `git diff --numstat` on the commit and give the total deletions.
