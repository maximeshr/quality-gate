/**
 * Base Vite+ configuration for OKQ projects. Projects spread it into their
 * `vite.config.ts` and only add what their structure needs. Never loosen a
 * rule here to make one project pass: fix the project
 */

import { fileURLToPath } from "node:url";

import antiSlop from "ultracite/oxlint/anti-slop";
import astro from "ultracite/oxlint/astro";
import core from "ultracite/oxlint/core";
import next from "ultracite/oxlint/next";
import playwright from "ultracite/oxlint/playwright";
import react from "ultracite/oxlint/react";
import svelte from "ultracite/oxlint/svelte";
import vitest from "ultracite/oxlint/vitest";
import vue from "ultracite/oxlint/vue";

/**
 * Oxlint resolves a bare plugin specifier from the project, where pnpm hides
 * the dependencies of quality-gate
 *
 * @param {string} specifier package to load as an Oxlint JS plugin
 * @returns {string} absolute path of its entry
 */
const resolvePlugin = (specifier) => fileURLToPath(import.meta.resolve(specifier));

/** Ultracite framework presets a project can add with `defineQualityGate({ presets })` */
const frameworkPresets = Object.freeze({ astro, next, playwright, react, svelte, vue });

/** Oxlint loads no preset from a JS plugin, so every no-comment-slop rule is listed */
const commentSlopRules = Object.fromEntries(
  [
    "max-comment-lines",
    "multiline-jsdoc-format",
    "no-banner-comment",
    "no-em-dash",
    "no-foreign-syntax",
    "no-jargon",
    "no-prose-semicolon",
    "no-trailing-comment",
    "no-trailing-period",
    "prefer-jsdoc-for-exports",
    "prefer-jsdoc-for-members",
    "require-member-docs",
  ].map((rule) => [`no-comment-slop/${rule}`, "error"]),
);

/** Files no project formats or lints */
const ignored = ["dist/**", "coverage/**", "pnpm-lock.yaml", "CHANGELOG.md"];

/** @type {import("./vite.d.ts").QualityGateConfig} */
export const qualityGate = Object.freeze({
  fmt: {
    ignorePatterns: [...ignored],
  },
  lint: {
    env: { ...core.env, node: true },
    /** Ultracite core and Vitest presets, then anti-slop last: it turns off the core rules it fights */
    extends: [core, vitest, antiSlop],
    ignorePatterns: [...core.ignorePatterns, ...ignored],
    jsPlugins: [
      { name: "vite-plus", specifier: "vite-plus/oxlint-plugin" },
      { name: "no-comment-slop", specifier: resolvePlugin("eslint-plugin-no-comment-slop") },
      { name: "comments", specifier: resolvePlugin("quality-gate/oxlint-plugin") },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      ...commentSlopRules,
      "comments/no-restating-comment": "error",
      "comments/require-suppression-reason": "error",
      "typescript/ban-ts-comment": [
        "error",
        { minimumDescriptionLength: 10, "ts-expect-error": "allow-with-description" },
      ],
    },
  },
  /** Staged files only: the full checks run in pre-push and CI */
  staged: {
    "*": ["quality-gate secrets", "vp check --fix --deny-warnings"],
  },
  test: {
    coverage: {
      include: ["src/**"],
      provider: "v8",
      reporter: ["text", "json-summary", "lcov"],
    },
  },
});

/**
 * The base config plus framework presets and extra ignored paths. Ignore only
 * generated or vendored folders (`.astro/**`, `src/generated/**`)
 *
 * @param {import("./vite.d.ts").QualityGateOptions} [options] presets and ignored paths
 * @returns {import("./vite.d.ts").QualityGateConfig} a config to spread into `defineConfig`
 */
export const defineQualityGate = ({ ignore = [], presets = [] } = {}) => {
  const [base, ...rest] = qualityGate.lint.extends;

  return {
    ...qualityGate,
    fmt: { ...qualityGate.fmt, ignorePatterns: [...qualityGate.fmt.ignorePatterns, ...ignore] },
    lint: {
      ...qualityGate.lint,
      extends: [base, ...presets.map((name) => frameworkPresets[name]), ...rest],
      ignorePatterns: [...qualityGate.lint.ignorePatterns, ...ignore],
    },
  };
};
