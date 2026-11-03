import { defineConfig } from "vite-plus";

import { qualityGate } from "./src/vite.js";

// quality-gate uses its own base config, like every OKQ project.
export default defineConfig({
  ...qualityGate,
  test: {
    ...qualityGate.test,
    coverage: { ...qualityGate.test.coverage, include: ["src/**", "scripts/**", "bin/**"] },
  },
  staged: {
    "*": ["node bin/quality-gate.js secrets", "vp check --fix --deny-warnings"],
  },
});
