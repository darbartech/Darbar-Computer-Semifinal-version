/**
 * Runs once per server instance, before the first request is handled.
 * See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateServerEnv } = await import("./lib/env");
  const { errors, warnings } = validateServerEnv();

  for (const warning of warnings) {
    console.warn(`[env] ${warning}`);
  }

  if (errors.length > 0) {
    throw new Error(
      `Invalid server environment:\n${errors.map((error) => `  - ${error}`).join("\n")}`
    );
  }
}
