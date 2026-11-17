import { describe, expect, test } from "vite-plus/test";

import { COVERAGE_TOLERANCE, coverageCheck, coverageSection } from "../scripts/coverage.js";

const metric = (pct: number) => ({ total: 100, covered: pct, skipped: 0, pct });
const entry = (lines: number, branches = lines) => ({
  lines: metric(lines),
  statements: metric(lines),
  functions: metric(lines),
  branches: metric(branches),
});

/** A summary with absolute keys under `root`, like Vitest writes it. */
function summary(total: number, files: Record<string, number> = {}, root = "/repo") {
  return {
    total: entry(total),
    ...Object.fromEntries(
      Object.entries(files).map(([path, pct]) => [`${root}/${path}`, entry(pct)]),
    ),
  };
}

describe("coverageCheck", () => {
  test("is skipped without both summaries", () => {
    expect(coverageCheck({ current: summary(80) })).toBeUndefined();
    expect(coverageCheck({ baseline: summary(80) })).toBeUndefined();
  });

  test("passes when line coverage rises or stays within the tolerance", () => {
    expect(coverageCheck({ current: summary(81), baseline: summary(80) })).toEqual({
      ok: true,
      output: "Line coverage 81% (+1)",
    });
    expect(
      coverageCheck({ current: summary(80 - COVERAGE_TOLERANCE), baseline: summary(80) })?.ok,
    ).toBe(true);
  });

  test("fails when line coverage drops beyond the tolerance", () => {
    const result = coverageCheck({ current: summary(78.4), baseline: summary(80) });
    expect(result?.ok).toBe(false);
    expect(result?.output).toMatch(/dropped from 80% to 78.4% \(−1.6 points, tolerance 0.5\)/);
  });
});

describe("coverageSection", () => {
  test("says when there is no summary", () => {
    expect(coverageSection({})).toBe("_No coverage summary._");
  });

  test("shows the totals, with their change against the base branch", () => {
    const section = coverageSection({ current: summary(80), baseline: summary(82.25) });
    expect(section).toContain("| 80% (−2.25) | 80% (−2.25) | 80% (−2.25) | 80% (−2.25) |");
    expect(section).toContain("_Change against the base branch in parentheses._");
    expect(coverageSection({ current: summary(80) })).toContain("| 80% | 80% | 80% | 80% |");
  });

  test("lists the changed files the coverage measures, matched across directories", () => {
    const section = coverageSection({
      current: summary(80, { "src/a.js": 90, "src/b.js": 50, "src/same.js": 70 }, "/repo"),
      // The base branch ran in another directory: its keys are matched by path suffix.
      baseline: summary(80, { "src/a.js": 85, "src/same.js": 70 }, "/elsewhere/repo"),
      changed: ["src/b.js", "src/a.js", "src/same.js", "README.md"],
      cwd: "/repo",
    });
    expect(section).toContain(
      [
        "#### Changed files",
        "",
        "| File | Lines | Branches |",
        "|---|---|---|",
        "| `src/a.js` | 90% (+5) | 90% (+5) |",
        "| `src/b.js` (new) | 50% | 50% |",
        "| `src/same.js` | 70% (=) | 70% (=) |",
      ].join("\n"),
    );
    expect(section).not.toContain("README.md");
  });

  test("says when no changed file is measured, and caps the list", () => {
    expect(
      coverageSection({ current: summary(80), changed: ["README.md"], cwd: "/repo" }),
    ).toContain("_No changed file is measured by the coverage._");

    const many = Object.fromEntries(
      Array.from({ length: 23 }, (_, i) => [`src/f${String(i).padStart(2, "0")}.js`, 60]),
    );
    const section = coverageSection({
      current: summary(60, many),
      changed: Object.keys(many),
      cwd: "/repo",
    });
    expect(section).toContain("`src/f19.js`");
    expect(section).not.toContain("`src/f20.js`");
    expect(section).toContain("_And 3 more changed files._");
  });
});
