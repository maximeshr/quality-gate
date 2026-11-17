// Coverage in the report: the totals, their change against the base branch, the coverage of
// the files a pull request changes, and the gate that fails when line coverage drops
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { isObject } from "./guards.js";

/** Line coverage may drop by this many percentage points before the gate fails */
export const COVERAGE_TOLERANCE = 0.5;

/** Changed files listed in the report at most, the others are only counted */
const MAX_FILES = 20;

/**
 * @typedef {{ pct: number }} Metric
 * @typedef {{ lines: Metric, statements: Metric, functions: Metric, branches: Metric }} Entry
 * @typedef {{ total: Entry, [file: string]: Entry }} Summary Vitest's `coverage-summary.json`:
 *   `total`, then one entry per file, keyed by absolute path
 */

/** @type {(keyof Entry)[]} */
const METRICS = ["lines", "statements", "functions", "branches"];

/**
 * @param {unknown} value Parsed JSON
 * @returns {value is Metric} true for an object with a numeric `pct`
 */
const isMetric = (value) => isObject(value) && Number.isFinite(value.pct);

/**
 * @param {unknown} value Parsed JSON
 * @returns {value is Entry} true for an object with every metric
 */
const isEntry = (value) => isObject(value) && METRICS.every((metric) => isMetric(value[metric]));

/**
 * @param {unknown} value Parsed JSON
 * @returns {value is Summary} true for a `total` entry and file entries
 */
const isSummary = (value) =>
  isObject(value) && isEntry(value.total) && Object.values(value).every(isEntry);

/**
 * @param {string} [file] Path of a `coverage-summary.json`
 * @returns {Summary | undefined} The summary, or undefined when the file is absent
 */
export const readSummary = (file) => {
  /** @type {unknown} */
  const parsed =
    file === undefined || file === "" || !existsSync(file)
      ? undefined
      : JSON.parse(readFileSync(file, "utf-8"));

  return isSummary(parsed) ? parsed : undefined;
};

/**
 * Per-file entries keyed by path relative to `cwd`. A summary written in another directory
 * (the base branch's run) keeps its absolute keys: `fileEntry` matches them by suffix
 *
 * @param {Summary | undefined} summary A coverage summary
 * @param {string} cwd Directory the paths are made relative to
 * @returns {Map<string, Entry>} The file entries, none without a summary
 */
const files = (summary, cwd) => {
  /** @type {Map<string, Entry>} */
  const entries = new Map();

  for (const [key, value] of Object.entries(summary ?? {})) {
    if (key !== "total") {
      const file =
        path.isAbsolute(key) && key.startsWith(`${cwd}/`) ? path.relative(cwd, key) : key;

      entries.set(file, value);
    }
  }

  return entries;
};

/**
 * @param {Map<string, Entry>} entries File entries, from `files`
 * @param {string} file Path relative to the repository root
 * @returns {Entry | undefined} Its entry, matched exactly or by path suffix
 */
const fileEntry = (entries, file) =>
  entries.get(file) ?? [...entries].find(([key]) => key.endsWith(`/${file}`))?.[1];

/**
 * @param {number} value A percentage
 * @returns {number} It rounded to two decimals
 */
const round = (value) => Math.round(value * 100) / 100;

/**
 * @param {number} current The percentage now
 * @param {number} [base] The percentage on the base branch
 * @returns {string} The change in parentheses, empty without a base
 */
const delta = (current, base) => {
  if (base === undefined) {
    return "";
  }

  const diff = round(current - base);

  if (diff === 0) {
    return " (=)";
  }

  return diff > 0 ? ` (+${diff})` : ` (−${Math.abs(diff)})`;
};

/**
 * @param {Summary} current The summary of this run
 * @param {Summary} baseline The summary of the base branch
 * @returns {{ ok: boolean, output: string }} The gate result
 */
const compareLines = (current, baseline) => {
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
};

/**
 * The coverage gate: fails when line coverage drops by more than `COVERAGE_TOLERANCE` points
 * against the base branch. Undefined (skipped) without both summaries
 *
 * @param {{ current?: Summary, baseline?: Summary }} options The summaries of this run and of the base branch
 * @returns {{ ok: boolean, output: string } | undefined} The gate result
 */
export const coverageCheck = ({ current, baseline }) =>
  current === undefined || baseline === undefined ? undefined : compareLines(current, baseline);

/**
 * @param {Summary} current The summary of this run
 * @param {Summary | undefined} baseline The summary of the base branch
 * @param {string[]} changed Paths of the changed files, relative to the repository root
 * @param {string} cwd Directory the summary paths are made relative to
 * @returns {string[]} The lines of the changed files table
 */
const changedFilesLines = (current, baseline, changed, cwd) => {
  const now = files(current, cwd);
  const before = files(baseline, cwd);
  const covered = changed.filter((file) => now.has(file)).toSorted();
  const lines = ["", "#### Changed files"];

  if (covered.length === 0) {
    lines.push("", "_No changed file is measured by the coverage._");

    return lines;
  }

  lines.push("", "| File | Lines | Branches |", "|---|---|---|");

  for (const file of covered.slice(0, MAX_FILES)) {
    const entry = now.get(file);
    const base = fileEntry(before, file);
    const isNew = baseline !== undefined && base === undefined ? " (new)" : "";

    if (entry !== undefined) {
      lines.push(
        `| \`${file}\`${isNew} | ${entry.lines.pct}%${delta(entry.lines.pct, base?.lines.pct)} | ${entry.branches.pct}%${delta(entry.branches.pct, base?.branches.pct)} |`,
      );
    }
  }

  if (covered.length > MAX_FILES) {
    lines.push("", `_And ${covered.length - MAX_FILES} more changed files._`);
  }

  return lines;
};

/**
 * The coverage section of the report.
 *
 * @param {{ current?: Summary, baseline?: Summary, changed?: string[], cwd?: string }} options The
 *   summaries of this run and of the base branch, and the paths of the changed files, relative to
 *   the repository root
 * @returns {string} The Markdown section
 */
export const coverageSection = ({ current, baseline, changed, cwd = process.cwd() }) => {
  if (current === undefined) {
    return "_No coverage summary._";
  }

  /**
   * @param {keyof Entry} metric A metric
   * @returns {string} Its table cell
   */
  const cell = (metric) =>
    `${current.total[metric].pct}%${delta(current.total[metric].pct, baseline?.total[metric].pct)}`;

  const lines = [
    "| Lines | Statements | Functions | Branches |",
    "|---|---|---|---|",
    `| ${METRICS.map(cell).join(" | ")} |`,
  ];

  if (baseline !== undefined) {
    lines.push("", "_Change against the base branch in parentheses._");
  }

  if (changed !== undefined) {
    lines.push(...changedFilesLines(current, baseline, changed, cwd));
  }

  return lines.join("\n");
};
