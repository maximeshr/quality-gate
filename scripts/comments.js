import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { isObject, isString } from "./guards.js";

export const BASELINE = "comments-baseline.json";

const RULE = "comments/no-comments";
const PLUGIN = path.join(import.meta.dirname, "..", "src", "oxlint-plugin.js");

/** @typedef {Record<string, number>} Counts Comments per file, keyed by path relative to the project */

/**
 * @param {unknown} value Parsed JSON
 * @returns {value is Counts} true for an object of non-negative integers
 */
const isCounts = (value) =>
  isObject(value) &&
  !Array.isArray(value) &&
  Object.values(value).every((count) => Number.isInteger(count) && Number(count) >= 0);

/**
 * @param {string} [file] Path of the baseline
 * @returns {Counts} The baseline, empty when the file is absent
 */
export const readBaseline = (file = BASELINE) => {
  if (!existsSync(file)) {
    return {};
  }

  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(file, "utf-8"));

  if (!isCounts(parsed)) {
    throw new TypeError(`${file} must map each file path to a comment count`);
  }

  return parsed;
};

/**
 * @param {Counts} counts Comments per file
 * @returns {string} The baseline file content: files with comments only, sorted, formatted
 */
export const formatBaseline = (counts) =>
  `${JSON.stringify(
    Object.fromEntries(
      Object.entries(counts)
        .filter(([, count]) => count > 0)
        .toSorted(([a], [b]) => a.localeCompare(b)),
    ),
    undefined,
    2,
  )}\n`;

/**
 * Compares the counts with the baseline. A file above its baseline (zero for a new file) rose;
 * a file below it, or deleted, tightens the baseline
 *
 * @param {Counts} baseline The committed baseline
 * @param {Counts} counts The comments counted now
 * @returns {{ rose: string[], tightened: string[], next: Counts }} The files that rose and the
 *   files that dropped, as report lines, and the tightened baseline
 */
export const compareComments = (baseline, counts) => {
  const rose = Object.entries(counts)
    .filter(([file, count]) => count > (baseline[file] ?? 0))
    .map(([file, count]) => `${file}: ${count}, baseline ${baseline[file] ?? 0}`)
    .toSorted();

  const next = Object.fromEntries(
    Object.entries(baseline).map(([file, allowed]) => [file, Math.min(allowed, counts[file] ?? 0)]),
  );

  const tightened = Object.entries(baseline)
    .filter(([file, allowed]) => next[file] !== allowed)
    .map(([file, allowed]) =>
      file in counts ? `${file}: ${allowed} → ${next[file]}` : `${file}: deleted`,
    )
    .toSorted();

  return { next, rose, tightened };
};

/**
 * @param {string} command Command
 * @param {string[]} args Its arguments
 * @returns {{ status: number | null, stdout: string, stderr: string }} Its result
 */
const spawn = (command, args) =>
  spawnSync(command, args, { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });

/**
 * The project's lint ignore patterns, from the config `vp lint` resolves
 *
 * @param {typeof spawn} run Runs a command
 * @returns {string[]} The patterns
 */
const ignorePatterns = (run) => {
  const { status, stdout, stderr } = run("vp", ["lint", "--print-config"]);

  if (status !== 0) {
    throw new Error(`vp lint --print-config failed: ${stderr.trim()}`);
  }

  /** @type {unknown} */
  const config = JSON.parse(stdout);
  const patterns = isObject(config) ? config.ignorePatterns : undefined;

  return Array.isArray(patterns) ? patterns.filter(isString) : [];
};

/**
 * Runs Oxlint with `comments/no-comments` alone, on the files the project lints
 *
 * @param {{ oxlint: string, run?: typeof spawn }} options The Oxlint bin script, and the command runner
 * @returns {Counts} Comments per file
 */
export const countComments = ({ oxlint, run = spawn }) => {
  const dir = mkdtempSync(path.join(tmpdir(), "quality-gate-comments-"));
  const config = path.join(dir, "oxlintrc.json");

  writeFileSync(
    config,
    JSON.stringify({
      categories: { correctness: "off" },
      jsPlugins: [{ name: "comments", specifier: PLUGIN }],
      plugins: [],
      rules: { [RULE]: "error" },
    }),
  );

  try {
    const ignore = ignorePatterns(run).map((pattern) => `--ignore-pattern=${pattern}`);

    const { status, stdout, stderr } = run(process.execPath, [
      oxlint,
      "--config",
      config,
      "--format",
      "json",
      ...ignore,
    ]);

    if (status !== 0 && status !== 1) {
      throw new Error(`oxlint failed: ${stderr.trim() || stdout.trim()}`);
    }

    /** @type {unknown} */
    const output = JSON.parse(stdout);
    const diagnostics = isObject(output) ? output.diagnostics : undefined;

    /** @type {Counts} */
    const counts = {};

    for (const diagnostic of Array.isArray(diagnostics) ? diagnostics : []) {
      if (isObject(diagnostic) && isString(diagnostic.filename)) {
        counts[diagnostic.filename] = (counts[diagnostic.filename] ?? 0) + 1;
      }
    }

    return counts;
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
};

/**
 * @param {number} count A count
 * @param {string} noun Its singular noun
 * @returns {string} The count and the noun, plural unless the count is one
 */
const plural = (count, noun) => `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * @param {Counts} counts Comments per file
 * @returns {string} The total, in words
 */
const total = (counts) => {
  const values = Object.values(counts).filter((count) => count > 0);

  return `${plural(
    values.reduce((sum, count) => sum + count, 0),
    "comment",
  )} in ${plural(values.length, "file")}`;
};

/**
 * The ratchet. Without `reset`, fails when a file rose above its baseline, and writes the
 * tightened baseline when a file dropped (failing too, until it is committed). With `reset`,
 * writes the current counts as the baseline
 *
 * @param {{ counts: Counts, reset?: boolean, file?: string }} options The counts, the reset flag, and the baseline path
 * @returns {{ ok: boolean, output: string }} The result
 */
export const ratchetComments = ({ counts, reset = false, file = BASELINE }) => {
  if (reset) {
    writeFileSync(file, formatBaseline(counts));

    return { ok: true, output: `${file} written: ${total(counts)}.` };
  }

  const baseline = readBaseline(file);
  const { next, rose, tightened } = compareComments(baseline, counts);
  const lines = [];

  if (rose.length > 0) {
    lines.push(
      `Comments per file rose above ${file}:`,
      ...rose.map((line) => `  ${line}`),
      `Delete them, or keep only the contracts ${RULE} allows (see the delete-comments skill).`,
    );
  }

  if (tightened.length > 0) {
    writeFileSync(file, formatBaseline(next));

    lines.push(`${file} tightened:`, ...tightened.map((line) => `  ${line}`), `Commit ${file}.`);
  }

  if (lines.length === 0) {
    lines.push(`${total(counts)}, none above ${file}.`);
  }

  return { ok: rose.length === 0 && tightened.length === 0, output: lines.join("\n") };
};
