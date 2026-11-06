import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fix guide §8 — the audit table only ever grew.
 *
 * The daily job is allowed to forget sign-in and upload-signature traffic, and
 * nothing else. These tests pin both halves of that promise: the whitelist stays
 * a whitelist of noise (no payment, invoice, certificate or user event can ever
 * be swept), and the delete carries a cutoff instead of running over the whole
 * table.
 */

const deletes = vi.hoisted(() => [] as { where: Record<string, unknown> }[]);

vi.mock("@/server/db", () => ({
  db: {
    auditLog: {
      deleteMany: async (args: { where: Record<string, unknown> }) => {
        deletes.push(args);
        return { count: 7 };
      },
    },
  },
}));

const {
  AUDIT_NOISE_ACTIONS,
  AUDIT_NOISE_RETENTION_DAYS,
  pruneAuditNoise,
} = await import("../src/server/dal/audit");

function where(): { action: { in: string[] }; createdAt: { lt: Date } } {
  return deletes[deletes.length - 1]!.where as unknown as {
    action: { in: string[] };
    createdAt: { lt: Date };
  };
}

beforeEach(() => {
  deletes.length = 0;
});

describe("pruneAuditNoise", () => {
  it("deletes the aged noise rows and reports how many went", async () => {
    const before = Date.now();
    await expect(pruneAuditNoise()).resolves.toBe(7);
    expect(deletes).toHaveLength(1);
    expect(where().action.in).toEqual([...AUDIT_NOISE_ACTIONS]);
    const cutoff = where().createdAt.lt.getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - AUDIT_NOISE_RETENTION_DAYS * 86_400_000);
    expect(cutoff).toBeLessThanOrEqual(Date.now() - AUDIT_NOISE_RETENTION_DAYS * 86_400_000);
  });

  it("names only traffic counters, never a record of a decision", () => {
    // The guide's own list, plus the successful sign-ins `User.lastLoginAt`
    // already accounts for.
    expect(AUDIT_NOISE_ACTIONS).toEqual(
      expect.arrayContaining([
        "auth.signin",
        "auth.signin.failed",
        "student.signin",
        "student.signin.failed",
        "media.sign",
      ])
    );

    // The events the accountant and the incident review need must never be here.
    // Names are the ones this build actually writes.
    for (const forbidden of [
      "payment.record",
      "payment.void",
      "invoice.create",
      "invoice.issue",
      "certificate.create",
      "user.create",
      "user.update",
      "user.delete",
      "settings.update",
      "student.approve",
      "media.upload",
      "media.upload.rejected",
      "auth.signin.rejected",
      "auth.password.reset",
      "auth.2fa.enabled",
      "auth.2fa.disabled",
      "cron.run",
    ]) {
      expect(AUDIT_NOISE_ACTIONS as readonly string[]).not.toContain(forbidden);
    }
  });

  it("keeps a retention window long enough to investigate an incident", () => {
    expect(AUDIT_NOISE_RETENTION_DAYS).toBeGreaterThanOrEqual(90);
  });

  it("refuses a nonsense retention window instead of deleting everything", async () => {
    await expect(pruneAuditNoise(0)).rejects.toBeInstanceOf(RangeError);
    await expect(pruneAuditNoise(-30)).rejects.toBeInstanceOf(RangeError);
    await expect(pruneAuditNoise(1.5)).rejects.toBeInstanceOf(RangeError);
    expect(deletes).toHaveLength(0);
  });
});
