import type { UserConfig } from "vite-plus";

export type QualityGateConfig = Required<Pick<UserConfig, "lint" | "fmt" | "test" | "staged">> & {
  lint: { ignorePatterns: string[] };
  fmt: { ignorePatterns: string[] };
};

/** Base Vite+ config: lint (type-aware + type check), fmt, test coverage, staged. */
export declare const qualityGate: Readonly<QualityGateConfig>;

/** Base config plus extra ignored paths (generated or vendored folders only). */
export declare function defineQualityGate(options?: { ignore?: string[] }): QualityGateConfig;
