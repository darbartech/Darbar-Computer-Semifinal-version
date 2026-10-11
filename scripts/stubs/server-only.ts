/**
 * Stub for the `server-only` package.
 *
 * `src/server/**` imports `server-only` so a bundler fails loudly when a client
 * component reaches server code. A plain `tsx` script has no such bundler, and
 * the real package throws at import time, which would stop `scripts/verify-seed.ts`
 * before it can check anything.
 *
 * `scripts/tsconfig.scripts.json` maps `server-only` here, so the scripts run the
 * exact same modules the app runs, with the guard neutralised. Nothing under
 * `src/` is aware of this file.
 */
export {};
