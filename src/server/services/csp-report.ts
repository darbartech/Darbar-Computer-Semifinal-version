import "server-only";

/**
 * Reading a browser's CSP report (src/app/api/csp-report/route.ts).
 *
 * Two payload shapes exist and browsers mix them. A legacy `report-uri` POST is
 * `{"csp-report": {"violated-directive": …, "blocked-url": …}}` with hyphenated
 * keys; the Reporting API posts an array of `{"type":"csp-violation", body: {…}}`
 * objects with camelCase keys. A collector that understands only one of them
 * logs every violation as `unknown`, which is how an enforced policy ends up
 * reporting nothing while appearing to work.
 */

/** What one violation looks like after both shapes are folded together. */
export type CspViolation = {
  directive: string;
  blocked: string;
  document: string;
};

function first(...values: (string | undefined)[]): string {
  return values.find((v): v is string => typeof v === "string" && v.length > 0) ?? "unknown";
}

/**
 * Only origins are kept: a blocked URL can carry a query string with personal
 * data, and AGENTS.md says none of that belongs in a log line.
 */
function originOr(value: string | undefined): string {
  if (!value) return "unknown";
  try {
    return new URL(value).origin;
  } catch {
    return value.slice(0, 64);
  }
}

export function readCspViolations(payload: unknown): CspViolation[] {
  const envelopes = Array.isArray(payload) ? payload : [payload];
  const violations: CspViolation[] = [];

  for (const envelope of envelopes) {
    if (!envelope || typeof envelope !== "object") continue;
    const record = envelope as Record<string, unknown>;
    // Legacy wrapper, Reporting API entry, or a bare report.
    const report = (record["csp-report"] ?? record["body"] ?? record) as Record<string, unknown>;
    if (!report || typeof report !== "object") continue;

    const text = (key: string) =>
      typeof report[key] === "string" ? (report[key] as string) : undefined;

    violations.push({
      directive: first(
        text("violated-directive"),
        text("effective-directive"),
        text("effectiveDirective"),
        text("directive")
      ).slice(0, 120),
      // The hyphenated names belong to the legacy `report-uri` body, the camelCase
      // ones to a CSP3 SecurityPolicyViolationEvent / Reporting API body. Note the
      // legacy keys are `-uri`, not `-url`: reading only `blocked-url` is what makes
      // every report arrive as `blocked= unknown`.
      blocked: originOr(
        text("blocked-uri") ?? text("blocked-url") ?? text("blockedURI") ?? text("blockedURL")
      ),
      document: originOr(
        text("document-uri") ??
          text("document-url") ??
          text("documentURI") ??
          text("documentURL")
      ),
    });
  }

  return violations;
}
