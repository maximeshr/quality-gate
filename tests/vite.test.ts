import antiSlop from "ultracite/oxlint/anti-slop";
import astro from "ultracite/oxlint/astro";
import core from "ultracite/oxlint/core";
import vitest from "ultracite/oxlint/vitest";
import { describe, expect, it } from "vite-plus/test";

import { defineQualityGate, qualityGate } from "../src/vite.js";

describe("base config", () => {
  it("enables type-aware lint and the type check", () => {
    expect(qualityGate.lint.options).toStrictEqual({ typeAware: true, typeCheck: true });
  });

  it("extends Ultracite core, Vitest and anti-slop, in that order", () => {
    expect(qualityGate.lint.extends).toStrictEqual([core, vitest, antiSlop]);
  });

  it("loads the comment plugins from absolute paths", () => {
    const plugins = JSON.stringify(qualityGate.lint.jsPlugins);

    expect(plugins).toMatch(/"specifier":"\/[^"]+\/eslint-plugin-no-comment-slop\//u);
    expect(plugins).toMatch(/"specifier":"\/[^"]+\/src\/oxlint-plugin\.js"/u);
    expect(qualityGate.lint.rules).toMatchObject({
      "comments/no-restating-comment": "error",
      "comments/require-suppression-reason": "error",
      "no-comment-slop/max-comment-lines": "error",
    });
  });
});

describe(defineQualityGate, () => {
  it("adds ignores without touching the base", () => {
    const config = defineQualityGate({ ignore: [".astro/**"] });

    expect(config.lint.ignorePatterns).toContain(".astro/**");
    expect(config.fmt.ignorePatterns).toContain(".astro/**");
    expect(qualityGate.lint.ignorePatterns).not.toContain(".astro/**");
  });

  it("puts framework presets between core and anti-slop", () => {
    const config = defineQualityGate({ presets: ["astro"] });

    expect(config.lint.extends).toStrictEqual([core, astro, vitest, antiSlop]);
    expect(qualityGate.lint.extends).toHaveLength(3);
  });
});
