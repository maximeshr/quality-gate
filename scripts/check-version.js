// Versions are bumped by changesets only. The version in package.json must either be
// published already, or come from `changeset version`, which adds its heading to CHANGELOG.md
// A hand-edited version has neither and fails
import { existsSync, readFileSync } from "node:fs";

/**
 * @param {unknown} value Parsed JSON
 * @returns {value is Record<string, unknown>} true for an object or an array
 */
const isObject = (value) => value instanceof Object;

/**
 * Whether the npm registry has this version, throwing when it cannot tell.
 *
 * @param {typeof globalThis.fetch} fetch Fetch implementation
 * @param {string} name Package name
 * @param {string} version Package version
 * @returns {Promise<boolean>} true when the version is published
 */
const isPublished = async (fetch, name, version) => {
  const response = await fetch(`https://registry.npmjs.org/${name}/${version}`);

  if (response.ok) {
    return true;
  }

  if (response.status !== 404) {
    throw new Error(`npm registry answered ${response.status} for ${name}@${version}`);
  }

  return false;
};

/**
 * @param {{ cwd?: string, fetch?: typeof globalThis.fetch }} [options] Project directory, and the fetch used to query npm
 * @returns {Promise<string | undefined>} the error, or undefined when the version is fine
 */
export const checkVersion = async ({ cwd = process.cwd(), fetch = globalThis.fetch } = {}) => {
  /** @type {unknown} */
  const parsed = JSON.parse(readFileSync(`${cwd}/package.json`, "utf-8"));
  /** @type {Record<string, unknown>} */
  const manifest = isObject(parsed) ? parsed : {};
  // A missing field reads "undefined", as in a template literal
  const name = String(manifest.name);
  const version = String(manifest.version);

  const changelog = existsSync(`${cwd}/CHANGELOG.md`)
    ? readFileSync(`${cwd}/CHANGELOG.md`, "utf-8")
    : "";

  const released =
    changelog.split("\n").includes(`## ${version}`) || (await isPublished(fetch, name, version));

  return released
    ? undefined
    : `${name}@${version} is neither published nor in CHANGELOG.md.\n` +
        "Do not edit the version or create release tags by hand: add a changeset with\n" +
        "`vp exec changeset`, and the release workflow versions the package.";
};
