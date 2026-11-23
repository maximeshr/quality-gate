// Runs every gate and renders the Markdown report posted on pull requests
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";

import { coverageCheck, coverageSection, readSummary } from "./coverage.js";
import { isObject } from "./guards.js";

const MARKER = "<!-- quality-gate-report -->";

const env = { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" };
const strip = stripVTControlCharacters;

/**
 * @typedef {[string, string[]]} Command Command and arguments
 * @typedef {{ ok: boolean, output: string, seconds: number }} ExecResult
 * @typedef {{ ok: boolean, output: string }} CheckResult
 * @typedef {{ label: string, skipped: string }
 *   | { label: string, check: () => CheckResult }
 *   | { label: string, command: Command }} Gate
 * @typedef {{ comments: () => Command, deadcode: () => Command, duplication: () => Command }} RepoTools
 * @typedef {RepoTools & { secrets: (files?: string[]) => Command }} Tools
 */

/**
 * @typedef {{ tools: Tools, setup?: string, base?: string, baseline?: string }} ReportInputs
 * @typedef {ReportInputs & {
 *   exec?: (command: string, args: string[]) => ExecResult,
 *   onPath?: (command: string) => boolean,
 * }} ReportOptions
 */

/**
 * @param {string} command Command to run
 * @param {string[]} args Its arguments
 * @returns {ExecResult} Whether it passed, its output without colors, and its duration
 */
const exec = (command, args) => {
  const started = performance.now();
  const result = spawnSync(command, args, { encoding: "utf-8", env, maxBuffer: 64 * 1024 * 1024 });

  const output = strip(
    `${result.stdout ?? ""}${result.stderr ?? ""}${result.error === undefined ? "" : String(result.error)}`,
  );

  return { ok: result.status === 0, output, seconds: (performance.now() - started) / 1000 };
};

/**
 * @param {string} command Command name
 * @returns {boolean} true when the command is on the PATH
 */
const onPath = (command) =>
  spawnSync("sh", ["-c", `command -v ${command}`], { encoding: "utf-8" }).status === 0;

/**
 * Projects that build declare a `build` script (`vp pack`, `astro build`, ...)
 *
 * @returns {boolean} true when package.json has a non-empty `build` script
 */
const hasBuildScript = () => {
  /** @type {unknown} */
  const manifest = JSON.parse(readFileSync("package.json", "utf-8"));
  const scripts = isObject(manifest) ? manifest.scripts : undefined;

  return isObject(scripts) && Boolean(scripts.build);
};

/**
 * @param {string} text Command output
 * @param {number} [lines] Lines to keep
 * @returns {string} Its last non-blank lines
 */
const tail = (text, lines = 80) =>
  text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(-lines)
    .join("\n");

/**
 * Files the branch changes since it left `base` (deleted files excluded), relative to the
 * repository root
 *
 * @param {string} base Git ref to compare with
 * @returns {string[] | undefined} The paths, or undefined when `base` cannot be compared
 */
const changedFiles = (base) => {
  const result = spawnSync("git", ["diff", "--name-only", "--diff-filter=d", `${base}...HEAD`], {
    encoding: "utf-8",
  });

  if (result.status !== 0) {
    console.error(`quality-gate report: cannot compare with ${base}: ${result.stderr.trim()}`);
  }

  return result.status === 0 ? result.stdout.split("\n").filter((line) => line !== "") : undefined;
};

/**
 * Short command for the report: no absolute paths
 *
 * @param {string} command Command
 * @param {string[]} args Its arguments
 * @returns {string} The command line as shown in the report
 */
const display = (command, args) =>
  [command === process.execPath ? "node" : command, ...args]
    .map((part) => part.replace(`${process.cwd()}/`, "").replace(/^.*node_modules\//u, ""))
    .join(" ");

/** @returns {import("./coverage.js").Summary | undefined} The summary the tests wrote, read after they ran */
const currentSummary = () => readSummary("coverage/coverage-summary.json");

/**
 * @param {{ tools: Tools, setup?: string, baseline?: import("./coverage.js").Summary, installed: (command: string) => boolean }} options
 *   The tools, the setup command, the base branch coverage summary, and the PATH lookup
 * @returns {Gate[]} The gates, in the order they run
 */
const gates = ({ tools, setup, baseline, installed }) => [
  ...(setup === undefined || setup === ""
    ? []
    : [{ command: ["sh", ["-c", setup]], label: "Setup" }]),
  { command: ["vp", ["check", "--deny-warnings"]], label: "Format + lint + types" },
  { command: ["vp", ["test", "--coverage"]], label: "Tests + coverage" },
  baseline === undefined
    ? { label: "Coverage (no drop)", skipped: "no base branch coverage" }
    : {
        check: () =>
          coverageCheck({ baseline, current: currentSummary() }) ?? {
            ok: false,
            output: "The tests wrote no coverage summary (coverage/coverage-summary.json).",
          },
        label: "Coverage (no drop)",
      },
  { command: tools.comments(), label: "Comments (no rise)" },
  { command: tools.deadcode(), label: "Dead code / unused deps" },
  { command: tools.duplication(), label: "Duplication" },
  { command: tools.secrets(), label: "Secrets" },
  installed("semgrep")
    ? {
        command: [
          "semgrep",
          [
            "scan",
            "--config",
            "p/typescript",
            "--config",
            "p/nodejs",
            "--error",
            "--metrics",
            "off",
            "--quiet",
          ],
        ],
        label: "SAST (Semgrep)",
      }
    : { label: "SAST (Semgrep)", skipped: "semgrep is not installed" },
  hasBuildScript()
    ? { command: ["vp", ["run", "build"]], label: "Build" }
    : { label: "Build", skipped: "no `build` script" },
];

/**
 * @param {Gate} gate A gate
 * @param {(command: string, args: string[]) => ExecResult} run Runs a command
 * @returns {{ row: string, result?: CheckResult }} Its table row, and its result unless skipped
 */
const runGate = (gate, run) => {
  if ("skipped" in gate) {
    return { row: `| ⏭️ | ${gate.label} | ${gate.skipped} | - |` };
  }

  if ("check" in gate) {
    const result = gate.check();

    return { result, row: `| ${result.ok ? "✅" : "❌"} | ${gate.label} | ${result.output} | - |` };
  }

  const [command, args] = gate.command;
  const result = run(command, args);

  return {
    result,
    row: `| ${result.ok ? "✅" : "❌"} | ${gate.label} | \`${display(command, args)}\` | ${result.seconds.toFixed(1)} s |`,
  };
};

/**
 * Runs every gate. `setup` runs first (e.g. `vp run astro sync` to generate the types
 * `vp check` needs), `base` lists the coverage of the files changed since that git ref, and
 * `baseline` (the base branch's `coverage-summary.json`) adds the coverage change and the gate
 * that fails when line coverage drops. `exec` and `onPath` default to the real commands
 *
 * @param {ReportOptions} options The tools, and the options above
 * @returns {{ markdown: string, failed: boolean }} The report, and whether a gate failed
 */
export const report = ({
  tools,
  setup,
  base,
  baseline,
  exec: run = exec,
  onPath: installed = onPath,
}) => {
  const before = readSummary(baseline);
  const rows = [];
  const details = [];
  let failed = false;

  for (const gate of gates({ baseline: before, installed, setup, tools })) {
    const { row, result } = runGate(gate, run);

    rows.push(row);

    if (result !== undefined && !result.ok) {
      failed = true;

      details.push(
        `<details open><summary>❌ ${gate.label}</summary>\n\n\`\`\`text\n${tail(result.output)}\n\`\`\`\n</details>`,
      );
    }
  }

  const sha = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf-8",
  }).stdout?.trim();

  const verdict = failed ? "❌ **Some quality gates failed**" : "✅ **All quality gates passed**";

  const changed = base === undefined || base === "" ? undefined : changedFiles(base);

  const markdown = [
    MARKER,
    "## Quality report",
    "",
    `${verdict} — \`${sha === undefined || sha === "" ? "local" : sha}\``,
    "",
    "| | Gate | Command | Time |",
    "|---|---|---|---|",
    ...rows,
    "",
    "### Coverage",
    "",
    coverageSection({ baseline: before, changed, current: currentSummary() }),
    "",
    ...details,
    "",
  ].join("\n");

  return { markdown, failed };
};
