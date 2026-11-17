// quality-gate CLI commands. Tools are dependencies of quality-gate, resolved from here,
// so projects only add `quality-gate` (pnpm does not link transitive bins).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { checkChangesets, isInternal } from "./changesets.js";
import { checkPackage } from "./check-package.js";
import { checkVersion } from "./check-version.js";
import { releaseNotes } from "./release-notes.js";
import { report } from "./report.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const USAGE = `Usage: quality-gate <command>

  report [file] [--setup "cmd"] [--base ref] [--baseline coverage-summary.json]
                                run every gate, write a Markdown report (default quality-report.md);
                                --setup runs first, e.g. to generate framework types;
                                --base lists the coverage of the files changed since that ref;
                                --baseline compares the coverage with the base branch's summary
                                and fails when line coverage drops by more than 0.5 point
  secrets [files...]            secretlint with the base config
  deadcode                      knip
  duplication                   jscpd with the base config
  commitlint [args...]          commitlint with the conventional config (e.g. --edit "$1")
  check-changesets [--base ref] [--title "PR title"]
                                fail if the branch adds no useful changeset (internal PRs exempt)
  check-version                 fail if the package.json version was edited by hand
  check-package [--profile p]   pack, then publint (strict) and attw (default profile esm-only)
  release-notes [--from ref] [--to ref] [--repo owner/name] [--output file]`;

/** Absolute path of a dependency's bin script. */
export function toolBin(pkg, name = pkg.split("/").pop()) {
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
    // No --exit-code: jscpd then fails only above the config threshold (5 %), not on every clone.
    node("jscpd", ["--config", config("jscpd.json"), "--reporters", "console"]),
  commitlint: (args) =>
    node("@commitlint/cli", ["--config", config("commitlint.config.js"), ...args], "commitlint"),
};

function run([command, args]) {
  const { status } = spawnSync(command, args, { stdio: "inherit" });
  return status ?? 1;
}

const string = { type: "string" };

/**
 * Options of each command that parses its own. `secrets` and `commitlint` pass their
 * arguments through to the tool untouched.
 * @type {Record<string, { options?: Record<string, { type: "string" }>, positionals?: number }>}
 */
const COMMANDS = {
  report: { options: { setup: string, base: string, baseline: string }, positionals: 1 },
  deadcode: {},
  duplication: {},
  "check-changesets": { options: { base: string, title: string } },
  "check-version": {},
  "check-package": { options: { profile: string } },
  "release-notes": { options: { from: string, to: string, repo: string, output: string } },
};

/** Parses a command's arguments: unknown options and extra arguments are errors. */
export function parseCommand(command, args) {
  const { options = {}, positionals: max = 0 } = COMMANDS[command];
  const { values, positionals } = parseArgs({
    args,
    options,
    allowPositionals: max > 0,
    strict: true,
  });
  if (positionals.length > max) {
    throw new TypeError(`Unexpected argument '${positionals[max]}'`);
  }
  return { values, positionals };
}

/**
 * Runs one CLI command.
 * @param {string[]} argv the arguments after the executable and script
 * @returns {Promise<number>} the exit code
 */
export async function main(argv) {
  const [command, ...args] = argv;

  if (command === "secrets") return run(tools.secrets(args.length > 0 ? args : undefined));
  if (command === "commitlint") return run(tools.commitlint(args));
  if (!command || !(command in COMMANDS)) {
    if (command && command !== "help" && command !== "--help") {
      console.error(`quality-gate: unknown command '${command}'\n`);
      console.error(USAGE);
      return 1;
    }
    console.log(USAGE);
    return 0;
  }

  let parsed;
  try {
    parsed = parseCommand(command, args);
  } catch (error) {
    console.error(
      `quality-gate ${command}: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    console.error(USAGE);
    return 1;
  }
  const { values, positionals } = parsed;

  switch (command) {
    case "report": {
      const output = positionals[0] ?? "quality-report.md";
      const { setup, base, baseline } = values;
      const { markdown, failed } = report({ tools, setup, base, baseline });
      writeFileSync(output, markdown);
      process.stdout.write(markdown);
      return failed ? 1 : 0;
    }
    case "deadcode":
      return run(tools.deadcode());
    case "duplication":
      return run(tools.duplication());
    case "check-changesets": {
      const { title, base = "origin/canary" } = values;
      const errors = checkChangesets({ base, title });
      for (const error of errors) console.error(`✖ ${error}`);
      if (errors.length > 0) return 1;
      console.log(
        isInternal(title)
          ? "✔ internal pull request (ci, build, test, docs, chore): no changeset required"
          : "✔ changesets are present and useful",
      );
      return 0;
    }
    case "check-version": {
      const error = await checkVersion();
      if (error) console.error(error);
      return error ? 1 : 0;
    }
    case "check-package": {
      const ok = await checkPackage({
        attwBin: toolBin("@arethetypeswrong/cli", "attw"),
        profile: values.profile ?? "esm-only",
      });
      return ok ? 0 : 1;
    }
    case "release-notes": {
      const markdown = releaseNotes({
        from: values.from ?? "origin/main",
        to: values.to ?? "HEAD",
        repository: values.repo ?? process.env.GITHUB_REPOSITORY,
      });
      if (values.output) writeFileSync(values.output, markdown);
      else process.stdout.write(markdown);
      return 0;
    }
  }
  return 0;
}
