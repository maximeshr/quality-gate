import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { checkChangesets, isInternal, parseChangeset } from "../scripts/changesets.js";
import { releaseNotes } from "../scripts/release-notes.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf-8" });

/** A pull request lookup that always fails */
const failing = vi.fn<(repository: string, sha: string) => string | undefined>();

describe(parseChangeset, () => {
  it("reads the bumps and the summary", () => {
    const parsed = parseChangeset(
      '---\n"quality-gate": minor\n---\n\nAdd the PR report workflow.\n',
    );

    expect(parsed).toStrictEqual({
      releases: [{ name: "quality-gate", type: "minor" }],
      summary: "Add the PR report workflow.",
    });
  });

  it("an empty changeset has no release", () => {
    expect(parseChangeset("---\n---\n").releases).toStrictEqual([]);
  });
});

describe("checkChangesets and releaseNotes", () => {
  let repo: string;
  const previous = process.cwd();

  const addChangeset = (name: string, content: string) => {
    writeFileSync(path.join(repo, ".changeset", name), content);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", `chore: ${name}`);
  };

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), "quality-gate-"));
    git(repo, "init", "-q", "-b", "canary");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test");
    mkdirSync(path.join(repo, ".changeset"));
    writeFileSync(path.join(repo, ".changeset", "README.md"), "# Changesets\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "chore: init");
    git(repo, "switch", "-q", "-c", "feature");
    process.chdir(repo);
  });

  afterEach(() => {
    process.chdir(previous);
  });

  it("fails when the branch adds no changeset", () => {
    git(repo, "commit", "-q", "--allow-empty", "-m", "feat: nothing");
    expect(checkChangesets({ base: "canary" })).toStrictEqual([
      expect.stringContaining("adds no changeset"),
    ]);
  });

  it("fails on an empty changeset or a short summary", () => {
    addChangeset("empty.md", "---\n---\n");
    addChangeset("short.md", '---\n"pkg": patch\n---\n\nFix bug\n');
    const errors = checkChangesets({ base: "canary" });
    expect(errors).toHaveLength(3);
    expect(errors.join("\n")).toMatch(/empty\.md: no package bump/u);
    expect(errors.join("\n")).toMatch(/short\.md: the summary is too short/u);
  });

  it("passes with a useful changeset, and groups it in the release notes", () => {
    addChangeset(
      "useful.md",
      '---\n"pkg": minor\n---\n\nAdd a quality report comment on every pull request.\n',
    );
    expect(checkChangesets({ base: "canary" })).toStrictEqual([]);

    const notes = releaseNotes({ from: "canary", repository: undefined, to: "HEAD" });
    expect(notes).toContain(
      "### Minor changes\n\n- Add a quality report comment on every pull request.",
    );
    expect(notes).not.toContain("### Patch changes");
    expect(notes).toMatch(/### Commits\n\n- `[0-9a-f]+` chore: useful\.md \(Test\)/u);
  });
});

describe(isInternal, () => {
  it.each([
    ["ci: run pull request checks on canary only", true],
    ["build: bump the node runtime", true],
    ["test: cover the report", true],
    ["chore: adopt the OKQ quality gate", true],
    ["chore(deps-dev): bump knip from 6.42.1 to 6.44.1", true],
    ["ci(deps): bump the actions group with 2 updates", true],
    ["chore(deps): bump execa from 10.1.1 to 10.2.1", false],
    ["feat: add the report", false],
    ["fix(cli): exit with 1 on failure", false],
    ["docs: explain the flow", true],
    ["Update README", false],
    [undefined, false],
  ])("%s → %s", (title, expected) => {
    expect(isInternal(title)).toBe(expected);
  });
});

describe("releaseNotes pull requests", () => {
  let repo: string;
  const previous = process.cwd();

  beforeEach(() => {
    repo = mkdtempSync(path.join(tmpdir(), "quality-gate-notes-"));
    git(repo, "init", "-q", "-b", "canary");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test");
    git(repo, "commit", "-q", "--allow-empty", "-m", "chore: init");
    git(repo, "commit", "-q", "--allow-empty", "-m", "feat: one");
    git(repo, "commit", "-q", "--allow-empty", "-m", "fix: two");
    process.chdir(repo);
  });

  afterEach(() => {
    process.chdir(previous);
  });

  it("lists each pull request once, sorted, without the release pull requests", () => {
    const asked: string[] = [];

    const pulls = (repository: string, sha: string) => {
      asked.push(repository);

      // Both commits belong to #12 and #4, and #30 is the release pull request into main
      return sha.length === 40
        ? "12\tfeat: one\talice\tcanary\n4\tfix: two\tbob\tcanary\n30\tRelease pkg@1.0.0\tbot\tmain\n"
        : undefined;
    };

    const notes = releaseNotes({ from: "HEAD~2", to: "HEAD", repository: "o/r", pulls });

    expect(asked).toStrictEqual(["o/r", "o/r"]);
    expect(notes).toContain("### Pull requests\n\n- #4 fix: two (bob)\n- #12 feat: one (alice)\n");
    expect(notes).not.toContain("#30");
    expect(notes).toContain("_No pending changeset._");
  });

  it("skips a commit whose lookup fails, and the section without a repository", () => {
    expect(
      releaseNotes({ from: "HEAD~2", to: "HEAD", repository: "o/r", pulls: failing }),
    ).not.toContain("### Pull requests");
    expect(releaseNotes({ from: "HEAD~2", to: "HEAD", pulls: failing })).not.toContain(
      "### Pull requests",
    );
  });

  it("says when the range has no commit", () => {
    expect(releaseNotes({ from: "HEAD", to: "HEAD" })).toContain("### Commits\n\n_No commit._");
  });
});
