import { describe, expect, test } from "vite-plus/test";

import { defineQualityGate, qualityGate } from "../src/vite.js";

describe("qualityGate", () => {
  test("enables type-aware lint and the type check", () => {
    expect(qualityGate.lint.options).toEqual({ typeAware: true, typeCheck: true });
  });

  test("defineQualityGate adds ignores without touching the base", () => {
    const config = defineQualityGate({ ignore: [".astro/**"] });
    expect(config.lint.ignorePatterns).toContain(".astro/**");
    expect(config.fmt.ignorePatterns).toContain(".astro/**");
    expect(qualityGate.lint.ignorePatterns).not.toContain(".astro/**");
  });
});
