import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { MockInstance } from "vite-plus/test";

import { main, parseCommand, USAGE } from "../scripts/cli.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf-8" });

const printed = (spy: MockInstance<typeof console.log>) =>
  spy.mock.calls.map((call: unknown[]) => call.join(" ")).join("\n");

describe(parseCommand, () => {
  it("reads the options and the positional file of report", () => {
    const { positionals, values } = parseCommand("report", [
      "out.md",
      "--setup",
      "vp run astro sync",
    ]);

    // parseArgs returns its values in a null-prototype object
    expect({ positionals, values: { ...values } }).toStrictEqual({
      positionals: ["out.md"],
      values: { setup: "vp run astro sync" },
    });
  });

  it("accepts --option=value", () => {
    expect({ ...parseCommand("check-changesets", ["--base=origin/main"]).values }).toStrictEqual({
      base: "origin/main",
    });
  });

  it("rejects a command inherited from Object.prototype", () => {
    expect(() => parseCommand("toString", [])).toThrow(/Unknown command 'toString'/u);
  });

  it("rejects an unknown option", () => {
    expect(() => parseCommand("check-package", ["--profle", "node16"])).toThrow(/profle/u);
  });

  it("rejects an extra argument", () => {
    expect(() => parseCommand("report", ["a.md", "b.md"])).toThrow(/Unexpected argument 'b.md'/u);
    expect(() => parseCommand("deadcode", ["src"])).toThrow(/Unexpected argument 'src'/u);
  });
});

describe(main, () => {
  let log: MockInstance<typeof console.log>;
  let error: MockInstance<typeof console.error>;

  beforeEach(() => {
    log = vi.spyOn(console, "log").mockImplementation(() => {});
    error = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints the usage without a command", async () => {
    await expect(main([])).resolves.toBe(0);
    expect(printed(log)).toBe(USAGE);
  });

  it("fails on an unknown command", async () => {
    await expect(main(["lint"])).resolves.toBe(1);
    expect(printed(error)).toContain("unknown command 'lint'");
  });

  it.each(["toString", "constructor", "__proto__"])(
    "fails on %s, inherited from Object.prototype",
    async (command) => {
      await expect(main([command])).resolves.toBe(1);
      expect(printed(error)).toContain(`unknown command '${command}'`);
    },
  );

  it("fails on an unknown option, with the usage", async () => {
    await expect(main(["release-notes", "--form", "v1.0.0"])).resolves.toBe(1);
    expect(printed(error)).toMatch(/quality-gate release-notes: .*form/u);
    expect(printed(error)).toContain(USAGE);
  });

  describe("in a repository", () => {
    let repo: string;
    const previous = process.cwd();

    beforeEach(() => {
      repo = mkdtempSync(path.join(tmpdir(), "quality-gate-cli-"));
      git(repo, "init", "-q", "-b", "canary");
      git(repo, "config", "user.email", "test@example.com");
      git(repo, "config", "user.name", "Test");
      mkdirSync(path.join(repo, ".changeset"));
      writeFileSync(path.join(repo, ".changeset", "README.md"), "# Changesets\n");
      git(repo, "add", "-A");
      git(repo, "commit", "-q", "-m", "chore: init");
      git(repo, "switch", "-q", "-c", "feature");
      git(repo, "commit", "-q", "--allow-empty", "-m", "feat: nothing");
      process.chdir(repo);
    });

    afterEach(() => {
      process.chdir(previous);
    });

    it("check-changesets fails without a changeset", async () => {
      await expect(
        main(["check-changesets", "--base", "canary", "--title", "feat: x"]),
      ).resolves.toBe(1);
      expect(printed(error)).toContain("adds no changeset");
    });

    it("check-changesets exempts an internal pull request", async () => {
      await expect(
        main(["check-changesets", "--base", "canary", "--title", "ci: x"]),
      ).resolves.toBe(0);
      expect(printed(log)).toContain("internal pull request");
    });

    it("release-notes writes the --output file", async () => {
      await expect(
        main(["release-notes", "--from", "canary", "--output", "notes.md"]),
      ).resolves.toBe(0);
      expect(readFileSync(path.join(repo, "notes.md"), "utf-8")).toContain("feat: nothing");
    });
  });
});
