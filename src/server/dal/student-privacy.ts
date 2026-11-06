import "server-only";
import { db } from "@/server/db";
import { destroyAsset } from "@/server/services/storage";

/**
 * Student data requests (docs 01 S13, brief task 9).
 *
 * Two halves of the same obligation. A person may ask what the institute holds
 * about them, and may ask for it back; and they may ask for it removed. The admin
 * panel has neither answer today — the student's record is spread over nine
 * tables and the only way to read it is to click through their profile.
 *
 * Why the export is a Server Action and not a URL like the lead CSV export: the
 * click is step-up protected, and a live authenticator code in a query string
 * lands in browser history, in the server's access log and in any `Referer` the
 * response leaks. The payload therefore travels back through the POST that
 * already proved who the caller is, and the browser assembles the file.
 *
 * Why the erase rewrites instead of deleting: `Invoice.studentId` is
 * `onDelete: Restrict` on purpose — the accountant's ledger must not lose the row
 * a receipt was written against. So the person's identity is replaced and the
 * shell that the money points at stays, which is also what the law asks for:
 * erasure of the *identity*, not destruction of the transaction.
 */

/** Placeholder name left on an erased account. */
export const ERASED_NAME = "Erased student";

/** Placeholder title left on an erased portfolio project. */
export const ERASED_PROJECT_TITLE = "Removed project";

/**
 * Placeholder link. `.invalid` is reserved by RFC 2606, so it can never grow into
 * somebody's real page; the field is NOT NULL and the submission trail keeps its
 * shape, so it gets a value that resolves nowhere.
 */
export const ERASED_URL = "https://erased.invalid/";

/** Reserved domain for the same reason, on the mailbox-shaped column. */
const ERASED_EMAIL_DOMAIN = "erased.invalid";

/**
 * An erased account keeps its row (the money points at it) but must not be able
 * to sign in any more, so the email becomes this: unique per student, so it can
 * never collide with a live address, and on a domain no mail server accepts.
 */
export function erasedEmail(studentId: string): string {
  return `erased-${studentId}@${ERASED_EMAIL_DOMAIN}`;
}

/**
 * Rows per collection in one export. A data-access answer is a document, not a
 * dump: a student with an unusual history should still get a file the browser can
 * open, and the flag in the output says a collection was cut short.
 */
export const EXPORT_ROWS_PER_COLLECTION = 500;

function takeWithinLimit<T>(name: string, rows: T[], truncated: string[]): T[] {
  if (rows.length <= EXPORT_ROWS_PER_COLLECTION) return rows;
  truncated.push(name);
  return rows.slice(0, EXPORT_ROWS_PER_COLLECTION);
}

/** Ask for one more row than the cap so a cut is visible in `truncated`. */
const TAKE = { take: EXPORT_ROWS_PER_COLLECTION + 1 } as const;

/**
 * Columns that do not belong in a hand-over of one person's file.
 *
 * An export answer is read by the student, so it carries other people's identities
 * only when they are the student's own. These columns name the staff member who
 * clicked a button, and the admin audit screen under `audit.view` is where they
 * are meant to be read.
 */
function omit<T extends object>(row: T, keys: readonly string[]): T {
  const copy = { ...row };
  for (const key of keys) delete (copy as Record<string, unknown>)[key];
  return copy;
}

const STAFF_COLUMNS = [
  "createdById",
  "receivedById",
  "voidedById",
  "reviewedById",
  "decidedById",
  "uploadedById",
  "assignedToId",
  "actorId",
] as const;

const withoutStaff = (row: object) => omit(row, STAFF_COLUMNS);

/**
 * Everything this institute holds about one student, as plain data.
 *
 * Nothing here is hidden from the person asking: the enquiry they sent before
 * registering, the notes staff wrote on it, their receipts, their login devices.
 * That is the point of the export, and it is why the action behind it is
 * SUPER_ADMIN-only and step-up protected rather than a read any role with
 * `student.read` gets.
 */
export async function collectStudentData(studentId: string) {
  const profile = await db.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      user: true,
      photo: true,
      lead: { include: { activities: { orderBy: { createdAt: "asc" } } } },
    },
  });
  if (!profile) return null;

  const { user, photo, lead, ...identity } = profile;
  const truncated: string[] = [];

  const [
    enrollments,
    invoices,
    certificates,
    projects,
    submissions,
    assignments,
    uploads,
    sessions,
    trail,
  ] = await Promise.all([
    db.enrollment.findMany({
      where: { studentId },
      orderBy: { enrolledAt: "asc" },
      ...TAKE,
      include: {
        course: { select: { title: true, slug: true } },
        batch: { select: { name: true, startDate: true, timeSlot: true, status: true } },
      },
    }),
    db.invoice.findMany({
      where: { studentId },
      orderBy: { createdAt: "asc" },
      ...TAKE,
      include: {
        installments: { orderBy: { seq: "asc" } },
        payments: { orderBy: { receivedAt: "asc" } },
      },
    }),
    db.certificate.findMany({
      where: { studentId },
      orderBy: { createdAt: "asc" },
      ...TAKE,
      include: { items: { orderBy: { order: "asc" } } },
    }),
    db.portfolioProject.findMany({
      where: { studentId },
      orderBy: { sortOrder: "asc" },
      ...TAKE,
      include: { cover: true },
    }),
    db.assignmentSubmission.findMany({
      where: { studentId },
      orderBy: { createdAt: "asc" },
      ...TAKE,
      include: {
        assignment: { select: { id: true, title: true, dueDate: true, courseId: true } },
      },
    }),
    db.assignmentRecipient.findMany({
      where: { studentId },
      orderBy: { createdAt: "asc" },
      ...TAKE,
      include: {
        assignment: { select: { id: true, title: true, dueDate: true, status: true } },
      },
    }),
    // Their own uploads — the photo, the project covers, anything else the portal
    // stored for them. Listed by id and URL so the file itself can be handed over.
    db.media.findMany({
      where: { uploadedById: user.id },
      orderBy: { createdAt: "asc" },
      ...TAKE,
    }),
    db.session.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      ...TAKE,
      select: {
        id: true,
        createdAt: true,
        updatedAt: true,
        expiresAt: true,
        ipAddress: true,
        userAgent: true,
      },
    }),
    // What staff did with this record. The actor is left out: those are other
    // people's identities, and the admin audit screen under `audit.view` names
    // them when the institute needs to know who.
    db.auditLog.findMany({
      where: {
        OR: [
          { entity: "StudentProfile", entityId: studentId },
          { entity: "User", entityId: user.id },
        ],
      },
      orderBy: { createdAt: "desc" },
      ...TAKE,
      select: { createdAt: true, action: true, entity: true, entityId: true, summary: true, meta: true },
    }),
  ]);

  const rows = {
    enrollments: takeWithinLimit("enrollments", enrollments, truncated),
    invoices: takeWithinLimit("invoices", invoices, truncated),
    certificates: takeWithinLimit("certificates", certificates, truncated),
    projects: takeWithinLimit("projects", projects, truncated),
    submissions: takeWithinLimit("submissions", submissions, truncated),
    assignments: takeWithinLimit("assignments", assignments, truncated),
    uploads: takeWithinLimit("uploads", uploads, truncated),
    sessions: takeWithinLimit("sessions", sessions, truncated),
    trail: takeWithinLimit("trail", trail, truncated),
  };

  const document = {
    kind: "darbar.tech/student-data-export" as const,
    version: 1,
    generatedAt: new Date().toISOString(),
    // What the export covers, and what it does not — a person reading this file
    // should be able to tell that the receipts are in it and the staff names are
    // not, without asking.
    note: "Everything this institute holds about the account below, except the identity of the staff members who touched it (see the institute's audit screen) and the text of any enquiry that was already anonymised by the retention job.",
    student: {
      id: studentId,
      studentCode: identity.studentCode,
      createdAt: identity.createdAt.toISOString(),
      updatedAt: identity.updatedAt.toISOString(),
    },
    // Whether this account has an authenticator enrolled is the institute's
    // security posture, not the student's data.
    account: omit(user, ["role", "twoFactorEnabled"]),
    enquiry: lead && {
      ...withoutStaff(lead),
      activities: lead.activities.map((activity) => withoutStaff(activity)),
    },
    profile: { ...identity, photoUrl: photo?.url ?? null },
    photo: photo ?? null,
    enrollments: rows.enrollments.map(withoutStaff),
    invoices: rows.invoices.map((invoice) => ({
      ...withoutStaff(invoice),
      payments: invoice.payments.map(withoutStaff),
    })),
    certificates: rows.certificates.map(withoutStaff),
    portfolioProjects: rows.projects,
    assignmentSubmissions: rows.submissions.map(withoutStaff),
    assignedToYou: rows.assignments,
    uploads: rows.uploads.map(withoutStaff),
    loginSessions: rows.sessions,
    staffTrail: rows.trail,
    truncated,
  };

  return {
    filename: `darbar-student-${identity.studentCode}.json`,
    document,
    // Counts for the audit entry. Names, addresses and receipt numbers stay in
    // the file the caller just proved their second factor for.
    counts: Object.fromEntries(
      Object.entries(rows).map(([name, list]) => [name, list.length])
    ) as Record<string, number>,
  };
}

export type StudentEraseResult = {
  userId: string;
  nameCleared: number;
  projectsCleared: number;
  submissionsCleared: number;
  sessionsRevoked: number;
  credentialsCleared: number;
  twoFactorCleared: number;
  photoMediaId: string | null;
  photoPublicId: string | null;
};

/**
 * Replace every field that identifies one student, keeping the row.
 *
 * The list is the schema's own: `User.name`/`email`/`image`, and on the profile
 * the phone, date of birth, address, city, country, the free-text bio, the skills
 * and interests, the three links, the photo and the public portfolio address.
 * `studentCode` survives — it is the reference the invoices, the certificates and
 * the class lists were written against, and it points at nobody without this row.
 *
 * `docs/03` planned a `Guardian` table and it was never built, so there is no
 * guardian field to clear; the profile carries the whole student record.
 *
 * What is left alone, and why:
 *  - invoices, installments and receipts — the accountant's retention floor;
 *  - enrollments and certificates — an award and a seat history are facts that
 *    outlive the name on them, and rewriting a printed certificate would falsify
 *    it (revocation is a separate, audited action);
 *  - the enquiry that converted into this student — it is a separate record with
 *    its own retention window, and `Lead.studentId` is how the admission is traced;
 *  - the audit trail — the institute's record of its own staff, kept for years.
 */
export async function eraseStudentIdentity(
  studentId: string
): Promise<StudentEraseResult | null> {
  const target = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      userId: true,
      photoId: true,
      photo: { select: { id: true, publicId: true, source: true } },
    },
  });
  if (!target) return null;

  const { userId } = target;

  const [
    nameCleared,
    profileCleared,
    projectsCleared,
    submissionsCleared,
    sessionsRevoked,
    twoFactorCleared,
    credentialsCleared,
  ] = await db.$transaction([
    db.user.updateMany({
      where: { id: userId },
      data: {
        name: ERASED_NAME,
        email: erasedEmail(studentId),
        image: null,
        // No sign-in, and no "last seen" timestamp on an erased account.
        isActive: false,
        lastLoginAt: null,
      },
    }),
    db.studentProfile.updateMany({
      where: { id: studentId },
      data: {
        phone: null,
        dateOfBirth: null,
        address: null,
        city: null,
        country: null,
        headline: null,
        bio: null,
        skills: [],
        interests: [],
        githubUrl: null,
        linkedinUrl: null,
        websiteUrl: null,
        photoId: null,
        portfolioSlug: null,
        portfolioPublic: false,
        // Staff free text about why a registration was refused; it quotes them.
        rejectionReason: null,
      },
    }),
    db.portfolioProject.updateMany({
      where: { studentId },
      data: {
        title: ERASED_PROJECT_TITLE,
        description: null,
        techStack: [],
        liveUrl: null,
        repoUrl: null,
        coverId: null,
        isPublished: false,
      },
    }),
    db.assignmentSubmission.updateMany({
      where: { studentId },
      data: { url: ERASED_URL, reviewNote: null },
    }),
    db.session.deleteMany({ where: { userId } }),
    db.twoFactor.deleteMany({ where: { userId } }),
    // The credential hash and any stored tokens go with the identity: an erased
    // account is not a disabled account someone might re-enable later.
    db.account.updateMany({
      where: { userId },
      data: { password: null, accessToken: null, refreshToken: null, idToken: null },
    }),
  ]);

  return {
    userId,
    nameCleared: nameCleared.count + profileCleared.count,
    projectsCleared: projectsCleared.count,
    submissionsCleared: submissionsCleared.count,
    sessionsRevoked: sessionsRevoked.count,
    credentialsCleared: credentialsCleared.count,
    twoFactorCleared: twoFactorCleared.count,
    photoMediaId: target.photoId ?? null,
    photoPublicId: target.photo?.source === "UPLOAD" ? target.photo.publicId : null,
  };
}

/**
 * The picture goes last, outside the transaction.
 *
 * Deleting the row can fail while something else still points at it, and a storage
 * call can time out; either way the identity fields are already gone, and an
 * erasure request must not come back as "failed" after it succeeded.
 */
export async function removeErasedPhoto(
  mediaId: string,
  publicId: string | null
): Promise<void> {
  try {
    await db.media.delete({ where: { id: mediaId } });
  } catch {
    // Still referenced somewhere else (or already gone): keep the row.
    return;
  }
  if (publicId) await destroyAsset(publicId);
}
