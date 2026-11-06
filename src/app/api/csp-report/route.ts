import { NextResponse } from "next/server";
import { readCspViolations } from "@/server/services/csp-report";
import { allow, getClientIpHash } from "@/server/services/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/csp-report
 *
 * Collector for the enforced Content-Security-Policy (`report-uri` in
 * src/lib/csp.ts, set by src/proxy.ts). Enforcement is the point, so a report
 * here is a live defect: something the site needs is being blocked, and this is
 * the only place that says which directive and which origin. The two shapes a
 * browser uses are folded together in src/server/services/csp-report.ts.
 *
 * Replies 204 to everything, including abuse, so the route neither leaks its own
 * rules nor becomes a reflection service.
 */

/** A real CSP report is a few hundred bytes; anything larger is not a browser. */
const MAX_REPORT_BYTES = 16_384;
const REPORT_RATE_LIMIT = { max: 300, windowMinutes: 60 } as const;

export async function POST(request: Request) {
  try {
    const declared = Number(request.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_REPORT_BYTES) return noContent();

    if (
      !(await allow(`csp-report:${await getClientIpHash()}`, REPORT_RATE_LIMIT))
    ) {
      return noContent();
    }

    const body = (await request.json().catch(() => null)) as unknown;
    if (!body) return noContent();

    for (const violation of readCspViolations(body)) {
      console.warn(
        "[csp]",
        violation.directive,
        "blocked=",
        violation.blocked,
        "on=",
        violation.document
      );
    }
  } catch {
    // A report that cannot be read is a report that cannot be logged.
  }

  return noContent();
}

function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}
