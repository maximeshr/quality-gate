import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { main, parseCommand, USAGE } from "../scripts/cli.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" });

let log: ReturnType<typeof vi.spyOn>;
let error: ReturnType<typeof vi.spyOn>;
const printed = (spy: ReturnType<typeof vi.spyOn>) =>
  spy.mock.calls.map((call: unknown[]) => call.join(" ")).join("\n");

beforeEach(() => {
  log = vi.spyOn(console, "log").mockImplementation(() => {});
  error = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseCommand", () => {
  test("reads the options and the positional file of report", () => {
    expect(parseCommand("report", ["out.md", "--setup", "vp run astro sync"])).toEqual({
      values: { setup: "vp run astro sync" },
      positionals: ["out.md"],
    });
  });

  test("accepts --option=value", () => {
    expect(parseCommand("check-changesets", ["--base=origin/main"]).values).toEqual({
      base: "origin/main",
    });
  });

  test("rejects an unknown option", () => {
    expect(() => parseCommand("check-package", ["--profle", "node16"])).toThrow(/profle/);
  });

  test("rejects an extra argument", () => {
    expect(() => parseCommand("report", ["a.md", "b.md"])).toThrow(/Unexpected argument 'b.md'/);
    expect(() => parseCommand("deadcode", ["src"])).toThrow();
  });
});

describe("main", () => {
  test("prints the usage without a command", async () => {
    expect(await main([])).toBe(0);
    expect(printed(log)).toBe(USAGE);
  });

  test("fails on an unknown command", async () => {
    expect(await main(["lint"])).toBe(1);
    expect(printed(error)).toContain("unknown command 'lint'");
  });

  test("fails on an unknown option, with the usage", async () => {
    expect(await main(["release-notes", "--form", "v1.0.0"])).toBe(1);
    expect(printed(error)).toMatch(/quality-gate release-notes: .*form/);
    expect(printed(error)).toContain(USAGE);
  });

  describe("in a repository", () => {
    let repo: string;
    const previous = process.cwd();

    beforeEach(() => {
      repo = mkdtempSync(join(tmpdir(), "quality-gate-cli-"));
      git(repo, "init", "-q", "-b", "canary");
      git(repo, "config", "user.email", "test@example.com");
      git(repo, "config", "user.name", "Test");
      mkdirSync(join(repo, ".changeset"));
      writeFileSync(join(repo, ".changeset", "README.md"), "# Changesets\n");
      git(repo, "add", "-A");
      git(repo, "commit", "-q", "-m", "chore: init");
      git(repo, "switch", "-q", "-c", "feature");
      git(repo, "commit", "-q", "--allow-empty", "-m", "feat: nothing");
      process.chdir(repo);
    });

    afterEach(() => {
      process.chdir(previous);
    });

    test("check-changesets fails without a changeset", async () => {
      expect(await main(["check-changesets", "--base", "canary", "--title", "feat: x"])).toBe(1);
      expect(printed(error)).toContain("adds no changeset");
    });

    test("check-changesets exempts an internal pull request", async () => {
      expect(await main(["check-changesets", "--base", "canary", "--title", "ci: x"])).toBe(0);
      expect(printed(log)).toContain("internal pull request");
    });

    test("release-notes writes the --output file", async () => {
      expect(await main(["release-notes", "--from", "canary", "--output", "notes.md"])).toBe(0);
      expect(readFileSync(join(repo, "notes.md"), "utf8")).toContain("feat: nothing");
    });
  });
});
