#!/usr/bin/env node
// quality-gate CLI. Tools are dependencies of quality-gate, resolved from here,
// so projects only add `quality-gate` (pnpm does not link transitive bins)
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { findPackageJSON } from "node:module";
import path from "node:path";

import { checkChangesets, isInternal } from "../scripts/changesets.js";
import { checkPackage } from "../scripts/check-package.js";
import { checkVersion } from "../scripts/check-version.js";
import { releaseNotes } from "../scripts/release-notes.js";
import { report } from "../scripts/report.js";

const root = path.join(import.meta.dirname, "..");

/**
 * @param {unknown} value Parsed JSON
 * @returns {value is Record<string, unknown>} true for an object or an array
 */
const isObject = (value) => value instanceof Object;

/**
 * @param {unknown} value Parsed JSON
 * @returns {value is string} true for a string
 */
const isString = (value) => String(value) === value;

/**
 * Absolute path of a dependency's bin script
 *
 * @param {string} pkg Package name
 * @param {string} [name] Bin name, for a package with several bins
 * @returns {string} The path of the bin script
 */
const toolBin = (pkg, name = pkg.split("/").pop()) => {
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

const [subcommand = "", ...args] = process.argv.slice(2);

/**
 * @param {string} name Option name, without `--`
 * @param {string} [fallback] Value when the option is absent
 * @returns {string | undefined} The value after the option
 */
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);

  return index === -1 ? fallback : args[index + 1];
};

switch (subcommand) {
  case "report": {
    const [first] = args;

    const output =
      first !== undefined && first !== "" && !first.startsWith("--") ? first : "quality-report.md";

    const { markdown, failed } = report({ setup: option("setup"), tools });
    writeFileSync(output, markdown);
    process.stdout.write(markdown);
    process.exit(failed ? 1 : 0);
    break;
  }

  case "secrets": {
    process.exit(run(tools.secrets(args.length > 0 ? args : undefined)));
    break;
  }

  case "deadcode": {
    process.exit(run(tools.deadcode()));
    break;
  }

  case "duplication": {
    process.exit(run(tools.duplication()));
    break;
  }

  case "commitlint": {
    process.exit(run(tools.commitlint(args)));
    break;
  }

  case "check-changesets": {
    const title = option("title");
    const errors = checkChangesets({ base: option("base", "origin/canary"), title });

    for (const error of errors) {
      console.error(`✖ ${error}`);
    }

    if (errors.length === 0) {
      console.log(
        isInternal(title)
          ? "✔ internal pull request (ci, build, test, docs, chore): no changeset required"
          : "✔ changesets are present and useful",
      );
    }

    process.exit(errors.length === 0 ? 0 : 1);
    break;
  }

  case "check-version": {
    const error = await checkVersion();

    if (error !== undefined) {
      console.error(error);
    }

    process.exit(error === undefined ? 0 : 1);
    break;
  }

  case "check-package": {
    const ok = await checkPackage({
      attwBin: toolBin("@arethetypeswrong/cli", "attw"),
      profile: option("profile", "esm-only"),
    });

    process.exit(ok ? 0 : 1);
    break;
  }

  case "release-notes": {
    const markdown = releaseNotes({
      from: option("from", "origin/main"),
      repository: option("repo", process.env.GITHUB_REPOSITORY),
      to: option("to", "HEAD"),
    });

    const output = option("output");

    if (output !== undefined && output !== "") {
      writeFileSync(output, markdown);
    } else {
      process.stdout.write(markdown);
    }

    process.exit(0);
    break;
  }

  default: {
    console.log(`Usage: quality-gate <command>

  report [file] [--setup "cmd"] run every gate, write a Markdown report (default quality-report.md);
                                --setup runs first, e.g. to generate framework types
  secrets [files...]            secretlint with the base config
  deadcode                      knip
  duplication                   jscpd with the base config
  commitlint [args...]          commitlint with the conventional config (e.g. --edit "$1")
  check-changesets [--base ref] [--title "PR title"]
                                fail if the branch adds no useful changeset (internal PRs exempt)
  check-version                 fail if the package.json version was edited by hand
  check-package [--profile p]   pack, then publint (strict) and attw (default profile esm-only)
  release-notes [--from ref] [--to ref] [--repo owner/name] [--output file]`);
    process.exit(subcommand === "" ? 0 : 1);
  }
}
