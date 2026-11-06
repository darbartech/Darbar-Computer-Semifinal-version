/**
 * Client instrumentation: runs in the browser before the page is interactive
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md).
 *
 * The browser half of error monitoring. A client crash never reaches
 * `onRequestError` — nothing on the server knows it happened — so without this
 * file the "and the client" part of the brief would go unanswered, and a broken
 * button in `/techdarbar` would stay invisible until someone phoned the campus.
 *
 * It posts to this site's own ingest route, not to the collector: the collector
 * URL and its credential belong to the server, `connect-src 'self'` in
 * `src/lib/csp.ts` is what the browser is allowed to reach, and making
 * "monitoring is off" mean a rebuild would be a bad trade for a feature most
 * deployments will not switch on. So this half is also env-gated: with
 * `NEXT_PUBLIC_ERROR_REPORT_ENDPOINT` unset, no listener is installed at all.
 *
 * Free of `server-only`, Prisma and anything from `src/server/*` by necessity.
 */
import { buildReport, createReporter } from "./lib/error-report";

const endpoint = process.env.NEXT_PUBLIC_ERROR_REPORT_ENDPOINT?.trim();

const reporter = endpoint
  ? createReporter({
      endpoint,
      // One page can throw in a loop; the collector should see the first of
      // them, not the thousandth.
      budget: { max: 20, windowMinutes: 10 },
    })
  : null;

if (reporter && typeof window !== "undefined") {
  const send = (error: unknown, where: string) => {
    try {
      void reporter.report(
        buildReport({
          surface: "client",
          where,
          error,
          route: window.location.pathname,
        })
      );
    } catch {
      // A monitor that can throw inside an error handler is a second outage.
    }
  };

  window.addEventListener("error", (event) => {
    // A failed `<img>` or `<script>` fires this event too, with no `error` on
    // it. That is a missing picture, not a crash.
    if (event.error === undefined) return;
    send(event.error, "window.onerror");
  });

  window.addEventListener("unhandledrejection", (event) => {
    send(event.reason, "unhandledrejection");
  });
}
