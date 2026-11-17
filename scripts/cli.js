// quality-gate CLI commands. Tools are dependencies of quality-gate, resolved from here,
// so projects only add `quality-gate` (pnpm does not link transitive bins)
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import path from "node:path";
import { parseArgs } from "node:util";

import { checkChangesets, isInternal } from "./changesets.js";
import { checkPackage } from "./check-package.js";
import { checkVersion } from "./check-version.js";
import { isObject, isString } from "./guards.js";
import { releaseNotes } from "./release-notes.js";
import { report } from "./report.js";

const root = path.join(import.meta.dirname, "..");

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

/**
 * Absolute path of a dependency's bin script
 *
 * @param {string} pkg Package name
 * @param {string} [name] Bin name, for a package with several bins
 * @returns {string} The path of the bin script
 */
export const toolBin = (pkg, name = pkg.split("/").pop()) => {
  const manifestPath = findPackageJSON(pkg, import.meta.url);

  if (manifestPath === undefined || manifestPath === "") {
    throw new Error(`quality-gate: cannot find the ${pkg} package`);
  }

  /** @type {unknown} */
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const bin = isObject(manifest) ? manifest.bin : undefined;
  const relative = isObject(bin) && name !== undefined ? bin[name] : bin;

  if (!isString(relative)) {
    throw new Error(`quality-gate: the ${pkg} package has no ${name} bin`);
  }

  return path.join(path.dirname(manifestPath), relative);
};

/**
 * @param {string} file Config file name
 * @returns {string} Its path in quality-gate
 */
const config = (file) => path.join(root, "configs", file);

/**
 * @param {string} pkg Package name
 * @param {string[]} args Arguments
 * @param {string} [name] Bin name, for a package with several bins
 * @returns {[string, string[]]} Command and arguments running the bin with this Node
 */
const node = (pkg, args, name) => [process.execPath, [toolBin(pkg, name), ...args]];

/** Commands shared by the report and the individual subcommands */
const tools = {
  /** @param {string[]} args Arguments for commitlint */
  commitlint: (args) =>
    node("@commitlint/cli", ["--config", config("commitlint.config.js"), ...args], "commitlint"),
  deadcode: () => node("knip", []),
  duplication: () =>
    // No --exit-code: jscpd then fails only above the config threshold (5 %), not on every clone
    node("jscpd", ["--config", config("jscpd.json"), "--reporters", "console"]),
  /** @param {string[]} [files] Files to scan */
  secrets: (files = ["**/*"]) =>
    node("secretlint", [
      "--secretlintrc",
      config("secretlintrc.json"),
      "--no-maskSecrets",
      ...files,
    ]),
};

/**
 * @param {[string, string[]]} tool Command and arguments
 * @returns {number} The exit code
 */
const run = ([command, args]) => {
  const { status } = spawnSync(command, args, { stdio: "inherit" });

  return status ?? 1;
};

/** @type {{ type: "string" }} */
const string = { type: "string" };

/**
 * Options of each command that parses its own. `secrets` and `commitlint` pass their
 * arguments through to the tool untouched
 *
 * @type {Record<string, { options?: Record<string, { type: "string" }>, positionals?: number }>}
 */
const COMMANDS = {
  "check-changesets": { options: { base: string, title: string } },
  "check-package": { options: { profile: string } },
  "check-version": {},
  deadcode: {},
  duplication: {},
  "release-notes": { options: { from: string, output: string, repo: string, to: string } },
  report: { options: { base: string, baseline: string, setup: string }, positionals: 1 },
};

/** @typedef {Record<string, string | undefined>} Values Option values, by option name */

/**
 * Parses a command's arguments: unknown options and extra arguments are errors.
 *
 * @param {string} command A command of `COMMANDS`
 * @param {string[]} args Its arguments
 * @returns {{ values: Values, positionals: string[] }} The option values and the positional arguments
 */
export const parseCommand = (command, args) => {
  const spec = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;

  if (spec === undefined) {
    throw new TypeError(`Unknown command '${command}'`);
  }

  const { options = {}, positionals: max = 0 } = spec;

  const { values, positionals } = parseArgs({
    allowPositionals: max > 0,
    args,
    options,
    strict: true,
  });

  if (positionals.length > max) {
    throw new TypeError(`Unexpected argument '${positionals[max]}'`);
  }

  return { values, positionals };
};

/**
 * @param {Values} values Options of `report`
 * @param {string[]} positionals Its output file, if any
 * @returns {number} The exit code
 */
const reportCommand = (values, positionals) => {
  const output = positionals[0] ?? "quality-report.md";
  const { setup, base, baseline } = values;
  const { markdown, failed } = report({ base, baseline, setup, tools });

  writeFileSync(output, markdown);
  process.stdout.write(markdown);

  return failed ? 1 : 0;
};

/**
 * @param {Values} values Options of `check-changesets`
 * @returns {number} The exit code
 */
const checkChangesetsCommand = (values) => {
  const { title, base = "origin/canary" } = values;
  const errors = checkChangesets({ base, title });

  for (const error of errors) {
    console.error(`✖ ${error}`);
  }

  if (errors.length > 0) {
    return 1;
  }

  console.log(
    isInternal(title)
      ? "✔ internal pull request (ci, build, test, docs, chore): no changeset required"
      : "✔ changesets are present and useful",
  );

  return 0;
};

/** @returns {Promise<number>} The exit code of `check-version` */
const checkVersionCommand = async () => {
  const error = await checkVersion();

  if (error !== undefined) {
    console.error(error);

    return 1;
  }

  return 0;
};

/**
 * @param {Values} values Options of `check-package`
 * @returns {Promise<number>} The exit code
 */
const checkPackageCommand = async (values) => {
  const ok = await checkPackage({
    attwBin: toolBin("@arethetypeswrong/cli", "attw"),
    profile: values.profile ?? "esm-only",
  });

  return ok ? 0 : 1;
};

/**
 * @param {Values} values Options of `release-notes`
 * @returns {number} The exit code
 */
const releaseNotesCommand = (values) => {
  const markdown = releaseNotes({
    from: values.from ?? "origin/main",
    repository: values.repo ?? process.env.GITHUB_REPOSITORY,
    to: values.to ?? "HEAD",
  });

  if (values.output !== undefined && values.output !== "") {
    writeFileSync(values.output, markdown);
  } else {
    process.stdout.write(markdown);
  }

  return 0;
};

/**
 * @param {string} command A command of `COMMANDS`
 * @param {{ values: Values, positionals: string[] }} parsed Its parsed arguments
 * @returns {Promise<number>} The exit code
 */
const runCommand = async (command, { values, positionals }) => {
  switch (command) {
    case "report": {
      return reportCommand(values, positionals);
    }

    case "deadcode": {
      return run(tools.deadcode());
    }

    case "duplication": {
      return run(tools.duplication());
    }

    case "check-changesets": {
      return checkChangesetsCommand(values);
    }

    case "check-version": {
      return await checkVersionCommand();
    }

    case "check-package": {
      return await checkPackageCommand(values);
    }

    case "release-notes": {
      return releaseNotesCommand(values);
    }

    default: {
      return 0;
    }
  }
};

/**
 * Runs one CLI command.
 *
 * @param {string[]} argv The arguments after the executable and script
 * @returns {Promise<number>} The exit code
 */
export const main = async (argv) => {
  const [command = "", ...args] = argv;

  if (command === "secrets") {
    return run(tools.secrets(args.length > 0 ? args : undefined));
  }

  if (command === "commitlint") {
    return run(tools.commitlint(args));
  }

  if (!Object.hasOwn(COMMANDS, command)) {
    if (command !== "" && command !== "help" && command !== "--help") {
      console.error(`quality-gate: unknown command '${command}'\n`);
      console.error(USAGE);

      return 1;
    }

    console.log(USAGE);

    return 0;
  }

  /** @type {{ values: Values, positionals: string[] }} */
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

  return await runCommand(command, parsed);
};
