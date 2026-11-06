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

  // Every rate limit is keyed by the client address, so how that address is read
  // has to be stated explicitly (docs 01 §S1). `CF-Connecting-IP` is only
  // trustworthy when the origin firewall admits Cloudflare's ranges and nothing
  // else; otherwise any visitor can send it and get a fresh bucket.
  const proxyMode = nonEmpty(env.TRUSTED_PROXY)?.toLowerCase();
  if (proxyMode && proxyMode !== "cloudflare" && proxyMode !== "hops") {
    errors.push(
      `TRUSTED_PROXY must be "cloudflare" or "hops" (got "${env.TRUSTED_PROXY}"). An unrecognised value falls back to "hops".`
    );
  }
  if (isProduction && !proxyMode) {
    warnings.push(
      'TRUSTED_PROXY is not set, so the client address is taken from the right-most X-Forwarded-For hop. Set TRUSTED_PROXY="cloudflare" only if the origin firewall accepts traffic from Cloudflare ranges alone.'
    );
  }
  if (proxyMode === "cloudflare") {
    warnings.push(
      'TRUSTED_PROXY="cloudflare": confirm the origin firewall blocks every IP except Cloudflare\'s, and that the proxy strips any inbound CF-Connecting-IP.'
    );
  }

  const proxyHops = nonEmpty(env.TRUSTED_PROXY_HOPS);
  if (proxyHops && !/^\d+$/.test(proxyHops)) {
    errors.push(`TRUSTED_PROXY_HOPS must be a whole number of trusted proxies (got "${env.TRUSTED_PROXY_HOPS}").`);
  }

  // Uploads on the container's own disk disappear at the next deploy while the
  // database keeps serving their URLs (fix guide §11). Development is allowed to
  // do it — that is what `public/uploads` is for — production is not.
  const storageProvider = nonEmpty(env.MEDIA_STORAGE_PROVIDER)?.toLowerCase();
  if (isProduction && storageProvider === "local") {
    errors.push(
      'MEDIA_STORAGE_PROVIDER=local is not allowed in production: uploaded files are written to this container\'s disk and vanish on the next deploy. Leave it unset to use Cloudinary credentials, or set it to "cloudinary".'
    );
  }

  return { errors, warnings };
}
