import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/server/db";

/**
 * Salts and hashes a client IP so the database never stores a raw address
 * (docs/06 §8, docs/03 `Lead.ipHash`).
 */
export function hashIp(ip: string): string {
  const salt = process.env.AUTH_SECRET ?? "darbar-dev-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/**
 * IP hash for rate limiting and lead attribution. The raw IP is discarded as
 * soon as it is hashed, so it is never persisted or logged (docs/08 §1).
 */
export async function getClientIpHash(): Promise<string> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    h.get("cf-connecting-ip")?.trim() ||
    "unknown";
  return hashIp(ip || "unknown");
}

/** Referrer URL, truncated, for lead attribution. */
export async function getReferrerUrl(): Promise<string | null> {
  const h = await headers();
  const raw =
    h.get("referer")?.trim() ||
    h.get("referrer")?.trim() ||
    null;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    // Only the origin is stored: query strings can carry PII.
    return `${url.origin}${url.pathname}`.slice(0, 300);
  } catch {
    return null;
  }
}

export type RateLimitOptions = {
  /** Requests allowed inside the window. */
  max: number;
  windowMinutes: number;
};

/**
 * Database-backed fixed-window rate limit for the public forms (docs/02 §5:
 * "Honeypot field + Cloudflare Turnstile + DB rate limit"). Hits live in
 * `RateLimitHit`, which survives restarts and is shared by every server
 * instance, unlike an in-memory counter.
 */
export async function allow(
  key: string,
  { max, windowMinutes }: RateLimitOptions
): Promise<boolean> {
  const windowMs = Math.max(1, windowMinutes) * 60_000;
  const windowStart = new Date(Date.now() - windowMs);

  const used = await db.rateLimitHit.count({
    where: { key, createdAt: { gte: windowStart } },
  });
  if (used >= max) return false;

  await db.rateLimitHit.create({ data: { key } });

  // Opportunistic cleanup instead of a cron job. Failure is irrelevant to the
  // caller's decision, so it is swallowed.
  await db.rateLimitHit
    .deleteMany({ where: { createdAt: { lt: windowStart } } })
    .catch((error: unknown) => {
      console.error(
        "[rate-limit] cleanup failed",
        error instanceof Error ? error.message : "unknown"
      );
    });

  return true;
}
