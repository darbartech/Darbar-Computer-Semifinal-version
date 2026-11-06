import "server-only";
import {
  buildReport,
  createReporter,
  reportRoute,
  scrubText,
  type ErrorReport,
} from "@/lib/error-report";

/**
 * Server-side error monitoring (docs/08 §5, task 9).
 *
 * One module owns the decision to send anything at all, so the rule "a report
 * leaves only when an operator configured a collector" cannot be re-litigated at
 * each call site. `ERROR_REPORT_ENDPOINT` unset → `reporter.enabled` is false and
 * every call is a no-op; that is the default state of a development checkout and
 * of any deployment that has not opted in.
 *
 * The endpoint is a plain HTTPS ingest, which is deliberately the lowest common
 * denominator: Sentry, GlitchTip, a self-hosted collector or a log-shipper
 * webhook all accept a small JSON document, and none of them need an SDK in the
 * bundle. What the vendor does with the payload afterwards is its problem; what
 * it never receives is decided in `src/lib/error-report.ts`.
 */
function endpoint(): string | undefined {
  const value = process.env.ERROR_REPORT_ENDPOINT?.trim();
  return value ? value : undefined;
}

const reporter = createReporter({
  endpoint: endpoint(),
  // A dependency that is down produces a failure per request, not one per bug.
  budget: { max: 100, windowMinutes: 10 },
});

/**
 * Fire-and-forget. Returns nothing because the caller is usually already
 * handling a failure and must not await a network hop to answer the user;
 * a dropped report is a dropped report.
 */
export function reportError(error: unknown, where: string, route?: string): void {
  void reporter.report(buildReport({ surface: "server", where, error, route }));
}

/**
 * `onRequestError` from `src/instrumentation.ts`, which is where Next reports a
 * Server Component render, a Route Handler, a Server Action or the proxy that
 * nothing caught. `request.headers` is deliberately never read: it holds the
 * session cookie, and a cookie is a live credential.
 */
export function reportRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string }
): void {
  const where = [context.routeType, context.routePath, request.method]
    .filter(Boolean)
    .join(" ");
  void reporter.report(
    buildReport({
      surface: "server",
      where,
      error,
      route: reportRoute(request.path),
    })
  );
}

/**
 * The browser's own failures, forwarded to the collector by
 * `POST /api/error-report`. Everything in `body` is attacker-controlled text,
 * so it is re-scrubbed here rather than trusted because a browser sent it, and
 * anything that is not the shape we publish is discarded instead of shipped.
 */
export function reportClientError(body: unknown): void {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  const source = body as Record<string, unknown>;
  const text = (value: unknown, limit: number) =>
    typeof value === "string" ? scrubText(value).slice(0, limit) : undefined;

  const message = text(source.message, 500);
  // A browser can send a report about nothing; a blank line is not a defect.
  if (!message?.trim()) return;

  const report: ErrorReport = {
    surface: "client",
    where: text(source.where, 160) ?? "browser",
    message,
    name: text(source.name, 80) ?? "Error",
    // The server's clock, never the one in `body`: a browser is reporting about
    // itself, and a timestamp it chose is not evidence of when anything failed.
    occurredAt: new Date().toISOString(),
  };
  const stack = text(source.stack, 2_000);
  const route = source.route;
  if (stack) report.stack = stack;
  if (typeof route === "string") report.route = reportRoute(route);

  void reporter.report(report);
}

/** For tests and for a future health endpoint: is monitoring switched on? */
export function monitoringEnabled(): boolean {
  return reporter.enabled;
}
