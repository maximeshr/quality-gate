// Release notes for the canary → main pull request and the GitHub release:
// pending changesets grouped by bump, then the pull requests and commits in the range.
import { spawnSync } from "node:child_process";

import { pendingChangesets } from "./changesets.js";

const GROUPS = [
  ["major", "Major changes"],
  ["minor", "Minor changes"],
  ["patch", "Patch changes"],
];

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

/**
 * Pull requests of a commit, through the GitHub API (needs `gh`): one
 * `number<TAB>title<TAB>author<TAB>base` line each, or undefined when the call fails.
 */
function githubPulls(repository, sha) {
  const result = spawnSync(
    "gh",
    [
      "api",
      `repos/${repository}/commits/${sha}/pulls`,
      "--jq",
      ".[] | [.number, .title, .user.login, .base.ref] | @tsv",
    ],
    { encoding: "utf8" },
  );
  return result.status === 0 ? result.stdout : undefined;
}

/** Pull requests behind the commits of the range, release pull requests (into main) excluded. */
function pullRequests(shas, repository, pulls) {
  if (!repository) return [];
  const seen = new Map();
  for (const sha of shas) {
    const output = pulls(repository, sha);
    if (output === undefined) continue;
    for (const line of output.split("\n").filter(Boolean)) {
      const [number, title, author, baseRef] = line.split("\t");
      if (baseRef === "main" || seen.has(number)) continue;
      seen.set(number, { number, title, author });
    }
  }
  return [...seen.values()].sort((a, b) => Number(a.number) - Number(b.number));
}

/**
 * @param {{ from: string, to: string, repository?: string, pulls?: typeof githubPulls }} options
 *   `pulls` defaults to the GitHub API through `gh`.
 */
export function releaseNotes({ from, to, repository, pulls = githubPulls }) {
  const changesets = pendingChangesets();
  const lines = ["## Release notes", ""];

  for (const [type, title] of GROUPS) {
    const entries = changesets.filter(({ releases }) =>
      releases.some((release) => release.type === type),
    );
    if (entries.length === 0) continue;
    lines.push(`### ${title}`, "");
    for (const { summary } of entries) {
      const [first, ...rest] = summary.split("\n");
      lines.push(`- ${first}`, ...rest.map((line) => (line.trim() ? `  ${line}` : "")));
    }
    lines.push("");
  }
  if (changesets.length === 0) lines.push("_No pending changeset._", "");

  const log = git(["log", "--no-merges", "--format=%H%x09%h%x09%s%x09%an", `${from}..${to}`]);
  const commits = log ? log.split("\n").map((line) => line.split("\t")) : [];

  const prs = pullRequests(
    commits.map(([sha]) => sha),
    repository,
    pulls,
  );
  if (prs.length > 0) {
    lines.push("### Pull requests", "");
    for (const { number, title, author } of prs) lines.push(`- #${number} ${title} (${author})`);
    lines.push("");
  }

  lines.push("### Commits", "");
  if (commits.length === 0) lines.push("_No commit._");
  for (const [, short, subject, author] of commits)
    lines.push(`- \`${short}\` ${subject} (${author})`);
  lines.push("");
  return lines.join("\n");
}
