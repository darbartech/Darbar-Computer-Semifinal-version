/**
 * Error monitoring, provider-agnostic (docs/08 §5, task 9).
 *
 * The brief asks for "Sentry or equivalent". An SDK is not needed to get the
 * useful property: a report has to leave the process when someone configures a
 * collector, and must cost nothing when nobody did. So this module knows one
 * transport — `POST` a scrubbed JSON document to an HTTPS endpoint — and one
 * rule that outranks usefulness:
 *
 *   **what leaves here is never what the user typed.**
 *
 * A crash report on this site can carry a form payload, an invoice note, a
 * phone number, an email address, a message body and — because the staff
 * actions put it in the same object as everything else — a six-digit 2FA code.
 * Those are exactly the values `docs/08 §1` forbids in a log, and an upstream
 * vendor's own scrubbing is a black box we cannot audit from this repository.
 * So scrubbing happens here, first, on the string, before any transport exists.
 *
 * Deliberately free of `server-only`, Node APIs and Next imports: the same
 * builder runs in `src/instrumentation.ts` (server) and
 * `src/instrumentation-client.ts` (browser).
 */

export type ErrorSurface = "server" | "client";

/** The wire format. Every field is a short string, or absent. */
export type ErrorReport = {
  surface: ErrorSurface;
  /** Where it came from: a route path, an action label, `onRequestError`. */
  where: string;
  /** Scrubbed and capped. */
  message: string;
  /** The error's own name/constructor, which is not user input. */
  name: string;
  /** Path only, never the query string. */
  route?: string;
  /** Scrubbed and capped; absent when there is no stack. */
  stack?: string;
  occurredAt: string;
};

const MESSAGE_LIMIT = 500;
const STACK_LIMIT = 2_000;
const WHERE_LIMIT = 160;

/** A header-shaped token, which is what a leaked `Authorization` really is. */
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

/**
 * Keys whose *value* must never travel, whatever the transport. Matching on the
 * key name rather than a vocabulary means a new sensitive field is covered
 * before anyone remembers to list it.
 */
const SENSITIVE_KEY =
  /(["']?\b(?:[a-z0-9_]*(?:code|otp|totp|password|passphrase|secret|token|cookie|authorization|session|apikey|api_key))[a-z0-9_]*["']?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}&]+)/gi;

function redactValue(value: string): string {
  if (value.startsWith('"')) return '"[redacted]"';
  if (value.startsWith("'")) return "'[redacted]'";
  // A bare token has no quotes to keep, and inventing them would turn a log
  // line into something that no longer looks like the input it describes.
  return "[redacted]";
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/** Loose enough to catch a typed-in phone number; verified by digit count below. */
const DIGIT_RUN = /\+?\d[\d\s().-]{6,}\d/g;

/** Below this it is a line number, a timestamp or a currency amount. */
const PHONE_MIN_DIGITS = 8;

function digitCount(value: string): number {
  let count = 0;
  for (const character of value) {
    if (character >= "0" && character <= "9") count += 1;
  }
  return count;
}

/**
 * Redacts anything that reads like a credential field, an email address or a
 * phone number. Over-redaction is the intended bias: a report that lost a
 * useful digit is a worse report, a report that carried a student's phone
 * number is a breach.
 */
export function scrubText(value: string): string {
  return value
    .replace(BEARER, "[redacted]")
    .replace(SENSITIVE_KEY, (_match, prefix: string, token: string) => prefix + redactValue(token))
    .replace(EMAIL, "[email]")
    .replace(DIGIT_RUN, (match) =>
      digitCount(match) >= PHONE_MIN_DIGITS ? "[number]" : match
    );
}

/** A path with no query string, no fragment, and nothing that came from user input. */
export function reportRoute(path: string): string {
  const withoutQuery = path.split(/[?#]/)[0] ?? "/";
  const clipped = withoutQuery.length > 200 ? `${withoutQuery.slice(0, 200)}…` : withoutQuery;
  return scrubText(clipped);
}

function cap(value: string, limit: number): string {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/** Narrows whatever was thrown to the two fields a report is allowed to carry. */
export function buildReport(input: {
  surface: ErrorSurface;
  where: string;
  error: unknown;
  route?: string;
  occurredAt?: Date;
}): ErrorReport {
  const { error } = input;
  const isKnownError = error instanceof Error;
  // `String(error)` of a thrown object can be a serialized payload, and a thrown
  // string is often the request body itself — both go through the scrubber.
  const rawMessage = isKnownError
    ? error.message
    : typeof error === "string"
      ? error
      : "non-error thrown value";
  // `digest` is Next's server-render error reference: an opaque id, safe to keep,
  // and the only way to tie a browser console to the collector later.
  const digest =
    isKnownError && "digest" in error && typeof error.digest === "string"
      ? error.digest
      : undefined;

  const report: ErrorReport = {
    surface: input.surface,
    where: cap(scrubText(input.where), WHERE_LIMIT),
    message: cap(scrubText(rawMessage), MESSAGE_LIMIT),
    name: isKnownError ? cap(error.name || "Error", 80) : typeof error,
    occurredAt: (input.occurredAt ?? new Date()).toISOString(),
  };

  if (isKnownError && typeof error.stack === "string") {
    report.stack = cap(scrubText(error.stack), STACK_LIMIT);
  }
  if (input.route) report.route = reportRoute(input.route);
  if (digest) report.message = cap(`${report.message} [digest=${digest}]`, MESSAGE_LIMIT);

  return report;
}

/** How many reports one process may send per window. Past that, they are dropped. */
export type ReporterBudget = { max: number; windowMinutes: number };

export type Reporter = {
  /** Resolves to whether the report was handed to the transport. Never rejects. */
  report: (report: ErrorReport) => Promise<boolean>;
  /** Exposed for tests and for the ops page; `0` means monitoring is off. */
  enabled: boolean;
};

/**
 * The whole transport: no endpoint configured → every call is a no-op that
 * resolves false, so wiring this in production is one environment variable and
 * wiring it in development is nothing at all.
 *
 * A crash handler that can throw is worse than no crash handler, so every
 * failure path — a missing `fetch`, a non-2xx answer, a budget blown, an
 * unserialisable report — ends in `false` and no exception.
 */
export function createReporter(options: {
  endpoint?: string;
  budget?: ReporterBudget;
  fetchImpl?: typeof globalThis.fetch;
  now?: () => number;
}): Reporter {
  const endpoint = options.endpoint?.trim();
  const budget = options.budget ?? { max: 60, windowMinutes: 10 };
  const now = options.now ?? (() => Date.now());

  if (!endpoint) {
    return { report: async () => false, enabled: false };
  }

  let windowStart = Math.floor(now() / (budget.windowMinutes * 60_000));
  let sent = 0;

  return {
    report: async (report) => {
      try {
        const currentWindow = Math.floor(now() / (budget.windowMinutes * 60_000));
        if (currentWindow !== windowStart) {
          windowStart = currentWindow;
          sent = 0;
        }
        if (sent >= budget.max) return false;
        sent += 1;

        const send = options.fetchImpl ?? globalThis.fetch;
        if (typeof send !== "function") return false;

        await send(endpoint, {
          method: "POST",
          body: JSON.stringify(report),
          headers: { "content-type": "application/json" },
          // A page that is crashing may unload mid-report; `keepalive` is what
          // lets the last error in a navigation still arrive.
          keepalive: true,
        });
        return true;
      } catch {
        return false;
      }
    },
    enabled: true,
  };
}
