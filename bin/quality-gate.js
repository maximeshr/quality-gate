#!/usr/bin/env node
// quality-gate CLI. Tools are dependencies of quality-gate, resolved from here,
// so projects only add `quality-gate` (pnpm does not link transitive bins).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkChangesets } from "../scripts/changesets.js";
import { releaseNotes } from "../scripts/release-notes.js";
import { report } from "../scripts/report.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Absolute path of a dependency's bin script. */
function toolBin(pkg, name = pkg.split("/").pop()) {
  const manifestPath = findPackageJSON(pkg, import.meta.url);
  if (!manifestPath) throw new Error(`quality-gate: cannot find the ${pkg} package`);
  const { bin } = JSON.parse(readFileSync(manifestPath, "utf8"));
  const relative = typeof bin === "string" ? bin : bin[name];
  return join(dirname(manifestPath), relative);
}

const config = (file) => join(root, "configs", file);
const node = (pkg, args, name) => [process.execPath, [toolBin(pkg, name), ...args]];

/** Commands shared by the report and the individual subcommands. */
const tools = {
  secrets: (files = ["**/*"]) =>
    node("secretlint", [
      "--secretlintrc",
      config("secretlintrc.json"),
      "--no-maskSecrets",
      ...files,
    ]),
  deadcode: () => node("knip", []),
  duplication: () =>
    node("jscpd", ["--config", config("jscpd.json"), "--reporters", "console", "--exit-code", "1"]),
  commitlint: (args) =>
    node("@commitlint/cli", ["--config", config("commitlint.config.js"), ...args], "commitlint"),
};

function run([command, args]) {
  const { status } = spawnSync(command, args, { stdio: "inherit" });
  return status ?? 1;
}

const [subcommand, ...args] = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

switch (subcommand) {
  case "report": {
    const output = args[0] ?? "quality-report.md";
    const { markdown, failed } = report({ tools });
    writeFileSync(output, markdown);
    process.stdout.write(markdown);
    process.exit(failed ? 1 : 0);
  }
  case "secrets":
    process.exit(run(tools.secrets(args.length > 0 ? args : undefined)));
  case "deadcode":
    process.exit(run(tools.deadcode()));
  case "duplication":
    process.exit(run(tools.duplication()));
  case "commitlint":
    process.exit(run(tools.commitlint(args)));
  case "check-changesets": {
    const errors = checkChangesets({ base: option("base", "origin/canary") });
    for (const error of errors) console.error(`✖ ${error}`);
    if (errors.length === 0) console.log("✔ changesets are present and useful");
    process.exit(errors.length === 0 ? 0 : 1);
  }
  case "release-notes": {
    const markdown = releaseNotes({
      from: option("from", "origin/main"),
      to: option("to", "HEAD"),
      repository: option("repo", process.env.GITHUB_REPOSITORY),
    });
    const output = option("output");
    if (output) writeFileSync(output, markdown);
    else process.stdout.write(markdown);
    process.exit(0);
  }
  default:
    console.log(`Usage: quality-gate <command>

  report [file]                 run every gate, write a Markdown report (default quality-report.md)
  secrets [files...]            secretlint with the base config
  deadcode                      knip
  duplication                   jscpd with the base config
  commitlint [args...]          commitlint with the conventional config (e.g. --edit "$1")
  check-changesets [--base ref] fail if the branch adds no useful changeset
  release-notes [--from ref] [--to ref] [--repo owner/name] [--output file]`);
    process.exit(subcommand ? 1 : 0);
}
