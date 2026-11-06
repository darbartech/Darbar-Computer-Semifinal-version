import "server-only";
import { db } from "@/server/db";
import { getSiteSettings } from "@/server/dal/settings";

/**
 * Data retention (docs/08 §1 "Privacy", task 9).
 *
 * The institute collects a stranger's name, phone number and words in two
 * places — an enquiry form and a contact form — and has no reason to keep them
 * once the conversation is over. The window is a setting rather than a constant
 * because the right number is a judgement the campus makes, not one a deploy
 * makes for it; `retention` in `src/lib/validators/settings.ts` holds the rules
 * and this module reads them.
 *
 * Two deliberate asymmetries:
 *
 *  - An **enquiry** is anonymised in place, not deleted. `Lead.deletedAt`
 *    already exists for exactly this (schema comment: "set by the retention
 *    purge instead of DELETE, so a wrongly removed lead can be restored"), and
 *    the row still carries what the aggregate reports count — the course asked
 *    about, the status it reached, the year it arrived. The stamp is what hides
 *    it from staff: `leadScopeWhere()` filters it out of every read.
 *  - A **message** is deleted. It has no such column, nothing refers to it, and
 *    an anonymised row left in the unread queue would haunt the badge forever.
 *
 * A lead that became a student is skipped: its `studentId` is the record of how
 * that enrollment was found, and the personal data that comes with an enrolled
 * student is handled by the student-erasure controls, on an explicit request,
 * not by a background job.
 */

/** Placeholder left behind so an anonymised row is recognisable as one. */
export const ANONYMISED_FULL_NAME = "Anonymised enquiry";

/**
 * Rows per table per run. A purge that starts after years of nothing has to be
 * bounded: one `UPDATE … WHERE id IN (…)` of a hundred thousand leads would hold
 * a write lock long enough to be felt by the person at the front desk. The next
 * run picks up where this one stopped, and `remaining` says there is more.
 */
export const RETENTION_ROWS_PER_RUN = 1_000;

export type LeadRetentionResult = {
  anonymised: number;
  notesCleared: number;
  remaining: boolean;
};

export type MessageRetentionResult = {
  deleted: number;
  remaining: boolean;
};

export type RetentionRunResult = LeadRetentionResult & MessageRetentionResult;

/**
 * Whole months back from `now`. Refuses anything that would widen the sweep to
 * the whole table: a `0` here means "everything that ever existed", and that is
 * never what a settings field was meant to say.
 *
 * Calendar months, so the 31st of a short month rolls forward a day or two —
 * retention measured in months is not a deadline anyone is prosecuted on.
 */
function monthsAgo(months: number, now: Date): Date {
  if (!Number.isInteger(months) || months < 1) {
    throw new RangeError("a retention window needs at least one whole month");
  }
  const cutoff = new Date(now.getTime());
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff;
}

/**
 * Strip the identity from every enquiry nobody has touched since its window
 * closed. `updatedAt` rather than `createdAt`: a lead someone phoned about last
 * week is not expired however long ago it arrived.
 */
export async function anonymiseExpiredLeads(
  months: number,
  now: Date = new Date()
): Promise<LeadRetentionResult> {
  const cutoff = monthsAgo(months, now);

  const found = await db.lead.findMany({
    where: { deletedAt: null, studentId: null, updatedAt: { lt: cutoff } },
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: RETENTION_ROWS_PER_RUN + 1,
  });
  const remaining = found.length > RETENTION_ROWS_PER_RUN;
  const ids = found.slice(0, RETENTION_ROWS_PER_RUN).map((row) => row.id);
  if (ids.length === 0) return { anonymised: 0, notesCleared: 0, remaining: false };

  const stamp = new Date(now.getTime());
  const [leads, notes] = await db.$transaction([
    db.lead.updateMany({
      where: { id: { in: ids } },
      data: {
        fullName: ANONYMISED_FULL_NAME,
        // `phone` is NOT NULL, so it keeps a value — the empty one, which
        // matches no real number and cannot be dialled.
        phone: "",
        phoneNormalized: null,
        email: null,
        message: null,
        ipHash: null,
        deletedAt: stamp,
      },
    }),
    // Staff notes quote what the visitor said; the timeline keeps its shape
    // (who, when, which status change) and loses its text.
    db.leadActivity.updateMany({
      where: { leadId: { in: ids }, body: { not: null } },
      data: { body: null },
    }),
  ]);

  return { anonymised: leads.count, notesCleared: notes.count, remaining };
}

/** Delete every contact message that arrived before its window opened. */
export async function deleteExpiredMessages(
  months: number,
  now: Date = new Date()
): Promise<MessageRetentionResult> {
  const cutoff = monthsAgo(months, now);

  const found = await db.contactMessage.findMany({
    where: { createdAt: { lt: cutoff } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: RETENTION_ROWS_PER_RUN + 1,
  });
  const remaining = found.length > RETENTION_ROWS_PER_RUN;
  const ids = found.slice(0, RETENTION_ROWS_PER_RUN).map((row) => row.id);
  if (ids.length === 0) return { deleted: 0, remaining: false };

  const { count } = await db.contactMessage.deleteMany({ where: { id: { in: ids } } });
  return { deleted: count, remaining };
}

/**
 * The whole sweep, with the windows read from Settings.
 *
 * `getSiteSettings()` is the cached public read: a settings save invalidates it,
 * so the job cannot run on a window an admin has already replaced. Counts only —
 * the names of who got purged are exactly the data this job exists to remove, and
 * they must not arrive in the audit table by the back door.
 */
export async function runDataRetention(now: Date = new Date()): Promise<RetentionRunResult> {
  const { retention } = await getSiteSettings();
  const [leads, messages] = await Promise.all([
    anonymiseExpiredLeads(retention.leadMonths, now),
    deleteExpiredMessages(retention.messageMonths, now),
  ]);
  return {
    anonymised: leads.anonymised,
    notesCleared: leads.notesCleared,
    remaining: leads.remaining || messages.remaining,
    deleted: messages.deleted,
  };
}
