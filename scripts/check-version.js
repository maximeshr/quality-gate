// Versions are bumped by changesets only. The version in package.json must either be
// published already, or come from `changeset version`, which adds its heading to CHANGELOG.md.
// A hand-edited version has neither and fails.
import { existsSync, readFileSync } from "node:fs";

/**
 * @param {{ cwd?: string, fetch?: typeof globalThis.fetch }} [options]
 * @returns {Promise<string | undefined>} the error, or undefined when the version is fine
 */
export async function checkVersion({ cwd = process.cwd(), fetch = globalThis.fetch } = {}) {
  const { name, version } = JSON.parse(readFileSync(`${cwd}/package.json`, "utf8"));
  const changelog = existsSync(`${cwd}/CHANGELOG.md`)
    ? readFileSync(`${cwd}/CHANGELOG.md`, "utf8")
    : "";
  if (changelog.split("\n").includes(`## ${version}`)) return undefined;

  const response = await fetch(`https://registry.npmjs.org/${name}/${version}`);
  if (response.ok) return undefined;
  if (response.status !== 404)
    throw new Error(`npm registry answered ${response.status} for ${name}@${version}`);

  return (
    `${name}@${version} is neither published nor in CHANGELOG.md.\n` +
    "Do not edit the version or create release tags by hand: add a changeset with\n" +
    "`vp exec changeset`, and the release workflow versions the package."
  );
}
