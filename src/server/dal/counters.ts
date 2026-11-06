import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";

export type Tx = Prisma.TransactionClient | typeof db;

/**
 * Next value of a named sequence (e.g. `cert:2026`), handed out by the database.
 *
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING` is a single atomic statement, so
 * two concurrent issuers can never be promised the same number — unlike a
 * `max(...) + 1` read, which races. A rolled-back transaction leaves a gap; that
 * is normal for certificates and receipts, where the number must be unique and
 * ordered rather than dense.
 */
export async function nextSequence(key: string, tx: Tx = db): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "Counter" ("key", "value", "updatedAt")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE
      SET "value" = "Counter"."value" + 1, "updatedAt" = now()
    RETURNING "value"`;

  const value = rows[0]?.value;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Sequence "${key}" did not return a value`);
  }
  return value;
}

/**
 * The value `nextSequence` would return next, without consuming it. Previews only —
 * repeatedly rendering a draft must not burn through the year's numbers.
 */
export async function peekSequence(key: string, tx: Tx = db): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    SELECT "value" FROM "Counter" WHERE "key" = ${key}`;
  return rows[0]?.value ?? 0;
}

/** Runs `fn` again once when a unique constraint still collides. */
export async function retryOnUniqueViolation<T>(
  fn: () => Promise<T>,
  isUniqueViolation: (error: unknown) => boolean = isP2002
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    return fn();
  }
}

/** Prisma's unique-constraint-violation code. */
export function isP2002(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Postgres aborted the transaction and the same work is worth doing again:
 * `40001` (serialization failure) and `40P01` (deadlock).
 *
 * The code arrives in two shapes. The query engine's own statements raise Prisma
 * `P2034`; a conflict surfaced by a raw statement — such as the `Counter` upsert
 * in `nextSequence` — arrives as Prisma `P2010` carrying the SQLSTATE in `meta`,
 * which a `code === "P2034"` check quietly misses, and the clerk is told "something
 * went wrong" about work the database never did.
 */
export function isRetryableTransactionFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, meta } = error as { code?: unknown; meta?: { code?: unknown } };
  if (code === "P2034") return true;
  const sqlState = code === "P2010" ? meta?.code : code;
  if (sqlState === "40001" || sqlState === "40P01") return true;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && /could not serialize|deadlock detected/i.test(message);
}
