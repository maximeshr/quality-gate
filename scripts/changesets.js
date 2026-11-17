// Changeset helpers: read pending changesets, and check that a branch adds useful ones
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIN_SUMMARY_LENGTH = 20;
const BUMPS = new Set(["major", "minor", "patch"]);

/**
 * Parses a changeset file: YAML-like front matter of `"pkg": bump` lines, then the summary.
 * @param {string} text Raw content of the changeset file
 * @returns {{ releases: { name: string, type: string }[], summary: string }} The bumps and the summary
 */
export const parseChangeset = (text) => {
  const groups = /^---\r?\n(?<front>[\s\S]*?)\r?\n?---\r?\n?(?<summary>[\s\S]*)$/u.exec(
    text.trimStart(),
  )?.groups;

  if (groups === undefined) {
    return { releases: [], summary: text.trim() };
  }

  const releases = (groups.front ?? "").split("\n").flatMap((line) => {
    const release = /^\s*["']?(?<name>[^"':]+)["']?\s*:\s*(?<type>\w+)\s*$/u.exec(line)?.groups;

    return release === undefined
      ? []
      : [{ name: (release.name ?? "").trim(), type: release.type ?? "" }];
  });

  return { releases, summary: (groups.summary ?? "").trim() };
};

/** Pending changesets in `.changeset/` (README.md and config excluded) */
export const pendingChangesets = (dir = ".changeset") => {
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((file) => file.endsWith(".md") && file !== "README.md")
    .map((file) => ({
      file: path.join(dir, file),
      ...parseChangeset(readFileSync(path.join(dir, file), "utf-8")),
    }));
};

/**
 * Internal pull requests (CI, tooling, docs) need no changeset: Conventional Commits types
 * `ci`, `build`, `test`, `docs` and `chore`. `chore(deps)` is not internal: a runtime
 * dependency update reaches users (`chore(deps-dev)` does not).
 */
export const isInternal = (title = "") => {
  const groups = /^(?<type>\w+)(?:\((?<scope>[^)]*)\))?!?:/u.exec(title.trim())?.groups;

  if (groups === undefined) {
    return false;
  }

  const { type, scope } = groups;

  if (type === "chore") {
    return scope !== "deps";
  }

  return ["ci", "build", "test", "docs"].includes(type ?? "");
};

/**
 * Errors for the changesets added on this branch compared to `base`, empty when they are fine.
 * An internal pull request (see `isInternal`) may add none, but what it adds is still checked.
 *
 * @param {{ base: string, title?: string }} options Base ref to diff against, and the pull request title
 * @returns {string[]} One message per problem
 */
export const checkChangesets = ({ base, title }) => {
  const diff = spawnSync(
    "git",
    ["diff", "--name-only", "--diff-filter=AM", `${base}...HEAD`, "--", ".changeset/"],
    {
      encoding: "utf-8",
    },
  );

  if (diff.status !== 0) {
    return [`git diff against ${base} failed: ${diff.stderr.trim()}`];
  }

  const files = diff.stdout
    .split("\n")
    .filter((file) => file.endsWith(".md") && !file.endsWith("README.md"));

  if (files.length === 0) {
    if (isInternal(title)) {
      return [];
    }

    return [
      `This pull request adds no changeset. Run \`vp exec changeset\`, pick the bump, and describe the change for a user (at least ${MIN_SUMMARY_LENGTH} characters).`,
    ];
  }

  const errors = [];

  for (const file of files) {
    const { releases, summary } = parseChangeset(readFileSync(file, "utf-8"));

    if (releases.length === 0) {
      errors.push(`${file}: no package bump (empty changeset).`);
    }

    for (const { name, type } of releases) {
      if (!BUMPS.has(type)) {
        errors.push(`${file}: "${name}" has an unknown bump "${type}".`);
      }
    }

    if (summary.length < MIN_SUMMARY_LENGTH) {
      errors.push(
        `${file}: the summary is too short (${summary.length} < ${MIN_SUMMARY_LENGTH} characters). Explain the change for a user.`,
      );
    }
  }

  return errors;
};
