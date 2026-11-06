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

/** Stand-in identity when no proxy supplied a client address. */
const UNIDENTIFIED_IP_BUCKET = "unidentified";

/**
 * Salted hash for any identity-shaped limit key.
 *
 * The register form's per-address mail budget is keyed by an email address, and
 * a bucket table full of raw addresses is the same PII leak the audit log is
 * careful to avoid (docs/08 §1). Same salt as `hashIp`, so one secret rotates
 * every hashed key in the database.
 */
export function hashIdentity(value: string): string {
  const salt = process.env.AUTH_SECRET ?? FALLBACK_SALT;
  return createHash("sha256").update(`${salt}:${value}`).digest("hex");
}

/**
 * Salts and hashes a client IP so the database never stores a raw address
 * (docs/06 §8, docs/03 `Lead.ipHash`).
 */
export function hashIp(ip: string): string {
  return hashIdentity(ip);
}

/**
 * Real client IP behind the reverse proxy (docs/08 deployment puts Caddy in front).
 *
 * `X-Forwarded-For` is a hop list, and every entry left of the proxy's own
 * addition is attacker-written. Trusting the list wholesale lets anyone rotate
 * their rate-limit key at will, so the value is read from the RIGHT: with
 * `TRUSTED_PROXY_HOPS=1` (the documented single-Caddy setup) the last entry is
 * the address the proxy saw, which the client cannot forge. A request whose list
 * is shorter than the trusted chain did not pass through the expected proxies and
 * gets no identity at all.
 *
 * `CF-Connecting-IP` is only meaningful when the origin firewall accepts traffic
 * from Cloudflare's ranges and nothing else — anyone can send that header, so it
 * is read only when `TRUSTED_PROXY=cloudflare` says the deployment really is
 * behind Cloudflare (docs 01 §S1).
 */
export type TrustedProxyMode = "cloudflare" | "hops";

export function trustedProxyMode(): TrustedProxyMode {
  const raw = (process.env.TRUSTED_PROXY ?? "hops").trim().toLowerCase();
  return raw === "cloudflare" ? "cloudflare" : "hops";
}

function trustedProxyHops(): number {
  const raw = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? "", 10);
  return Number.isNaN(raw) || raw < 1 ? 1 : raw;
}

export function clientIpFromHeaders(h: Headers): string | null {
  if (trustedProxyMode() === "cloudflare") {
    return h.get("cf-connecting-ip")?.trim() || null;
  }

  const forwarded = h.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((hop) => hop.trim())
      .filter(Boolean);
    const index = hops.length - trustedProxyHops();
    if (index >= 0) return hops[index];
  }

  return h.get("x-real-ip")?.trim() || null;
}

/**
 * Client address, kept in memory only. Turnstile's `remoteip` parameter needs
 * the raw value, so this must never be persisted or logged — everything else in
 * the codebase uses `getClientIpHash()`.
 */
export async function getClientIp(): Promise<string | null> {
  const h = await headers();
  return clientIpFromHeaders(h);
}

/**
 * IP hash for rate limiting and lead attribution. The raw IP is discarded as
 * soon as it is hashed, so it is never persisted or logged (docs/08 §1).
 *
 * With no proxy identity at all the caller is bucketed under one shared key. That
 * is deliberate: a deploy that forgot both `TRUSTED_PROXY_HOPS` and a proxy then
 * throttles everyone instead of throttling no one, and the warning says why.
 */
export async function getClientIpHash(): Promise<string> {
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  if (ip) return hashIp(ip);
  if (process.env.NODE_ENV === "production") {
    console.warn("[rate-limit] no client identity: set TRUSTED_PROXY_HOPS to match the proxy chain");
  }
  return hashIp(UNIDENTIFIED_IP_BUCKET);
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

/** Start of the fixed window a `windowMinutes` bucket belongs to. */
function currentWindowStart(windowMinutes: number): Date {
  const windowMs = Math.max(1, windowMinutes) * 60_000;
  return new Date(Math.floor(Date.now() / windowMs) * windowMs);
}

/**
 * Database-backed fixed-window rate limit (docs 01 §S8).
 *
 * One `INSERT … ON CONFLICT DO UPDATE … RETURNING` per call, so a burst of
 * parallel requests increments the same row and only `max` of them see a count
 * within the limit. The previous count-then-insert version let every parallel
 * request pass, and its per-call `deleteMany` turned each allowed request into
 * three writes on a hot table. Stale buckets are swept by the nightly job
 * (docs 07 §2), not here.
 */
export async function allow(
  key: string,
  { max, windowMinutes }: RateLimitOptions
): Promise<boolean> {
  const windowStart = currentWindowStart(windowMinutes);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;
  return (rows[0]?.count ?? max + 1) <= max;
}

/**
 * Addresses whose traffic is not throttled by an IP-only limit (reaudit N2).
 *
 * An institute has one public address. The whole lab, the front desk and every
 * phone on campus Wi-Fi leave through it, so a limit expressed "per IP" is really
 * a limit for the building: on admission day the sixth student to touch the
 * register form is told to come back an hour later. `RATE_LIMIT_TRUSTED_IPS` is a
 * comma-separated list of the campus addresses (and any office NAT you own) that
 * skip those counters.
 *
 * What this does *not* switch off: Turnstile on every public form, and any limit
 * keyed by account, email or user id. Those are what actually stop one person;
 * the IP-only ones only ever stopped the building.
 */
export function trustedIpList(): string[] {
  return (process.env.RATE_LIMIT_TRUSTED_IPS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** Is the caller standing on a trusted campus address? */
export async function isTrustedClientIp(): Promise<boolean> {
  const list = trustedIpList();
  if (list.length === 0) return false;
  const h = await headers();
  const ip = clientIpFromHeaders(h);
  return ip !== null && list.includes(ip);
}

/**
 * `allow()` for a counter that is only about the address. A trusted campus IP
 * passes without taking a slot, so the same bucket a bot fills up cannot lock the
 * institute's own students out of the register or contact form.
 */
export async function allowByIp(
  key: string,
  options: RateLimitOptions
): Promise<boolean> {
  if (await isTrustedClientIp()) return true;
  return allow(key, options);
}

/**
 * Drop buckets nobody will consult again (doc 07 §2, reaudit N3).
 *
 * The limiter writes one row per key per window and never cleans up after itself,
 * so a table that starts empty still grows with every bot, every sign-in failure
 * and every campus form — the counters keyed by `acc-ip` and `ip` multiply per
 * visitor. Two days is comfortably longer than the widest window in use (60
 * minutes), so nothing still in force is forgotten; a bucket deleted early would
 * silently hand an attacker a fresh allowance.
 */
export async function purgeStaleBuckets(olderThanDays = 2): Promise<number> {
  if (!Number.isInteger(olderThanDays) || olderThanDays < 1) {
    throw new RangeError("purgeStaleBuckets needs at least one day of history");
  }
  const rows = await db.$queryRaw<{ count: number }[]>`
    WITH deleted AS (
      DELETE FROM "RateLimitBucket"
      WHERE "windowStart" < now() - make_interval(days => ${olderThanDays}::int)
      RETURNING 1
    )
    SELECT COUNT(*)::int AS count FROM deleted`;
  return rows[0]?.count ?? 0;
}

/**
 * Read-only version of the limit used for sign-in throttling (docs 01 §S5): the
 * counter is written only when an attempt *fails*, so an attacker cannot burn a
 * real user's allowance by generating failures elsewhere.
 */
export async function isBlocked(
  key: string,
  max: number,
  windowMinutes: number
): Promise<boolean> {
  const bucket = await db.rateLimitBucket.findUnique({
    where: { key_windowStart: { key, windowStart: currentWindowStart(windowMinutes) } },
    select: { count: true },
  });
  return (bucket?.count ?? 0) >= max;
}

/** Records one failed attempt and returns the running count for the window. */
export async function recordHit(
  key: string,
  windowMinutes: number
): Promise<number> {
  const windowStart = currentWindowStart(windowMinutes);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "windowStart", "count")
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT ("key", "windowStart")
    DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"`;
  return rows[0]?.count ?? 1;
}
