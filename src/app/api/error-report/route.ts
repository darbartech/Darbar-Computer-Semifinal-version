import { NextResponse } from "next/server";
import { allow, getClientIpHash } from "@/server/services/rate-limit";
import { reportClientError } from "@/server/services/monitoring";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/error-report — the browser half of error monitoring (task 9).
 *
 * Modelled on `src/app/api/csp-report/route.ts` and for the same reason: this is
 * an unauthenticated ingest endpoint that any visitor may POST to, so it answers
 * 204 to everything, including abuse. A collector that returns different status
 * codes for different payloads is a free oracle, and one that reflects the body
 * is an XSS sink with a permanent URL.
 *
 * The client posts here rather than straight to the vendor because
 * `connect-src 'self'` in `src/lib/csp.ts` is what the browser is allowed to
 * reach; putting the collector's origin in the client bundle would mean
 * widening the CSP for a feature most deployments will not switch on. The
 * server-side budget, the scrub and the endpoint all stay in
 * `src/server/services/monitoring.ts`.
 */

/** A crash report is a handful of fields; anything larger is not a report. */
const MAX_ERROR_BYTES = 16_384;
const ERROR_RATE_LIMIT = { max: 120, windowMinutes: 60 } as const;

export async function POST(request: Request) {
  try {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_ERROR_BYTES) return noContent();

    if (!(await allow(`error-report:${await getClientIpHash()}`, ERROR_RATE_LIMIT))) {
      return noContent();
    }

    const body = (await request.json().catch(() => null)) as unknown;
    if (!body) return noContent();

    // Nothing on this response depends on what was in the body.
    reportClientError(body);
  } catch {
    // A report that cannot be read is a report that cannot be forwarded.
  }

  return noContent();
}

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
