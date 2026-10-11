/**
 * Stand-in for the `server-only` package, which Next.js aliases internally but
 * Vitest does not resolve. It exists so `src/server/*` modules can be imported
 * by unit tests. The real client/server boundary guard is applied by the Next.js
 * build — this stub makes no assertion of its own.
 */
export {};