import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { checkChangesets, parseChangeset } from "../scripts/changesets.js";
import { releaseNotes } from "../scripts/release-notes.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

describe("parseChangeset", () => {
  test("reads the bumps and the summary", () => {
    const parsed = parseChangeset(
      '---\n"quality-gate": minor\n---\n\nAdd the PR report workflow.\n',
    );
    expect(parsed).toEqual({
      releases: [{ name: "quality-gate", type: "minor" }],
      summary: "Add the PR report workflow.",
    });
  });

  test("an empty changeset has no release", () => {
    expect(parseChangeset("---\n---\n").releases).toEqual([]);
  });
});

describe("checkChangesets and releaseNotes", () => {
  let repo: string;
  const previous = process.cwd();

  const addChangeset = (name: string, content: string) => {
    writeFileSync(join(repo, ".changeset", name), content);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", `chore: ${name}`);
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "quality-gate-"));
    git(repo, "init", "-q", "-b", "canary");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test");
    mkdirSync(join(repo, ".changeset"));
    writeFileSync(join(repo, ".changeset", "README.md"), "# Changesets\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "chore: init");
    git(repo, "switch", "-q", "-c", "feature");
    process.chdir(repo);
  });

  afterEach(() => {
    process.chdir(previous);
  });

  test("fails when the branch adds no changeset", () => {
    git(repo, "commit", "-q", "--allow-empty", "-m", "feat: nothing");
    expect(checkChangesets({ base: "canary" })).toEqual([
      expect.stringContaining("adds no changeset"),
    ]);
  });

  test("fails on an empty changeset or a short summary", () => {
    addChangeset("empty.md", "---\n---\n");
    addChangeset("short.md", '---\n"pkg": patch\n---\n\nFix bug\n');
    const errors = checkChangesets({ base: "canary" });
    expect(errors).toHaveLength(3);
    expect(errors.join("\n")).toMatch(/empty\.md: no package bump/);
    expect(errors.join("\n")).toMatch(/short\.md: the summary is too short/);
  });

  test("passes with a useful changeset, and groups it in the release notes", () => {
    addChangeset(
      "useful.md",
      '---\n"pkg": minor\n---\n\nAdd a quality report comment on every pull request.\n',
    );
    expect(checkChangesets({ base: "canary" })).toEqual([]);

    const notes = releaseNotes({ from: "canary", to: "HEAD", repository: undefined });
    expect(notes).toContain(
      "### Minor changes\n\n- Add a quality report comment on every pull request.",
    );
    expect(notes).not.toContain("### Patch changes");
    expect(notes).toMatch(/### Commits\n\n- `[0-9a-f]+` chore: useful\.md \(Test\)/);
  });
});
