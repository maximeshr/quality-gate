// Base Vite+ configuration for OKQ projects. Projects spread it into their
// `vite.config.ts` and only add what their structure needs (pack entries,
// generated folders to ignore). Do not loosen a rule here to make one project
// pass: fix the project.

/** Files no project formats or lints. */
const ignored = ["dist/**", "coverage/**", "pnpm-lock.yaml", "CHANGELOG.md"];

/** @type {import("./vite.d.ts").QualityGateConfig} */
export const qualityGate = Object.freeze({
  lint: {
    ignorePatterns: [...ignored],
    // Import from vite-plus (`vite-plus`, `vite-plus/test`), never from vite or vitest directly.
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: {
      // Type-aware rules (no-floating-promises, ...) and a full type check.
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    ignorePatterns: [...ignored],
  },
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**"],
      reporter: ["text", "json-summary", "lcov"],
    },
  },
  // pre-commit (`vp staged`): staged files only. Full checks run in pre-push and CI.
  staged: {
    "*": ["quality-gate secrets", "vp check --fix --deny-warnings"],
  },
});

/**
 * Returns the base config with extra ignored paths for lint and fmt.
 * Only for generated or vendored folders (`.astro/**`, `src/generated/**`).
 *
 * @param {{ ignore?: string[] }} [options]
 * @returns {import("./vite.d.ts").QualityGateConfig}
 */
export function defineQualityGate({ ignore = [] } = {}) {
  return {
    ...qualityGate,
    lint: { ...qualityGate.lint, ignorePatterns: [...qualityGate.lint.ignorePatterns, ...ignore] },
    fmt: { ...qualityGate.fmt, ignorePatterns: [...qualityGate.fmt.ignorePatterns, ...ignore] },
  };
}
