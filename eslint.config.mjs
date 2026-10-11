import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Reference / specification artifacts, not application source.
    "certificate-docs/**",
    "DarbarTech_Programmable_Certificate_System_Documentation/**",
    // Untracked scratch worktrees (full app copies) — not this project's source.
    ".kilo/**",
    ".trae/**",
    "scripts/**",
    "e2e/**",
  ]),
]);

export default eslintConfig;
