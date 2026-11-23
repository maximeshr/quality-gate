import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { toolBin } from "../scripts/cli.js";
import {
  BASELINE,
  compareComments,
  countComments,
  formatBaseline,
  ratchetComments,
  readBaseline,
} from "../scripts/comments.js";

const oxlint = toolBin("oxlint");

const baseline = () => readFileSync(BASELINE, "utf-8");

describe(compareComments, () => {
  it("passes when every file is at its baseline", () => {
    expect(compareComments({ "src/a.ts": 2 }, { "src/a.ts": 2 })).toStrictEqual({
      next: { "src/a.ts": 2 },
      rose: [],
      tightened: [],
    });
  });

  it("tightens the baseline when a file drops", () => {
    expect(compareComments({ "src/a.ts": 3, "src/b.ts": 1 }, { "src/a.ts": 1 })).toStrictEqual({
      next: { "src/a.ts": 1, "src/b.ts": 0 },
      rose: [],
      tightened: ["src/a.ts: 3 → 1", "src/b.ts: deleted"],
    });
  });

  it("fails when a file rises above its baseline", () => {
    expect(compareComments({ "src/a.ts": 1 }, { "src/a.ts": 2 }).rose).toStrictEqual([
      "src/a.ts: 2, baseline 1",
    ]);
  });

  it("starts a new file at zero", () => {
    expect(compareComments({}, { "src/new.ts": 1 }).rose).toStrictEqual([
      "src/new.ts: 1, baseline 0",
    ]);
  });
});

describe(formatBaseline, () => {
  it("keeps the files with comments, sorted", () => {
    expect(formatBaseline({ "src/b.ts": 1, "src/a.ts": 2, "src/c.ts": 0 })).toBe(
      '{\n  "src/a.ts": 2,\n  "src/b.ts": 1\n}\n',
    );
  });
});

describe("the baseline file", () => {
  let dir: string;
  const previous = process.cwd();

  beforeEach(() => {
    dir = realpathSync(mkdtempSync(path.join(tmpdir(), "quality-gate-comments-")));
    process.chdir(dir);
  });

  afterEach(() => {
    process.chdir(previous);
  });

  it("is empty when absent, and rejects anything but counts", () => {
    expect(readBaseline()).toStrictEqual({});

    writeFileSync(BASELINE, '{ "src/a.ts": -1 }');

    expect(() => readBaseline()).toThrow(/must map each file path to a comment count/u);
  });

  it("is written by a reset, raises included", () => {
    writeFileSync(BASELINE, '{ "src/a.ts": 1 }');

    expect(ratchetComments({ counts: { "src/a.ts": 4 }, reset: true })).toStrictEqual({
      ok: true,
      output: `${BASELINE} written: 4 comments in 1 file.`,
    });
    expect(baseline()).toBe('{\n  "src/a.ts": 4\n}\n');
  });

  it("passes and stays unchanged when no file moves", () => {
    writeFileSync(BASELINE, formatBaseline({ "src/a.ts": 2 }));

    expect(ratchetComments({ counts: { "src/a.ts": 2 } })).toStrictEqual({
      ok: true,
      output: `2 comments in 1 file, none above ${BASELINE}.`,
    });
  });

  it("fails on a rise and keeps the baseline", () => {
    writeFileSync(BASELINE, formatBaseline({ "src/a.ts": 1 }));

    const { ok, output } = ratchetComments({ counts: { "src/a.ts": 1, "src/new.ts": 1 } });

    expect({ ok, output }).toMatchObject({ ok: false });
    expect(output).toContain("src/new.ts: 1, baseline 0");
    expect(baseline()).toBe('{\n  "src/a.ts": 1\n}\n');
  });

  it("writes the tightened baseline and fails until it is committed", () => {
    writeFileSync(BASELINE, formatBaseline({ "src/a.ts": 3, "src/deleted.ts": 2 }));

    const { ok, output } = ratchetComments({ counts: { "src/a.ts": 1 } });

    expect(ok).toBeFalsy();
    expect(output).toBe(
      [
        `${BASELINE} tightened:`,
        "  src/a.ts: 3 → 1",
        "  src/deleted.ts: deleted",
        `Commit ${BASELINE}.`,
      ].join("\n"),
    );
    expect(baseline()).toBe('{\n  "src/a.ts": 1\n}\n');
    expect(ratchetComments({ counts: { "src/a.ts": 1 } }).ok).toBeTruthy();
  });

  it("counts the comments no-comments reports, outside the ignored files", () => {
    writeFileSync(path.join(dir, "package.json"), '{ "name": "fixture", "type": "module" }');
    writeFileSync(
      path.join(dir, "a.js"),
      "// one\nconst a = 1;\n/** Kept: documents an export */\nexport const b = a;\n// two\n",
    );
    writeFileSync(path.join(dir, "b.js"), "export const c = 1;\n");

    expect(countComments({ oxlint })).toStrictEqual({ "a.js": 2 });
  });
});
