// Release notes for the canary → main pull request and the GitHub release:
// pending changesets grouped by bump, then the pull requests and commits in the range
import { spawnSync } from "node:child_process";

import { pendingChangesets } from "./changesets.js";

/** @type {[string, string][]} */
const GROUPS = [
  ["major", "Major changes"],
  ["minor", "Minor changes"],
  ["patch", "Patch changes"],
];

/**
 * @typedef {{ number: string, title: string, author: string }} PullRequest
 * @typedef {(repository: string, sha: string) => string | undefined} PullsLookup
 */

/**
 * @param {string[]} args Git arguments
 * @returns {string} Its trimmed output, empty when git fails
 */
const git = (args) => {
  const result = spawnSync("git", args, { encoding: "utf-8" });

  return result.status === 0 ? result.stdout.trim() : "";
};

/**
 * Pull requests of a commit, through the GitHub API (needs `gh`)
 *
 * @type {PullsLookup}
 * @returns {string | undefined} One `number<TAB>title<TAB>author<TAB>base` line each, or undefined when the call fails
 */
const githubPulls = (repository, sha) => {
  const result = spawnSync(
    "gh",
    [
      "api",
      `repos/${repository}/commits/${sha}/pulls`,
      "--jq",
      ".[] | [.number, .title, .user.login, .base.ref] | @tsv",
    ],
    { encoding: "utf-8" },
  );

  return result.status === 0 ? result.stdout : undefined;
};

/**
 * Pull requests behind the commits of the range, release pull requests (into main) excluded
 *
 * @param {string[]} shas Commits of the range
 * @param {string | undefined} repository GitHub `owner/name`
 * @param {PullsLookup} pulls Looks up the pull requests of a commit
 * @returns {PullRequest[]} The pull requests, sorted by number
 */
const pullRequests = (shas, repository, pulls) => {
  if (repository === undefined || repository === "") {
    return [];
  }

  /** @type {Map<string, PullRequest>} */
  const seen = new Map();

  for (const sha of shas) {
    const output = pulls(repository, sha) ?? "";

    for (const line of output.split("\n").filter((entry) => entry !== "")) {
      const [number = "", title = "", author = "", baseRef = ""] = line.split("\t");

      if (baseRef !== "main" && !seen.has(number)) {
        seen.set(number, { author, number, title });
      }
    }
  }

  return [...seen.values()].toSorted((a, b) => Number(a.number) - Number(b.number));
};

/**
 * @returns {string[]} The pending changesets, grouped by bump
 */
const changesetLines = () => {
  const changesets = pendingChangesets();
  const lines = [];

  for (const [type, title] of GROUPS) {
    const entries = changesets.filter(({ releases }) =>
      releases.some((release) => release.type === type),
    );

    if (entries.length > 0) {
      lines.push(`### ${title}`, "");

      for (const { summary } of entries) {
        const [first, ...rest] = summary.split("\n");

        lines.push(`- ${first}`, ...rest.map((line) => (line.trim() === "" ? "" : `  ${line}`)));
      }

      lines.push("");
    }
  }

  if (changesets.length === 0) {
    lines.push("_No pending changeset._", "");
  }

  return lines;
};

/**
 * @param {{ from: string, to: string, repository?: string, pulls?: PullsLookup }} options The
 *   range, the GitHub `owner/name`, and the pull requests lookup (the GitHub API through `gh`)
 * @returns {string} The Markdown release notes
 */
export const releaseNotes = ({ from, to, repository, pulls = githubPulls }) => {
  const lines = ["## Release notes", "", ...changesetLines()];

  const log = git(["log", "--no-merges", "--format=%H%x09%h%x09%s%x09%an", `${from}..${to}`]);
  const commits = log === "" ? [] : log.split("\n").map((line) => line.split("\t"));

  const prs = pullRequests(
    commits.map(([sha = ""]) => sha),
    repository,
    pulls,
  );

  if (prs.length > 0) {
    lines.push("### Pull requests", "");

    for (const { number, title, author } of prs) {
      lines.push(`- #${number} ${title} (${author})`);
    }

    lines.push("");
  }

  lines.push("### Commits", "");

  if (commits.length === 0) {
    lines.push("_No commit._");
  }

  for (const [, short = "", subject = "", author = ""] of commits) {
    lines.push(`- \`${short}\` ${subject} (${author})`);
  }

  lines.push("");

  return lines.join("\n");
};
