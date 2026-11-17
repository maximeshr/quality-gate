import type { UserConfig } from "vite-plus";

type LintConfig = NonNullable<UserConfig["lint"]>;

export type QualityGateConfig = Required<Pick<UserConfig, "lint" | "fmt" | "test" | "staged">> & {
  lint: LintConfig & { ignorePatterns: string[]; extends: NonNullable<LintConfig["extends"]> };
  fmt: { ignorePatterns: string[] };
};

/** Ultracite framework presets added between the core and anti-slop presets */
export type QualityGatePreset = "astro" | "next" | "playwright" | "react" | "svelte" | "vue";

export interface QualityGateOptions {
  /** Generated or vendored paths to skip in lint and fmt */
  ignore?: string[];
  /** Framework presets the project needs, e.g. `["react", "next"]` */
  presets?: QualityGatePreset[];
}

/** Base Vite+ config: Ultracite, anti-slop and comment rules, type-aware lint, fmt, coverage, staged */
export declare const qualityGate: Readonly<QualityGateConfig>;

/** Base config plus framework presets and extra ignored paths */
export declare const defineQualityGate: (options?: QualityGateOptions) => QualityGateConfig;
