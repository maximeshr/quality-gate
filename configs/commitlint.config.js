// `extends` takes the preset's absolute path: with pnpm, the preset and its parser
// cannot be resolved from the project, only from quality-gate and from the preset itself.
import { fileURLToPath } from "node:url";

export default {
  extends: [fileURLToPath(import.meta.resolve("@commitlint/config-conventional"))],
};
