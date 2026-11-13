import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";

import { report } from "../scripts/report.js";

const tools = {
  deadcode: () => ["knip", []] as [string, string[]],
  duplication: () => ["jscpd", ["--config", "jscpd.json"]] as [string, string[]],
  secrets: () => ["secretlint", ["**/*"]] as [string, string[]],
};

/** A fake `exec`: every command passes, except the ones named in `failing`. */
function fakeExec(failing: string[] = []) {
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
  return { exec, calls };
}

describe("report", () => {
  let dir: string;
  const previous = process.cwd();

  const project = (manifest: object) => {
    writeFileSync(join(dir, "package.json"), JSON.stringify(manifest));
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "quality-gate-report-"));
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(previous);
  });

  test("runs every gate and passes when all of them pass", () => {
    project({ name: "app", scripts: { build: "vp pack" } });
    const { exec, calls } = fakeExec();
    const { markdown, failed } = report({ tools, exec, onPath: () => true });

    expect(failed).toBe(false);
    expect(calls).toEqual([
      "vp check --deny-warnings",
      "vp test --coverage",
      "knip",
      "jscpd --config jscpd.json",
      "secretlint **/*",
      "semgrep scan --config p/typescript --config p/nodejs --error --metrics off --quiet",
      "vp run build",
    ]);
    expect(markdown.startsWith("<!-- quality-gate-report -->\n## Quality report")).toBe(true);
    expect(markdown).toContain("✅ **All quality gates passed** — `local`");
    expect(markdown).toContain("| ✅ | Tests + coverage | `vp test --coverage` | 1.2 s |");
    expect(markdown).toContain("_No coverage summary._");
    expect(markdown).not.toContain("<details");
  });

  test("lists each failure with its output, blank lines dropped", () => {
    project({ name: "app" });
    const { exec } = fakeExec(["knip", "secretlint"]);
    const { markdown, failed } = report({ tools, exec, onPath: () => true });

    expect(failed).toBe(true);
    expect(markdown).toContain("❌ **Some quality gates failed**");
    expect(markdown).toContain("| ❌ | Dead code / unused deps | `knip` |");
    expect(markdown).toContain(
      "<details open><summary>❌ Dead code / unused deps</summary>\n\n```text\nknip failed\nsecond line\n```",
    );
    expect(markdown).toContain("<summary>❌ Secrets</summary>");
  });

  test("skips Semgrep when it is not installed, and the build without a build script", () => {
    project({ name: "lib", scripts: { dev: "vp pack --watch" } });
    const { exec, calls } = fakeExec();
    const { markdown } = report({ tools, exec, onPath: () => false });

    expect(calls.some((call) => call.startsWith("semgrep") || call === "vp run build")).toBe(false);
    expect(markdown).toContain("| ⏭️ | SAST (Semgrep) | semgrep is not installed | - |");
    expect(markdown).toContain("| ⏭️ | Build | no `build` script | - |");
  });

  test("runs the setup command first, as its own gate", () => {
    project({ name: "site" });
    const { exec, calls } = fakeExec();
    const { markdown } = report({ tools, setup: "vp run astro sync", exec, onPath: () => false });

    expect(calls[0]).toBe("sh -c vp run astro sync");
    expect(markdown).toContain("| ✅ | Setup | `sh -c vp run astro sync` |");
  });

  test("shows the coverage summary", () => {
    project({ name: "app" });
    mkdirSync(join(dir, "coverage"));
    const metric = (pct: number) => ({ total: 10, covered: 0, skipped: 0, pct });
    writeFileSync(
      join(dir, "coverage", "coverage-summary.json"),
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
});
