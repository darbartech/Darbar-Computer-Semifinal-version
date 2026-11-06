import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";

export const PAGE_SIZE = 50;

/**
 * Audit actions the daily job is allowed to forget (fix guide §8).
 *
 * These are counts of traffic, not records of decisions, and each one has a
 * shorter-lived or better-structured home anyway: `User.lastLoginAt` says when an
 * account last signed in, the rate-limit buckets say how often it failed, and
 * `media.upload` says whether a signature ever produced an image.
 *
 * Deliberately absent: `auth.signin.rejected` (correct staff credentials used at
 * the student door — rare, and worth reading when an account is compromised) and
 * every event that records a change — payments, invoices, receipts, certificates,
 * users, settings. Those are financial and security evidence, and the accountant's
 * retention floor (7 years) is why this is a whitelist of noise rather than a
 * blanket `createdAt` cut.
 *
 * `media.sign` has no writer any more: the sign route stopped auditing every
 * signature it issued (guide §8 Fix B), so the rows already in the table are the
 * only ones left to sweep.
 */
export const AUDIT_NOISE_ACTIONS = [
  "auth.signin",
  "auth.signin.failed",
  "student.signin",
  "student.signin.failed",
  "auth.2fa.verificationFailed",
  "media.sign",
] as const;

/** Long enough to investigate an incident, short enough to keep the table small. */
export const AUDIT_NOISE_RETENTION_DAYS = 90;

/** Delete the aged noise rows and return how many went. */
export async function pruneAuditNoise(
  olderThanDays: number = AUDIT_NOISE_RETENTION_DAYS
): Promise<number> {
  if (!Number.isInteger(olderThanDays) || olderThanDays < 1) {
    throw new RangeError("pruneAuditNoise needs at least one day of history");
  }
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
  const { count } = await db.auditLog.deleteMany({
    where: {
      action: { in: [...AUDIT_NOISE_ACTIONS] },
      createdAt: { lt: cutoff },
    },
  });
  return count;
}

export const adminListAuditLogs = async (filters: { q?: string; entity?: string; action?: string; page?: number }) => {
  const conditions: Prisma.AuditLogWhereInput[] = [];
  if (filters.entity) conditions.push({ entity: filters.entity });
  if (filters.action) conditions.push({ action: { contains: filters.action, mode: "insensitive" } });
  if (filters.q) conditions.push({
    OR: [
      { actorEmail: { contains: filters.q, mode: "insensitive" } },
      { summary: { contains: filters.q, mode: "insensitive" } },
    ],
  });
  const where = { AND: conditions };
  const total = await db.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const rows = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return { rows, total, page, pageCount };
};
