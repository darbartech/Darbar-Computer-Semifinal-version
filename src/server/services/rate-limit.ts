import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";
import { db } from "@/server/db";

/**
 * Per-process fallback salt when AUTH_SECRET is missing (misconfigured deploy).
 * A random salt is preferable to a well-known literal: it fails safe instead of
 * letting anyone reproduce stored IP hashes.
 */
const FALLBACK_SALT = randomBytes(16).toString("hex");

/**
 * Salts and hashes a client IP so the database never stores a raw address
 * (docs/06 §8, docs/03 `Lead.ipHash`).
 */
export function hashIp(ip: string): string {
  const salt = process.env.AUTH_SECRET ?? FALLBACK_SALT;
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/**
 * Real client IP behind the reverse proxy (docs/08 deployment uses Caddy).
 *
 * `X-Forwarded-For` is a hop list; the left-most entry is whatever the client
 * sent, so trusting it lets an attacker rotate rate-limit keys at will. The
 * right-most entry is the one appended by the trusted proxy. `CF-Connecting-IP`
 * is the fallback when Cloudflare sits in front.
 */
function clientIpFromHeaders(h: Headers): string | null {
  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const last = hops[hops.length - 1];
    if (last) return last;
  }
  const cloudflare = h.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare;
  return h.get("x-real-ip")?.trim() || null;
}

/**
 * IP hash for rate limiting and lead attribution. The raw IP is discarded as
 * soon as it is hashed, so it is never persisted or logged (docs/08 §1).
 */
export async function getClientIpHash(): Promise<string> {
  const h = await headers();
  return hashIp(clientIpFromHeaders(h) || "unknown");
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
