/**
 * Runs once per server instance, before the first request is handled.
 * See node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md
 *
 * `register` is the startup environment gate; `onRequestError` is the monitor's
 * door. Next calls the second one for every error that nothing in the app
 * caught — a Server Component render, a Route Handler, a Server Action, the
 * proxy — which is precisely the set a deployment otherwise learns about only
 * from a user's report. What it does with it is decided in
 * `src/server/services/monitoring.ts`, and that decides nothing at all when
 * `ERROR_REPORT_ENDPOINT` is unset.
 */
import type { Instrumentation } from "next";

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

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { reportRequestError } = await import("./server/services/monitoring");
  // The report carries the path without its query string and never a header:
  // `request.path` is `/blog?email=…` on this site's own forms, and a header
  // would be the visitor's session cookie (docs/08 §1: no personal data in logs).
  reportRequestError(error, { path: request.path, method: request.method }, context);
};
