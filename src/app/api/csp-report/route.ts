import { NextResponse } from "next/server";
import { allow, getClientIpHash } from "@/server/services/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/csp-report
 *
 * Collector for the report-only Content-Security-Policy (`report-uri` in
 * next.config.mjs). The whole point of report-only mode is that it produces
 * evidence to act on before the policy is enforced; with no endpoint the browser
 * discards every violation.
 *
 * Replies 204 to everything, including abuse, so the route neither leaks its own
 * rules nor becomes a reflection service.
 */

/** A real CSP report is a few hundred bytes; anything larger is not a browser. */
const MAX_REPORT_BYTES = 16_384;
const REPORT_RATE_LIMIT = { max: 300, windowMinutes: 60 } as const;

/** Only these fields are logged, and only after truncation. */
type CspReport = {
  "violated-directive"?: string;
  "effective-directive"?: string;
  "blocked-url"?: string;
  blockedURI?: string;
  "document-url"?: string;
  documentURI?: string;
};

function originOr(value: string | undefined): string {
  if (!value) return "unknown";
  try {
    return new URL(value).origin;
  } catch {
    return value.slice(0, 64);
  }
}

export async function POST(request: Request) {
  try {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_REPORT_BYTES) return noContent();

    if (
      !(await allow(`csp-report:${await getClientIpHash()}`, REPORT_RATE_LIMIT))
    ) {
      return noContent();
    }

    const body = (await request.json().catch(() => null)) as CspReport | null;
    if (!body) return noContent();

    console.warn(
      "[csp]",
      (body["violated-directive"] ?? body["effective-directive"] ?? "unknown")
        .slice(0, 120),
      "blocked=",
      originOr(body["blocked-url"] ?? body.blockedURI),
      "on=",
      originOr(body["document-url"] ?? body.documentURI)
    );
  } catch {
    // A report that cannot be read is a report that cannot be logged.
  }

  return noContent();
}

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
