import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "vite-plus/test";

import { checkVersion } from "../scripts/check-version.js";

function project({ version, changelog }: { version: string; changelog?: string }) {
  const cwd = mkdtempSync(join(tmpdir(), "quality-gate-version-"));
  writeFileSync(join(cwd, "package.json"), JSON.stringify({ name: "some-lib", version }));
  if (changelog !== undefined) writeFileSync(join(cwd, "CHANGELOG.md"), changelog);
  return cwd;
}

const registry = (status: number) => (async () => new Response(null, { status })) as typeof fetch;

describe("checkVersion", () => {
  test("passes when changeset version wrote the CHANGELOG heading", async () => {
    const cwd = project({
      version: "1.2.0",
      changelog: "# some-lib\n\n## 1.2.0\n\n### Minor Changes\n",
    });
    expect(await checkVersion({ cwd, fetch: registry(500) })).toBeUndefined();
  });

  test("passes when the version is already published", async () => {
    expect(
      await checkVersion({ cwd: project({ version: "1.1.0" }), fetch: registry(200) }),
    ).toBeUndefined();
  });

  test("fails on a hand-edited version", async () => {
    const error = await checkVersion({
      cwd: project({ version: "9.9.9", changelog: "## 1.0.0\n" }),
      fetch: registry(404),
    });
    expect(error).toMatch(/some-lib@9\.9\.9 is neither published nor in CHANGELOG\.md/);
  });

  test("throws when the registry cannot answer", async () => {
    await expect(
      checkVersion({ cwd: project({ version: "1.0.0" }), fetch: registry(503) }),
    ).rejects.toThrow(/503/);
  });
});
