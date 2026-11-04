/**
 * Server environment checks, run once from `src/instrumentation.ts` before the
 * app starts serving requests.
 *
 * These are the values whose absence produces a broken *runtime* rather than a
 * build error: the app compiles fine, then fails on the first database query or
 * silently mints cookies with a throwaway secret. Failing loudly at boot is
 * cheaper to diagnose than a 500 from a public page.
 */

export type EnvCheckResult = {
  errors: string[];
  warnings: string[];
};

const PLACEHOLDER_SECRETS = new Set([
  "dev-only-secret-change-me",
  "change-me",
  "change-me-on-first-login",
  "secret",
]);

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function validateServerEnv(env: NodeJS.ProcessEnv = process.env): EnvCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = env.NODE_ENV === "production";

  const databaseUrl = nonEmpty(env.DATABASE_URL);
  if (!databaseUrl) {
    errors.push("DATABASE_URL is not set. Point it at the PostgreSQL instance (see .env.example).");
  } else if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
    errors.push("DATABASE_URL must be a postgres:// or postgresql:// connection string.");
  }

  const authSecret = nonEmpty(env.AUTH_SECRET);
  if (!authSecret) {
    (isProduction ? errors : warnings).push(
      "AUTH_SECRET is not set. Sessions cannot be signed reliably without it."
    );
  } else if (isProduction && (authSecret.length < 32 || PLACEHOLDER_SECRETS.has(authSecret))) {
    errors.push(
      "AUTH_SECRET is a placeholder or shorter than 32 characters. Generate one with `openssl rand -base64 32`."
    );
  }

  const siteUrl = nonEmpty(env.NEXT_PUBLIC_SITE_URL);
  if (!siteUrl) {
    (isProduction ? errors : warnings).push(
      "NEXT_PUBLIC_SITE_URL is not set. Canonical URLs and auth redirects will fall back to a localhost default."
    );
  } else {
    try {
      const parsed = new URL(siteUrl);
      if (isProduction && parsed.protocol !== "https:") {
        warnings.push(
          "NEXT_PUBLIC_SITE_URL is not HTTPS. HSTS is enabled in production, so cookies marked Secure will not be sent over plain HTTP."
        );
      }
      if (!isProduction && parsed.port && parsed.port !== "3001") {
        warnings.push(
          `NEXT_PUBLIC_SITE_URL uses port ${parsed.port}, but this project's dev server runs on 3001.`
        );
      }
    } catch {
      errors.push("NEXT_PUBLIC_SITE_URL is not a valid absolute URL.");
    }
  }

  const authUrl = nonEmpty(env.AUTH_URL);
  if (authUrl && siteUrl && authUrl.replace(/\/+$/, "") !== siteUrl.replace(/\/+$/, "")) {
    warnings.push(
      `AUTH_URL (${authUrl}) and NEXT_PUBLIC_SITE_URL (${siteUrl}) differ. They must match, or Browser sign-in redirects and origin checks will fail.`
    );
  }

  // The widget is a client component, so the site key has to carry the
  // NEXT_PUBLIC_ prefix to be readable there. `TURNSTILE_SITE_KEY` without the
  // prefix is a silent no-op, which used to be the documented name.
  const turnstileSiteKey =
    nonEmpty(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) ?? nonEmpty(env.TURNSTILE_SITE_KEY);
  const turnstileSecret = nonEmpty(env.TURNSTILE_SECRET_KEY);
  if (Boolean(turnstileSiteKey) !== Boolean(turnstileSecret)) {
    warnings.push(
      "Only one of NEXT_PUBLIC_TURNSTILE_SITE_KEY / TURNSTILE_SECRET_KEY is set. Turnstile is disabled unless both are present."
    );
  }
  if (env.TURNSTILE_SITE_KEY && !env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    warnings.push(
      "TURNSTILE_SITE_KEY is set but the widget reads NEXT_PUBLIC_TURNSTILE_SITE_KEY, so the challenge will not render. Rename the variable."
    );
  }

  return { errors, warnings };
}
