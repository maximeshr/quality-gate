import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";

import { checkPackage } from "../scripts/check-package.js";
import { toolBin } from "../scripts/cli.js";

const attwBin = toolBin("@arethetypeswrong/cli", "attw");

/** A minimal ESM package; `manifest` overrides its package.json fields. */
function pkg(manifest: object = {}) {
  const dir = mkdtempSync(join(tmpdir(), "quality-gate-package-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({
      name: "some-lib",
      version: "1.0.0",
      type: "module",
      exports: { ".": { types: "./index.d.ts", default: "./index.js" } },
      files: ["index.js", "index.d.ts"],
      ...manifest,
    }),
  );
  writeFileSync(join(dir, "index.js"), "export const answer = 42;\n");
  writeFileSync(join(dir, "index.d.ts"), "export declare const answer: number;\n");
  return dir;
}

// Packs real tarballs with pnpm, then runs publint and attw on them.
describe("checkPackage", { timeout: 60_000 }, () => {
  const previous = process.cwd();

  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.chdir(previous);
    vi.restoreAllMocks();
  });

  test("passes on a well-formed ESM package", async () => {
    process.chdir(pkg());
    expect(await checkPackage({ attwBin })).toBe(true);
  });

  test("fails when publint finds an issue", async () => {
    // The published types file is missing from the tarball.
    process.chdir(pkg({ files: ["index.js"] }));
    expect(await checkPackage({ attwBin })).toBe(false);
    expect(vi.mocked(console.error).mock.calls.flat().join("\n")).toMatch(/publint/);
  });
});
