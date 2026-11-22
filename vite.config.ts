import { defineConfig } from "vite-plus";

import { defineQualityGate } from "./src/vite.js";

const base = defineQualityGate({ ignore: ["skills/merge-risk/**"] });

/**
 * quality-gate uses its own base config, like every OKQ project. The vendored merge-risk skill stays byte-identical to upstream
 */
export default defineConfig({
  ...base,
  staged: {
    "*": ["node bin/quality-gate.js secrets", "vp check --fix --deny-warnings"],
  },
  test: {
    ...base.test,
    coverage: { ...base.test.coverage, include: ["src/**", "scripts/**", "bin/**"] },
  },
});
