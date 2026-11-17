// Runs every gate and renders the Markdown report posted on pull requests
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";

const MARKER = "<!-- quality-gate-report -->";

const env = { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" };
const strip = stripVTControlCharacters;

/**
 * @param {unknown} value Parsed JSON
 * @returns {value is Record<string, unknown>} true for an object or an array
 */
const isObject = (value) => value instanceof Object;

/**
 * @param {string} command Command to run
 * @param {string[]} args Its arguments
 * @returns {{ ok: boolean, output: string, seconds: number }} Exit status, combined output and duration
 */
const exec = (command, args) => {
  const started = performance.now();
  const result = spawnSync(command, args, { encoding: "utf-8", env, maxBuffer: 64 * 1024 * 1024 });

  const output = strip(
    `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error) : ""}`,
  );

  return { ok: result.status === 0, output, seconds: (performance.now() - started) / 1000 };
};

/**
 * @param {string} command Command name
 * @returns {boolean} true when the shell finds it
 */
const onPath = (command) =>
  spawnSync("sh", ["-c", `command -v ${command}`], { encoding: "utf-8" }).status === 0;

/** Projects that build declare a `build` script (`vp pack`, `astro build`, ...) */
const hasBuildScript = () => {
  /** @type {unknown} */
  const manifest = JSON.parse(readFileSync("package.json", "utf-8"));
  const scripts = isObject(manifest) ? manifest.scripts : undefined;

  return isObject(scripts) && Boolean(scripts.build);
};

const coverageTable = () => {
  const file = "coverage/coverage-summary.json";

  if (!existsSync(file)) {
    return "_No coverage summary._";
  }

  /** @type {unknown} */
  const summary = JSON.parse(readFileSync(file, "utf-8"));
  const total = isObject(summary) ? summary.total : undefined;

  /**
   * @param {string} metric Metric of the summary total
   * @returns {string} Its percentage
   */
  const cell = (metric) => {
    const entry = isObject(total) ? total[metric] : undefined;

    return `${String(isObject(entry) ? entry.pct : undefined)}%`;
  };

  return [
    "| Lines | Statements | Functions | Branches |",
    "|---|---|---|---|",
    `| ${cell("lines")} | ${cell("statements")} | ${cell("functions")} | ${cell("branches")} |`,
  ].join("\n");
};

/**
 * @param {string} text Gate output
 * @param {number} [lines] How many non-blank lines to keep
 * @returns {string} The last non-blank lines
 */
const tail = (text, lines = 80) =>
  text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(-lines)
    .join("\n");

/**
 * Short command for the report: no absolute paths
 *
 * @param {string} command Command
 * @param {string[]} args Its arguments
 * @returns {string} The command line to show
 */
const display = (command, args) =>
  [command === process.execPath ? "node" : command, ...args]
    .map((part) => part.replace(`${process.cwd()}/`, "").replace(/^.*node_modules\//u, ""))
    .join(" ");

/**
 * @param {{ tools: Record<string, (...args: any[]) => [string, string[]]>, setup?: string }} options
 *   `setup` runs before the gates (e.g. `vp run astro sync` to generate the types `vp check` needs).
 */
export const report = ({ tools, setup }) => {
  const gates = [
    ...(setup !== undefined && setup !== ""
      ? [{ command: ["sh", ["-c", setup]], label: "Setup" }]
      : []),
    { command: ["vp", ["check", "--deny-warnings"]], label: "Format + lint + types" },
    { command: ["vp", ["test", "--coverage"]], label: "Tests + coverage" },
    { command: tools.deadcode(), label: "Dead code / unused deps" },
    { command: tools.duplication(), label: "Duplication" },
    { command: tools.secrets(), label: "Secrets" },
    onPath("semgrep")
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

  const rows = [];
  const details = [];
  let failed = false;

  for (const gate of gates) {
    if (gate.skipped !== undefined) {
      rows.push(`| ⏭️ | ${gate.label} | ${gate.skipped} | - |`);
      continue;
    }

    const [command, args] = gate.command;
    const result = exec(command, args);
    const shown = display(command, args);
    rows.push(
      `| ${result.ok ? "✅" : "❌"} | ${gate.label} | \`${shown}\` | ${result.seconds.toFixed(1)} s |`,
    );

    if (!result.ok) {
      failed = true;
      details.push(
        `<details open><summary>❌ ${gate.label}</summary>\n\n\`\`\`text\n${tail(result.output)}\n\`\`\`\n</details>`,
      );
    }
  }

  const sha =
    spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
    "local";

  const verdict = failed ? "❌ **Some quality gates failed**" : "✅ **All quality gates passed**";

  const markdown = [
    MARKER,
    "## Quality report",
    "",
    `${verdict} — \`${sha}\``,
    "",
    "| | Gate | Command | Time |",
    "|---|---|---|---|",
    ...rows,
    "",
    "### Coverage",
    "",
    coverageTable(),
    "",
    ...details,
    "",
  ].join("\n");

  return { failed, markdown };
};
