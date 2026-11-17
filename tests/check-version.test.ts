import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vite-plus/test";

import { checkVersion } from "../scripts/check-version.js";

const project = ({ version, changelog }: { version: string; changelog?: string }) => {
  const cwd = mkdtempSync(path.join(tmpdir(), "quality-gate-version-"));
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "some-lib", version }));

  if (changelog !== undefined) {
    writeFileSync(path.join(cwd, "CHANGELOG.md"), changelog);
  }

  return cwd;
};

const registry = (status: number) =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));

describe(checkVersion, () => {
  it("passes when changeset version wrote the CHANGELOG heading", async () => {
    const cwd = project({
      changelog: "# some-lib\n\n## 1.2.0\n\n### Minor Changes\n",
      version: "1.2.0",
    });

    await expect(checkVersion({ cwd, fetch: registry(500) })).resolves.toBeUndefined();
  });

  it("passes when the version is already published", async () => {
    await expect(
      checkVersion({ cwd: project({ version: "1.1.0" }), fetch: registry(200) }),
    ).resolves.toBeUndefined();
  });

  it("fails on a hand-edited version", async () => {
    const error = await checkVersion({
      cwd: project({ changelog: "## 1.0.0\n", version: "9.9.9" }),
      fetch: registry(404),
    });

    expect(error).toMatch(/some-lib@9\.9\.9 is neither published nor in CHANGELOG\.md/u);
  });

  it("throws when the registry cannot answer", async () => {
    await expect(
      checkVersion({ cwd: project({ version: "1.0.0" }), fetch: registry(503) }),
    ).rejects.toThrow(/503/u);
  });
});
