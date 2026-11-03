// Runs every gate and renders the Markdown report posted on pull requests.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { stripVTControlCharacters } from "node:util";

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

function coverageTable() {
  const file = "coverage/coverage-summary.json";
  if (!existsSync(file)) return "_No coverage summary._";
  const { total } = JSON.parse(readFileSync(file, "utf8"));
  const cell = (metric) => `${total[metric].pct}%`;
  return [
    "| Lines | Statements | Functions | Branches |",
    "|---|---|---|---|",
    `| ${cell("lines")} | ${cell("statements")} | ${cell("functions")} | ${cell("branches")} |`,
  ].join("\n");
}

const tail = (text, lines = 80) =>
  text
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(-lines)
    .join("\n");

/** Short command for the report: no absolute paths. */
const display = (command, args) =>
  [command === process.execPath ? "node" : command, ...args]
    .map((part) => part.replace(`${process.cwd()}/`, "").replace(/^.*node_modules\//, ""))
    .join(" ");

/** @param {{ tools: Record<string, (...args: any[]) => [string, string[]]> }} options */
export function report({ tools }) {
  const gates = [
    { label: "Format + lint + types", command: ["vp", ["check", "--deny-warnings"]] },
    { label: "Tests + coverage", command: ["vp", ["test", "--coverage"]] },
    { label: "Dead code / unused deps", command: tools.deadcode() },
    { label: "Duplication", command: tools.duplication() },
    { label: "Secrets", command: tools.secrets() },
    onPath("semgrep")
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
    coverageTable(),
    "",
    ...details,
    "",
  ].join("\n");

  return { markdown, failed };
}
