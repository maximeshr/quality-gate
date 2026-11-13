// Coverage in the report: the totals, their change against the base branch, the coverage of
// the files a pull request changes, and the gate that fails when line coverage drops.
import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative } from "node:path";

/** Line coverage may drop by this many percentage points before the gate fails. */
export const COVERAGE_TOLERANCE = 0.5;

/** Changed files listed in the report at most; the rest is counted. */
const MAX_FILES = 20;

const METRICS = ["lines", "statements", "functions", "branches"];

/**
 * @typedef {{ pct: number }} Metric
 * @typedef {Record<string, Record<string, Metric>>} Summary Vitest's `coverage-summary.json`:
 *   `total`, then one entry per file, keyed by absolute path.
 */

/** @returns {Summary | undefined} */
export function readSummary(file) {
  if (!file || !existsSync(file)) return undefined;
  return JSON.parse(readFileSync(file, "utf8"));
}

/**
 * Per-file entries keyed by path relative to `cwd`. A summary written in another directory
 * (the base branch's run) keeps its absolute keys: `fileEntry` matches them by suffix.
 */
function files(summary, cwd) {
  const entries = new Map();
  for (const [key, value] of Object.entries(summary)) {
    if (key === "total") continue;
    const path = isAbsolute(key) && key.startsWith(`${cwd}/`) ? relative(cwd, key) : key;
    entries.set(path, value);
  }
  return entries;
}

function fileEntry(entries, path) {
  if (entries.has(path)) return entries.get(path);
  for (const [key, value] of entries) if (key.endsWith(`/${path}`)) return value;
  return undefined;
}

const round = (value) => Math.round(value * 100) / 100;

function delta(current, base) {
  if (base === undefined) return "";
  const diff = round(current - base);
  if (diff === 0) return " (=)";
  return diff > 0 ? ` (+${diff})` : ` (−${Math.abs(diff)})`;
}

/**
 * The coverage gate: fails when line coverage drops by more than `COVERAGE_TOLERANCE` points
 * against the base branch. Undefined (skipped) without both summaries.
 * @param {{ current?: Summary, baseline?: Summary }} options
 * @returns {{ ok: boolean, output: string } | undefined}
 */
export function coverageCheck({ current, baseline }) {
  if (!current || !baseline) return undefined;
  const now = current.total.lines.pct;
  const before = baseline.total.lines.pct;
  const drop = round(before - now);
  if (drop > COVERAGE_TOLERANCE) {
    return {
      ok: false,
      output: `Line coverage dropped from ${before}% to ${now}% (−${drop} points, tolerance ${COVERAGE_TOLERANCE}). Add tests for the changed code.`,
    };
  }
  return { ok: true, output: `Line coverage ${now}%${delta(now, before)}` };
}

/**
 * The coverage section of the report.
 * @param {{ current?: Summary, baseline?: Summary, changed?: string[], cwd?: string }} options
 *   `changed`: paths of the files the pull request changes, relative to the repository root.
 */
export function coverageSection({ current, baseline, changed, cwd = process.cwd() }) {
  if (!current) return "_No coverage summary._";
  const cell = (metric) =>
    `${current.total[metric].pct}%${delta(current.total[metric].pct, baseline?.total[metric]?.pct)}`;
  const lines = [
    "| Lines | Statements | Functions | Branches |",
    "|---|---|---|---|",
    `| ${METRICS.map(cell).join(" | ")} |`,
  ];
  if (baseline) lines.push("", "_Change against the base branch in parentheses._");

  if (changed) {
    const now = files(current, cwd);
    const before = baseline ? files(baseline, cwd) : new Map();
    const covered = changed.filter((path) => now.has(path)).sort();
    lines.push("", "#### Changed files");
    if (covered.length === 0) {
      lines.push("", "_No changed file is measured by the coverage._");
    } else {
      lines.push("", "| File | Lines | Branches |", "|---|---|---|");
      for (const path of covered.slice(0, MAX_FILES)) {
        const entry = now.get(path);
        const base = fileEntry(before, path);
        const isNew = baseline && !base ? " (new)" : "";
        lines.push(
          `| \`${path}\`${isNew} | ${entry.lines.pct}%${delta(entry.lines.pct, base?.lines.pct)} | ${entry.branches.pct}%${delta(entry.branches.pct, base?.branches.pct)} |`,
        );
      }
      if (covered.length > MAX_FILES) {
        lines.push("", `_And ${covered.length - MAX_FILES} more changed files._`);
      }
    }
  }
  return lines.join("\n");
}
