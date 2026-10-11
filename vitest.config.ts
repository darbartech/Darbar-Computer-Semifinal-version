import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    // `e2e/` belongs to Playwright (docs/08 §2), not Vitest. Without this the
    // Playwright specs get collected here and fail on the missing runner.
    exclude: ["node_modules/**", "e2e/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next.js resolves `server-only` internally, but Vitest does not. Alias
      // it to a no-op so `src/server/*` can be unit tested; the real guard is
      // applied by the Next.js build.
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
});