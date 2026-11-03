// Checks the tarball npm will receive, not the sources: publint for package.json and the
// published files, attw for the types consumers resolve. Run after `vp pack`.
import { execFileSync } from "node:child_process";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { publint } from "publint";
import { formatMessage } from "publint/utils";

/**
 * @param {{ attwBin: string, profile?: string }} options
 * @returns {Promise<boolean>} true when both checks pass
 */
export async function checkPackage({ attwBin, profile = "esm-only" }) {
  // Windows resolves pnpm through a .cmd shim, which needs a shell.
  const shell = process.platform === "win32";
  const dir = await mkdtemp(join(tmpdir(), "quality-gate-pack-"));
  try {
    // `npm pack` refuses to run when devEngines pins pnpm.
    execFileSync("pnpm", ["pack", "--pack-destination", dir], { stdio: "ignore", shell });
    const [name] = await readdir(dir);
    if (!name) throw new Error("pnpm pack produced no tarball");
    const file = join(dir, name);

    const tarball = await readFile(file);
    const { messages, pkg } = await publint({
      pack: {
        tarball: tarball.buffer.slice(tarball.byteOffset, tarball.byteOffset + tarball.length),
      },
      strict: true,
    });
    for (const message of messages)
      console.error(`publint ${message.type}: ${formatMessage(message, pkg)}`);
    if (messages.length === 0) console.log("publint: no issues");

    // The stack is ESM only: CommonJS consumers load packages with import().
    try {
      execFileSync(
        process.execPath,
        [attwBin, file, "--profile", profile, "--format", "table-flipped"],
        {
          stdio: "inherit",
        },
      );
    } catch {
      return false;
    }
    return messages.length === 0;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
