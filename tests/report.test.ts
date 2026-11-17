import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { report } from "../scripts/report.js";

const tools = {
  deadcode: (): [string, string[]] => ["knip", []],
  duplication: (): [string, string[]] => ["jscpd", ["--config", "jscpd.json"]],
  secrets: (): [string, string[]] => ["secretlint", ["**/*"]],
};

/** A fake `exec`: every command passes, except the ones named in `failing` */
const fakeExec = (failing: string[] = []) => {
  const calls: string[] = [];

  const exec = (command: string, args: string[]) => {
    const line = [command, ...args].join(" ");

    calls.push(line);

    const ok = !failing.some((name) => line.startsWith(name));

    return {
      ok,
      output: ok ? "" : `${line} failed\n\nsecond line`,
      seconds: 1.234,
    };
  };

  return { calls, exec };
};

const metric = (pct: number) => ({ total: 10, covered: 0, skipped: 0, pct });

const entry = (pct: number) => ({
  lines: metric(pct),
  statements: metric(pct),
  functions: metric(pct),
  branches: metric(pct),
});

describe(report, () => {
  let dir: string;
  const previous = process.cwd();

  const project = (manifest: { name: string; scripts?: Record<string, string> }) => {
    writeFileSync(path.join(dir, "package.json"), JSON.stringify(manifest));
  };

  beforeEach(() => {
    // realpath: macOS tmpdir is a symlink, and Vitest writes coverage keys with the real path
    dir = realpathSync(mkdtempSync(path.join(tmpdir(), "quality-gate-report-")));
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(previous);
  });

  it("runs every gate and passes when all of them pass", () => {
    project({ name: "app", scripts: { build: "vp pack" } });
    const { exec, calls } = fakeExec();
    const { markdown, failed } = report({ tools, exec, onPath: () => true });

    expect({ calls, failed, head: markdown.split("\n").slice(0, 2) }).toStrictEqual({
      calls: [
        "vp check --deny-warnings",
        "vp test --coverage",
        "knip",
        "jscpd --config jscpd.json",
        "secretlint **/*",
        "semgrep scan --config p/typescript --config p/nodejs --error --metrics off --quiet",
        "vp run build",
      ],
      failed: false,
      head: ["<!-- quality-gate-report -->", "## Quality report"],
    });
    expect(markdown).toContain("✅ **All quality gates passed** — `local`");
    expect(markdown).toContain("| ✅ | Tests + coverage | `vp test --coverage` | 1.2 s |");
    expect(markdown).toContain("_No coverage summary._");
    expect(markdown).not.toContain("<details");
  });

  it("lists each failure with its output, blank lines dropped", () => {
    project({ name: "app" });
    const { exec } = fakeExec(["knip", "secretlint"]);
    const { markdown, failed } = report({ tools, exec, onPath: () => true });

    expect(failed).toBeTruthy();
    expect(markdown).toContain("❌ **Some quality gates failed**");
    expect(markdown).toContain("| ❌ | Dead code / unused deps | `knip` |");
    expect(markdown).toContain(
      "<details open><summary>❌ Dead code / unused deps</summary>\n\n```text\nknip failed\nsecond line\n```",
    );
    expect(markdown).toContain("<summary>❌ Secrets</summary>");
  });

  it("skips Semgrep when it is not installed, and the build without a build script", () => {
    project({ name: "lib", scripts: { dev: "vp pack --watch" } });
    const { exec, calls } = fakeExec();
    const { markdown } = report({ tools, exec, onPath: () => false });

    expect(
      calls.filter((call) => call.startsWith("semgrep") || call === "vp run build"),
    ).toStrictEqual([]);
    expect(markdown).toContain("| ⏭️ | SAST (Semgrep) | semgrep is not installed | - |");
    expect(markdown).toContain("| ⏭️ | Build | no `build` script | - |");
  });

  it("runs the setup command first, as its own gate", () => {
    project({ name: "site" });
    const { exec, calls } = fakeExec();
    const { markdown } = report({ tools, setup: "vp run astro sync", exec, onPath: () => false });

    expect(calls[0]).toBe("sh -c vp run astro sync");
    expect(markdown).toContain("| ✅ | Setup | `sh -c vp run astro sync` |");
  });

  it("shows the coverage summary", () => {
    project({ name: "app" });
    mkdirSync(path.join(dir, "coverage"));
    writeFileSync(
      path.join(dir, "coverage", "coverage-summary.json"),
      JSON.stringify({
        total: {
          lines: metric(81.5),
          statements: metric(80),
          functions: metric(75),
          branches: metric(60.25),
        },
      }),
    );
    const { markdown } = report({ tools, exec: fakeExec().exec, onPath: () => false });

    expect(markdown).toContain("| 81.5% | 80% | 75% | 60.25% |");
  });

  const writeSummary = (file: string, lines: number, files: Record<string, number> = {}) => {
    mkdirSync(path.join(file, ".."), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify({
        total: entry(lines),
        ...Object.fromEntries(
          Object.entries(files).map(([p, pct]) => [path.join(dir, p), entry(pct)]),
        ),
      }),
    );
  };

  it("skips the coverage gate without a base branch summary", () => {
    project({ name: "app" });
    const { markdown } = report({ tools, exec: fakeExec().exec, onPath: () => false });

    expect(markdown).toContain("| ⏭️ | Coverage (no drop) | no base branch coverage | - |");
  });

  it("fails when line coverage drops against the base branch", () => {
    project({ name: "app" });
    writeSummary(path.join(dir, "coverage", "coverage-summary.json"), 70);
    writeSummary(path.join(dir, "base", "coverage-summary.json"), 80);

    const { markdown, failed } = report({
      tools,
      baseline: path.join(dir, "base", "coverage-summary.json"),
      exec: fakeExec().exec,
      onPath: () => false,
    });

    expect(failed).toBeTruthy();
    expect(markdown).toContain("| ❌ | Coverage (no drop) | Line coverage dropped from 80% to 70%");
    expect(markdown).toContain("<summary>❌ Coverage (no drop)</summary>");
    expect(markdown).toContain("| 70% (−10) |");
  });

  it("lists the coverage of the files changed since the base ref", () => {
    const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf-8" });
    project({ name: "app" });
    git("init", "-q", "-b", "canary");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "Test");
    mkdirSync(path.join(dir, "src"));
    writeFileSync(path.join(dir, "src", "old.js"), "export const a = 1;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "chore: init");
    git("switch", "-q", "-c", "feature");
    writeFileSync(path.join(dir, "src", "new.js"), "export const b = 2;\n");
    git("add", "-A");
    git("commit", "-q", "-m", "feat: add new.js");
    writeSummary(path.join(dir, "coverage", "coverage-summary.json"), 90, {
      "src/old.js": 100,
      "src/new.js": 75,
    });

    const { markdown, failed } = report({
      tools,
      base: "canary",
      exec: fakeExec().exec,
      onPath: () => false,
    });

    expect(failed).toBeFalsy();
    expect(markdown).toContain("#### Changed files");
    expect(markdown).toContain("| `src/new.js` | 75% | 75% |");
    expect(markdown).not.toContain("`src/old.js`");
  });
});
