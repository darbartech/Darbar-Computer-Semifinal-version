import "server-only";
import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";

export type AuditActor = {
  /**
   * `User.id` of the staff member, or `null` for events with no authenticated
   * actor (a failed sign-in). The column is a foreign key, so a synthetic id
   * such as "system" would be rejected and the entry silently lost.
   */
  id: string | null;
  email: string;
};

export type AuditInput = {
  actor: AuditActor;
  /** Dotted verb, e.g. "media.upload", "course.update". */
  action: string;
  /** Model/table name, e.g. "Media". */
  entity: string;
  entityId?: string | null;
  /** Short human description. Never contain personal data (docs/02 §7.7). */
  summary?: string | null;
  /** Structured before/after or extra context. Must be JSON-serialisable. */
  meta?: Prisma.InputJsonValue | null;
};

/**
 * Writes one row per admin create / update / delete / status change
 * (docs/02 §7.6). Never throws into the caller: a failed audit entry must not
 * roll back the user's work, but it must be visible in the server log.
 *
 * Only pass IDs, counts and enum values in `summary` / `meta` — leads contain
 * phone numbers and email addresses (docs/08 §1).
 */
export async function audit(input: AuditInput): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: input.actor.id ?? null,
        actorEmail: input.actor.email,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId ?? null,
        summary: input.summary ?? null,
        meta: input.meta ?? undefined,
      },
    });
  } catch (error) {
    console.error(
      "[audit] failed to write audit entry",
      input.action,
      input.entity,
      error instanceof Error ? error.message : "unknown"
    );
  }
}