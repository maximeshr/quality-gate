// Runs every gate and renders the Markdown report posted on pull requests.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";

import { coverageCheck, coverageSection, readSummary } from "./coverage.js";

const MARKER = "<!-- quality-gate-report -->";

const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
const strip = stripVTControlCharacters;

function exec(command, args) {
  const started = performance.now();
  const result = spawnSync(command, args, { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const output = strip(
    `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? String(result.error) : ""}`,
  );
  return { ok: result.status === 0, output, seconds: (performance.now() - started) / 1000 };
}

function onPath(command) {
  return spawnSync("sh", ["-c", `command -v ${command}`], { encoding: "utf8" }).status === 0;
}

/** Projects that build declare a `build` script (`vp pack`, `astro build`, ...). */
function hasBuildScript() {
  const manifest = JSON.parse(readFileSync("package.json", "utf8"));
  return Boolean(manifest.scripts?.build);
}

const tail = (text, lines = 80) =>
  text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(-lines)
    .join("\n");

/**
 * Files the branch changes since it left `base` (deleted files excluded), relative to the
 * repository root. Undefined when `base` cannot be compared.
 */
function changedFiles(base) {
  const result = spawnSync("git", ["diff", "--name-only", "--diff-filter=d", `${base}...HEAD`], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    console.error(`quality-gate report: cannot compare with ${base}: ${result.stderr.trim()}`);
    return undefined;
  }
  return result.stdout.split("\n").filter(Boolean);
}

/** Short command for the report: no absolute paths. */
const display = (command, args) =>
  [command === process.execPath ? "node" : command, ...args]
    .map((part) => part.replace(`${process.cwd()}/`, "").replace(/^.*node_modules\//, ""))
    .join(" ");

/**
 * @param {{
 *   tools: Record<string, (...args: any[]) => [string, string[]]>,
 *   setup?: string,
 *   exec?: (command: string, args: string[]) => { ok: boolean, output: string, seconds: number },
 *   onPath?: (command: string) => boolean,
 *   base?: string,
 *   baseline?: string,
 * }} options
 *   `setup` runs before the gates (e.g. `vp run astro sync` to generate the types `vp check` needs).
 *   `base`: the git ref the branch is compared with (lists the coverage of the changed files).
 *   `baseline`: the base branch's `coverage-summary.json` (coverage change, and the gate that
 *   fails when line coverage drops).
 *   `exec` and `onPath` default to running the real commands.
 */
export function report({
  tools,
  setup,
  base,
  baseline,
  exec: run = exec,
  onPath: installed = onPath,
}) {
  const before = readSummary(baseline);
  /** Read after the tests ran. */
  const current = () => readSummary("coverage/coverage-summary.json");
  const gates = [
    ...(setup ? [{ label: "Setup", command: ["sh", ["-c", setup]] }] : []),
    { label: "Format + lint + types", command: ["vp", ["check", "--deny-warnings"]] },
    { label: "Tests + coverage", command: ["vp", ["test", "--coverage"]] },
    before
      ? {
          label: "Coverage (no drop)",
          check: () =>
            coverageCheck({ current: current(), baseline: before }) ?? {
              ok: false,
              output: "The tests wrote no coverage summary (coverage/coverage-summary.json).",
            },
        }
      : { label: "Coverage (no drop)", skipped: "no base branch coverage" },
    { label: "Dead code / unused deps", command: tools.deadcode() },
    { label: "Duplication", command: tools.duplication() },
    { label: "Secrets", command: tools.secrets() },
    installed("semgrep")
      ? {
          label: "SAST (Semgrep)",
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
        }
      : { label: "SAST (Semgrep)", skipped: "semgrep is not installed" },
    hasBuildScript()
      ? { label: "Build", command: ["vp", ["run", "build"]] }
      : { label: "Build", skipped: "no `build` script" },
  ];

  const rows = [];
  const details = [];
  let failed = false;

  for (const gate of gates) {
    if (gate.skipped) {
      rows.push(`| ⏭️ | ${gate.label} | ${gate.skipped} | - |`);
      continue;
    }
    let result;
    if (gate.check) {
      result = gate.check();
      rows.push(`| ${result.ok ? "✅" : "❌"} | ${gate.label} | ${result.output} | - |`);
    } else {
      const [command, args] = gate.command;
      result = run(command, args);
      rows.push(
        `| ${result.ok ? "✅" : "❌"} | ${gate.label} | \`${display(command, args)}\` | ${result.seconds.toFixed(1)} s |`,
      );
    }
    if (!result.ok) {
      failed = true;
      details.push(
        `<details open><summary>❌ ${gate.label}</summary>\n\n\`\`\`text\n${tail(result.output)}\n\`\`\`\n</details>`,
      );
    }
  }

  const sha =
    spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).stdout?.trim() ||
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
    coverageSection({ current: current(), baseline: before, changed: base && changedFiles(base) }),
    "",
    ...details,
    "",
  ].join("\n");

  return { markdown, failed };
}
