import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { EnrollmentStatus, StudentApprovalStatus } from "@/generated/prisma/enums";
import { nepalYear } from "@/lib/dates";
import { db } from "../db";
import { cached } from "../cache";
import { isP2002, nextSequence, type Tx } from "./counters";
import {
  seesStudentPii,
  studentScopeWhere,
  type StaffScope,
} from "./scope";
import { PORTFOLIO_TAGS } from "../revalidate";
import type { StudentProfileValues } from "@/lib/validators/student";

/**
 * Student-portal data access (docs/06 §2: pages call DAL functions, never
 * `db.*` directly). Private reads are uncached; the public portfolio read is
 * cached under the shared `portfolio` tag and invalidated on any profile or
 * project write (docs/06 §5-7).
 */

export const STUDENT_CODE_PREFIX = "DT-STU";
const SEQUENCE_PADDING = 5;
const MAX_ANNUAL_SEQUENCE = 99_999;

/**
 * Next sequential student code in the `DT-STU-{year}-{NNNNN}` series, taken from the
 * `Counter` row for that year so concurrent admissions cannot receive the same code.
 * This is the only student identifier (docs 02 B4); certificates for a portal
 * account copy it into `recipientIdNumber` instead of minting a second series.
 *
 * Pass the surrounding transaction so the code is consumed by the same commit that
 * inserts the profile.
 */
export async function generateStudentCode(
  year: number = nepalYear(),
  tx?: Tx
): Promise<string> {
  const sequence = await nextSequence(`student:${year}`, tx);
  if (!Number.isSafeInteger(sequence) || sequence > MAX_ANNUAL_SEQUENCE) {
    throw new Error("Student code sequence exhausted for this year");
  }
  return `${STUDENT_CODE_PREFIX}-${year}-${String(sequence).padStart(
    SEQUENCE_PADDING,
    "0"
  )}`;
}

const profileInclude = {
  user: { select: { name: true, email: true, image: true } },
  photo: { select: { url: true } },
} satisfies Prisma.StudentProfileInclude;

type ProfileRow = Prisma.StudentProfileGetPayload<{ include: typeof profileInclude }>;

export type StudentProfileView = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  studentCode: string;
  phone: string | null;
  dateOfBirth: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  headline: string | null;
  bio: string | null;
  skills: string[];
  interests: string[];
  githubUrl: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  photoUrl: string | null;
  portfolioSlug: string | null;
  portfolioPublic: boolean;
  approvalStatus: string;
  rejectionReason: string | null;
  createdAt: string;
};

function toProfileView(row: ProfileRow): StudentProfileView {
  return {
    id: row.id,
    userId: row.userId,
    name: row.user.name,
    email: row.user.email,
    image: row.user.image,
    studentCode: row.studentCode,
    phone: row.phone,
    dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString().slice(0, 10) : null,
    address: row.address,
    city: row.city,
    country: row.country,
    headline: row.headline,
    bio: row.bio,
    skills: row.skills,
    interests: row.interests,
    githubUrl: row.githubUrl,
    linkedinUrl: row.linkedinUrl,
    websiteUrl: row.websiteUrl,
    photoUrl: row.photo?.url ?? null,
    portfolioSlug: row.portfolioSlug,
    portfolioPublic: row.portfolioPublic,
    approvalStatus: row.approvalStatus,
    rejectionReason: row.rejectionReason,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getStudentProfileByUserId(
  userId: string
): Promise<StudentProfileView | null> {
  const row = await db.studentProfile.findUnique({
    where: { userId },
    include: profileInclude,
  });
  return row ? toProfileView(row) : null;
}

export async function createStudentProfile(
  userId: string,
  data: { phone?: string | null }
): Promise<StudentProfileView> {
  const studentCode = await generateStudentCode();
  const row = await db.studentProfile.create({
    data: {
      userId,
      studentCode,
      phone: data.phone || null,
      skills: [],
      interests: [],
    },
    include: profileInclude,
  });
  return toProfileView(row);
}

/**
 * Creates the portal account in one transaction: the `User` (role STUDENT), its
 * better-auth credential `Account`, and the `StudentProfile`. Keeping all three
 * together means a failed registration never leaves an account that can sign in
 * without a profile.
 */
export async function createStudentAccount(data: {
  name: string;
  email: string;
  phone?: string | null;
  passwordHash: string;
}): Promise<{ userId: string }> {
  return db.$transaction(async (tx) => {
    // Inside the transaction: the code is consumed by the same commit that
    // creates the profile, so a failed insert cannot leave the next student
    // holding a number that was already handed out.
    const studentCode = await generateStudentCode(nepalYear(), tx);
    const user = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: "STUDENT",
        isActive: true,
        // docs 01 §S3: a self-service sign-up is unconfirmed until the person
        // follows the verification link; the portal gate reads this flag.
        emailVerified: false,
      },
      select: { id: true },
    });
    await tx.account.create({
      data: {
        providerId: "credential",
        accountId: user.id,
        userId: user.id,
        password: data.passwordHash,
      },
    });
    await tx.studentProfile.create({
      data: {
        userId: user.id,
        studentCode,
        phone: data.phone || null,
        skills: [],
        interests: [],
      },
    });
    return { userId: user.id };
  });
}

export async function updateStudentProfile(
  id: string,
  values: StudentProfileValues
): Promise<StudentProfileView> {
  const dateOfBirth = values.dateOfBirth ? new Date(values.dateOfBirth) : null;
  const row = await db.studentProfile.update({
    where: { id },
    data: {
      phone: values.phone || null,
      dateOfBirth: Number.isNaN(dateOfBirth?.getTime()) ? null : dateOfBirth,
      address: values.address || null,
      city: values.city || null,
      country: values.country || null,
      headline: values.headline || null,
      bio: values.bio || null,
      skills: values.skills,
      interests: values.interests,
      githubUrl: values.githubUrl || null,
      linkedinUrl: values.linkedinUrl || null,
      websiteUrl: values.websiteUrl || null,
      portfolioSlug: values.portfolioSlug || null,
      portfolioPublic: values.portfolioPublic,
    },
    include: profileInclude,
  });
  return toProfileView(row);
}

/** True when another profile already owns this portfolio slug. */
export async function isPortfolioSlugTaken(slug: string, excludeId: string): Promise<boolean> {
  const row = await db.studentProfile.findFirst({
    where: { portfolioSlug: slug, id: { not: excludeId } },
    select: { id: true },
  });
  return Boolean(row);
}

// ───────────── Enrollments & certificates ─────────────

/**
 * The statuses that occupy the student's one place in a course — and exactly the
 * set the partial unique index `Enrollment_live_student_course_key` covers.
 * Anything else (DROPPED, REJECTED, COMPLETED) is history: the row stays as it was
 * and the student is free to ask again (fix guide §9).
 */
export const LIVE_ENROLLMENT_STATUSES: readonly EnrollmentStatus[] = [
  "PENDING",
  "ACTIVE",
  "WAITLISTED",
];

export type EnrollmentRequestResult =
  | { kind: "created" }
  | { kind: "existing"; status: string }
  /** A declined request cannot be re-raised until the cooldown ends. */
  | { kind: "blocked"; retryAfter: Date };

/** How long a declined request stays closed (docs 02 B6). */
const RE_REQUEST_BLOCK = 30 * 24 * 60 * 60 * 1000;

/**
 * Student-initiated enrollment request. Staff approve it later by moving the
 * row to ACTIVE.
 *
 * A request never rewrites a finished row: DROPPED, REJECTED (once the cooldown
 * has passed) and COMPLETED each leave their history in place and get a new
 * PENDING row alongside them. Before this, the only way to re-take a course was
 * to overwrite the old row, which erased when the student left, why, and who
 * decided (fix guide §9). What still cannot happen is two live rows for one
 * course — the database enforces that, not this function.
 */
export async function requestCourseEnrollment(
  studentId: string,
  courseId: string
): Promise<EnrollmentRequestResult | null> {
  const course = await db.course.findFirst({
    where: { id: courseId, status: "PUBLISHED" },
    select: { id: true },
  });
  if (!course) return null;

  // Newest row first: a live one answers "you already asked", the most recent
  // rejection answers "you may not ask again yet".
  const rows = await db.enrollment.findMany({
    where: { studentId, courseId },
    orderBy: { createdAt: "desc" },
    select: { status: true, decidedAt: true },
  });

  const live = rows.find((row) => LIVE_ENROLLMENT_STATUSES.includes(row.status));
  if (live) return { kind: "existing", status: live.status };

  const lastRejection = rows.find((row) => row.status === "REJECTED");
  if (lastRejection?.decidedAt) {
    const retryAfter = new Date(lastRejection.decidedAt.getTime() + RE_REQUEST_BLOCK);
    if (retryAfter.getTime() > Date.now()) {
      return { kind: "blocked", retryAfter };
    }
  }

  try {
    await db.enrollment.create({
      data: { studentId, courseId, status: "PENDING" },
    });
    return { kind: "created" };
  } catch (error) {
    // The partial unique index is the real guard: two tabs can both read "no live
    // row" and both insert. Report the winner's row instead of a second one.
    if (isP2002(error)) {
      const row = await db.enrollment.findFirst({
        where: { studentId, courseId, status: { in: [...LIVE_ENROLLMENT_STATUSES] } },
        select: { status: true },
      });
      return { kind: "existing", status: row?.status ?? "PENDING" };
    }
    throw error;
  }
}

export type StudentEnrollmentView = {
  id: string;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  course: { id: string; slug: string; title: string; tagline: string; coverUrl: string | null };
  batch: { id: string; name: string; startDate: string; timeSlot: string } | null;
  /** Set when staff declined or waitlisted the request (docs 02 B6). */
  decisionNote: string | null;
};

export async function listStudentEnrollments(
  studentId: string
): Promise<StudentEnrollmentView[]> {
  const rows = await db.enrollment.findMany({
    where: { studentId },
    orderBy: [{ enrolledAt: "desc" }],
    include: {
      course: {
        select: {
          id: true,
          slug: true,
          title: true,
          tagline: true,
          cover: { select: { url: true } },
        },
      },
      batch: { select: { id: true, name: true, startDate: true, timeSlot: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    status: row.status,
    enrolledAt: row.enrolledAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    course: {
      id: row.course.id,
      slug: row.course.slug,
      title: row.course.title,
      tagline: row.course.tagline,
      coverUrl: row.course.cover?.url ?? null,
    },
    batch: row.batch
      ? {
          id: row.batch.id,
          name: row.batch.name,
          startDate: row.batch.startDate.toISOString().slice(0, 10),
          timeSlot: row.batch.timeSlot,
        }
      : null,
    decisionNote: row.decisionNote,
  }));
}

export type StudentCertificateView = {
  id: string;
  certificateNumber: string | null;
  courseName: string;
  status: string;
  grade: string | null;
  programDuration: string | null;
  completionDate: string | null;
  issueDate: string | null;
  issuedAt: string | null;
  revokedAt: string | null;
  reissuedAt: string | null;
  verificationToken: string | null;
};

/**
 * A student's certificates, linked explicitly via `studentId`. The link is set
 * server-side when the recipient id matches the student's code (docs 02 B4), so a
 * code typed into an unrelated certificate cannot push documents into this portal.
 */
export async function listStudentCertificates(
  profile: { id: string }
): Promise<StudentCertificateView[]> {
  const rows = await db.certificate.findMany({
    where: { studentId: profile.id },
    orderBy: [{ issuedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      certificateNumber: true,
      courseName: true,
      status: true,
      grade: true,
      programDuration: true,
      completionDate: true,
      issueDate: true,
      issuedAt: true,
      revokedAt: true,
      reissuedAt: true,
      verificationToken: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    certificateNumber: row.certificateNumber,
    courseName: row.courseName,
    status: row.status,
    grade: row.grade,
    programDuration: row.programDuration,
    completionDate: row.completionDate?.toISOString() ?? null,
    issueDate: row.issueDate?.toISOString() ?? null,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    reissuedAt: row.reissuedAt?.toISOString() ?? null,
    verificationToken: row.verificationToken,
  }));
}

/**
 * Download metadata for one certificate owned by this student. Ownership is the
 * `studentId` link alone (docs 02 B4): the student code is printed on the public
 * portfolio, so matching on it would let any holder of someone else's code read
 * that document. Any other id returns null, so another graduate's certificate is
 * invisible rather than merely forbidden.
 */
export async function getStudentCertificateDownloadMeta(
  profile: { id: string },
  id: string
): Promise<{ certificateNumber: string | null; pdfUrl: string | null; status: string } | null> {
  return db.certificate.findFirst({
    where: { id, studentId: profile.id },
    select: { certificateNumber: true, pdfUrl: true, status: true },
  });
}

// ───────────── Portfolio projects (private, owner-scoped) ─────────────

export type StudentProjectView = {
  id: string;
  title: string;
  description: string | null;
  techStack: string[];
  liveUrl: string | null;
  repoUrl: string | null;
  coverUrl: string | null;
  sortOrder: number;
  isPublished: boolean;
  updatedAt: string;
};

const projectSelect = {
  id: true,
  title: true,
  description: true,
  techStack: true,
  liveUrl: true,
  repoUrl: true,
  cover: { select: { url: true } },
  sortOrder: true,
  isPublished: true,
  updatedAt: true,
} satisfies Prisma.PortfolioProjectSelect;

type ProjectRow = Prisma.PortfolioProjectGetPayload<{ select: typeof projectSelect }>;

function toProjectView(row: ProjectRow): StudentProjectView {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    techStack: row.techStack,
    liveUrl: row.liveUrl,
    repoUrl: row.repoUrl,
    coverUrl: row.cover?.url ?? null,
    sortOrder: row.sortOrder,
    isPublished: row.isPublished,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listStudentProjects(studentId: string): Promise<StudentProjectView[]> {
  const rows = await db.portfolioProject.findMany({
    where: { studentId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: projectSelect,
  });
  return rows.map(toProjectView);
}

export type PortfolioProjectInput = {
  title: string;
  description: string | null;
  techStack: string[];
  liveUrl: string | null;
  repoUrl: string | null;
  isPublished: boolean;
  sortOrder: number;
};

export async function createStudentProject(
  studentId: string,
  data: PortfolioProjectInput
): Promise<StudentProjectView> {
  const row = await db.portfolioProject.create({
    data: { studentId, ...data },
    select: projectSelect,
  });
  return toProjectView(row);
}

/** Owner-scoped update: a row belonging to another student is not writable. */
export async function updateStudentProject(
  studentId: string,
  id: string,
  data: PortfolioProjectInput
): Promise<StudentProjectView | null> {
  const existing = await db.portfolioProject.findFirst({
    where: { id, studentId },
    select: { id: true },
  });
  if (!existing) return null;
  const row = await db.portfolioProject.update({
    where: { id },
    data,
    select: projectSelect,
  });
  return toProjectView(row);
}

export async function deleteStudentProject(studentId: string, id: string): Promise<boolean> {
  const result = await db.portfolioProject.deleteMany({ where: { id, studentId } });
  return result.count > 0;
}

// ───────────── Public portfolio (cached) ─────────────

export type PublicPortfolioView = {
  slug: string;
  name: string;
  headline: string | null;
  bio: string | null;
  studentCode: string;
  photoUrl: string | null;
  skills: string[];
  interests: string[];
  githubUrl: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  projects: {
    id: string;
    title: string;
    description: string | null;
    techStack: string[];
    liveUrl: string | null;
    repoUrl: string | null;
    coverUrl: string | null;
  }[];
  certificates: {
    id: string;
    courseName: string;
    certificateNumber: string | null;
    issueDate: string | null;
    verificationToken: string | null;
  }[];
  completedCourses: { title: string; slug: string }[];
};

/**
 * Public, cacheable portfolio. Returns null when the slug does not exist or the
 * student has not switched the portfolio public. PII (`phone`, `dateOfBirth`,
 * `address`, email) is deliberately excluded (certificate docs privacy rule).
 */
export const getPublicPortfolioBySlug = cached(
  PORTFOLIO_TAGS,
  async (slug: string): Promise<PublicPortfolioView | null> => {
    const row = await db.studentProfile.findFirst({
      where: { portfolioSlug: slug, portfolioPublic: true },
      include: {
        user: { select: { name: true } },
        photo: { select: { url: true } },
        projects: {
          where: { isPublished: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            title: true,
            description: true,
            techStack: true,
            liveUrl: true,
            repoUrl: true,
            cover: { select: { url: true } },
          },
        },
        certificates: {
          where: { status: "ISSUED" },
          orderBy: [{ issuedAt: "desc" }],
          select: {
            id: true,
            courseName: true,
            certificateNumber: true,
            issueDate: true,
            verificationToken: true,
          },
        },
        enrollments: {
          where: { status: "COMPLETED" },
          orderBy: [{ completedAt: "desc" }],
          select: { course: { select: { title: true, slug: true } } },
        },
      },
    });

    if (!row) return null;

    return {
      slug: row.portfolioSlug!,
      name: row.user.name,
      headline: row.headline,
      bio: row.bio,
      studentCode: row.studentCode,
      photoUrl: row.photo?.url ?? null,
      skills: row.skills,
      interests: row.interests,
      githubUrl: row.githubUrl,
      linkedinUrl: row.linkedinUrl,
      websiteUrl: row.websiteUrl,
      projects: row.projects.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        techStack: p.techStack,
        liveUrl: p.liveUrl,
        repoUrl: p.repoUrl,
        coverUrl: p.cover?.url ?? null,
      })),
      certificates: row.certificates.map((c) => ({
        id: c.id,
        courseName: c.courseName,
        certificateNumber: c.certificateNumber,
        issueDate: c.issueDate?.toISOString() ?? null,
        verificationToken: c.verificationToken,
      })),
      completedCourses: row.enrollments.map((e) => e.course),
    };
  }
);

// ───────────── Staff approval & enrollment review ─────────────

export type AdminStudentRow = {
  id: string;
  studentCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  approvalStatus: string;
  createdAt: string;
};

/**
 * Registration review list. `approvalStatus` is declared PENDING-first in the
 * enum, so ascending enum order happens to surface pending rows on top.
 *
 * `scope` (fix guide §5) both narrows the rows and the columns: an INSTRUCTOR
 * gets their own batch roster with contact details blanked, so the page never
 * receives data it would have to remember to hide.
 */
/**
 * Rows on screen before the list says "use the search box". The page has no
 * pager, so the ceiling is real: it is asked for one row deeper than the cap,
 * which is how `truncated` can promise there is more rather than guess.
 */
export const STUDENTS_LIST_LIMIT = 200;

export async function listStudentsForAdmin(
  opts: { status?: string; query?: string },
  scope: StaffScope
): Promise<{ rows: AdminStudentRow[]; truncated: boolean }> {
  const query = opts.query?.trim();
  const seesPii = seesStudentPii(scope.role);
  const rows = await db.studentProfile.findMany({
    where: {
      AND: [
        studentScopeWhere(scope),
        ...(opts.status && opts.status !== "ALL"
          ? [{ approvalStatus: opts.status as StudentApprovalStatus }]
          : []),
        ...(query
          ? [
              {
                OR: [
                  { user: { name: { contains: query, mode: "insensitive" as const } } },
                  { user: { email: { contains: query, mode: "insensitive" as const } } },
                  { studentCode: { contains: query } },
                ],
              },
            ]
          : []),
      ],
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: [{ approvalStatus: "asc" }, { createdAt: "desc" }],
    take: STUDENTS_LIST_LIMIT + 1,
  });
  return {
    truncated: rows.length > STUDENTS_LIST_LIMIT,
    rows: rows.slice(0, STUDENTS_LIST_LIMIT).map((row) => ({
      id: row.id,
      studentCode: row.studentCode,
      name: row.user.name,
      email: seesPii ? row.user.email : null,
      phone: seesPii ? row.phone : null,
      city: seesPii ? row.city : null,
      approvalStatus: row.approvalStatus,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/** Status counts for the filter chips, over the same rows the list shows. */
export async function countStudentsByStatus(
  scope: StaffScope
): Promise<Record<string, number>> {
  const groups = await db.studentProfile.groupBy({
    by: ["approvalStatus"],
    where: studentScopeWhere(scope),
    _count: { _all: true },
  });
  const out: Record<string, number> = { ALL: 0 };
  for (const group of groups) {
    out[group.approvalStatus] = group._count._all;
    out.ALL += group._count._all;
  }
  return out;
}

export type AdminStudentDetail = {
  id: string;
  userId: string;
  studentCode: string;
  name: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  headline: string | null;
  bio: string | null;
  githubUrl: string | null;
  linkedinUrl: string | null;
  websiteUrl: string | null;
  photoUrl: string | null;
  approvalStatus: string;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  portfolioSlug: string | null;
  portfolioPublic: boolean;
  enrollments: {
    id: string;
    status: string;
    enrolledAt: string;
    courseId: string;
    course: { title: string; slug: string };
    batch: { id: string; name: string } | null;
    /** Staff note from the last decision (docs 02 B6). */
    decisionNote: string | null;
    decidedAt: string | null;
  }[];
  projectCount: number;
};

/**
 * One student for the review screen.
 *
 * The id is matched *together with* the caller's scope, and `findFirst` is what
 * makes that work: an id that is not in the instructor's batches matches
 * nothing, so guessing a URL reads as "no such student" instead of confirming
 * the id belongs to someone else (fix guide §5, Done when).
 */
export async function getStudentForAdmin(
  id: string,
  scope: StaffScope
): Promise<AdminStudentDetail | null> {
  const seesPii = seesStudentPii(scope.role);
  const row = await db.studentProfile.findFirst({
    where: { AND: [{ id }, studentScopeWhere(scope)] },
    include: {
      user: { select: { id: true, name: true, email: true } },
      photo: { select: { url: true } },
      enrollments: {
        where:
          scope.role === "INSTRUCTOR" ? { batch: { instructorId: scope.userId } } : {},
        orderBy: { enrolledAt: "desc" },
        include: {
          course: { select: { title: true, slug: true } },
          batch: { select: { id: true, name: true } },
        },
      },
      _count: { select: { projects: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    studentCode: row.studentCode,
    name: row.user.name,
    email: seesPii ? row.user.email : null,
    phone: seesPii ? row.phone : null,
    dateOfBirth:
      seesPii && row.dateOfBirth ? row.dateOfBirth.toISOString().slice(0, 10) : null,
    address: seesPii ? row.address : null,
    city: seesPii ? row.city : null,
    country: seesPii ? row.country : null,
    headline: seesPii ? row.headline : null,
    bio: seesPii ? row.bio : null,
    githubUrl: seesPii ? row.githubUrl : null,
    linkedinUrl: seesPii ? row.linkedinUrl : null,
    websiteUrl: seesPii ? row.websiteUrl : null,
    photoUrl: row.photo?.url ?? null,
    approvalStatus: row.approvalStatus,
    rejectionReason: row.rejectionReason,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    portfolioSlug: row.portfolioSlug,
    portfolioPublic: row.portfolioPublic,
    enrollments: row.enrollments.map((e) => ({
      id: e.id,
      status: e.status,
      enrolledAt: e.enrolledAt.toISOString(),
      courseId: e.courseId,
      course: { title: e.course.title, slug: e.course.slug },
      batch: e.batch ? { id: e.batch.id, name: e.batch.name } : null,
      decisionNote: e.decisionNote,
      decidedAt: e.decidedAt?.toISOString() ?? null,
    })),
    projectCount: row._count.projects,
  };
}

export async function setStudentApproval(
  id: string,
  status: StudentApprovalStatus,
  reviewedById: string,
  rejectionReason?: string | null
): Promise<boolean> {
  const result = await db.studentProfile.updateMany({
    where: { id },
    data: {
      approvalStatus: status,
      reviewedAt: new Date(),
      reviewedById,
      rejectionReason: status === "REJECTED" ? (rejectionReason ?? null) : null,
    },
  });
  return result.count > 0;
}

/**
 * Raised inside the approving transaction when the batch has no free seat.
 * Throwing is what rolls the enrollment update back, so the request stays
 * PENDING and the caller can offer the waiting list instead (docs 02 B1).
 */
export class BatchFullError extends Error {
  constructor(readonly batchId: string) {
    super("Batch has no free seats");
    this.name = "BatchFullError";
  }
}

export type EnrollmentDecisionResult = { ok: true } | { ok: false; error: string };

const ENROLLMENT_NOT_FOUND = "Enrollment not found";
const DECISION_STALE = "This request was already handled. Refresh the page.";
const BATCH_CLOSED = "That batch is closed.";

/**
 * Claim a seat atomically: the guarded UPDATE only matches while a seat is
 * free, so two approvals racing for the last seat cannot both succeed.
 * Returns false when nothing was claimed.
 */
async function claimSeat(tx: Tx, batchId: string): Promise<boolean> {
  const claimed = await tx.$executeRaw`
    UPDATE "Batch" SET "seatsTaken" = "seatsTaken" + 1
    WHERE id = ${batchId} AND "seatsTaken" < "seatsTotal"`;
  return claimed === 1;
}

/** Release a seat; the `> 0` guard keeps a double release from going negative. */
async function releaseSeat(tx: Tx, batchId: string | null): Promise<void> {
  if (!batchId) return;
  await tx.$executeRaw`
    UPDATE "Batch" SET "seatsTaken" = "seatsTaken" - 1
    WHERE id = ${batchId} AND "seatsTaken" > 0`;
}

/**
 * Approve a pending/waitlisted request into a specific batch. The seat claim and
 * the status flip are one transaction: a request can never be ACTIVE without a
 * seat, and a seat can never be taken by a request that did not become ACTIVE.
 * `BatchFullError` is thrown from inside, so nothing persists when it fails.
 */
export async function approveEnrollment(
  enrollmentId: string,
  batchId: string,
  decidedById: string
): Promise<EnrollmentDecisionResult> {
  return db.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { courseId: true, status: true },
    });
    if (!enrollment) return { ok: false, error: ENROLLMENT_NOT_FOUND };

    const batch = await tx.batch.findUnique({
      where: { id: batchId },
      select: { courseId: true, status: true },
    });
    if (!batch || batch.courseId !== enrollment.courseId) {
      return { ok: false, error: "That batch does not belong to this course" };
    }
    if (batch.status === "CANCELLED" || batch.status === "COMPLETED") {
      return { ok: false, error: BATCH_CLOSED };
    }

    const moved = await tx.enrollment.updateMany({
      where: { id: enrollmentId, status: { in: ["PENDING", "WAITLISTED"] } },
      data: {
        status: "ACTIVE",
        batchId,
        decisionNote: null,
        decidedById,
        decidedAt: new Date(),
      },
    });
    if (moved.count !== 1) return { ok: false, error: DECISION_STALE };

    if (!(await claimSeat(tx, batchId))) throw new BatchFullError(batchId);
    return { ok: true };
  });
}

/**
 * Put a request on the waiting list: no seat is taken, so a full batch never
 * blocks the decision. `batchId` records which batch they are queued for.
 */
export async function waitlistEnrollment(
  enrollmentId: string,
  decidedById: string,
  note: string | null,
  batchId?: string | null
): Promise<EnrollmentDecisionResult> {
  return db.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { status: true, batchId: true },
    });
    if (!enrollment) return { ok: false, error: ENROLLMENT_NOT_FOUND };
    if (enrollment.status === "ACTIVE") {
      return { ok: false, error: "This student already holds a seat. Decline the request to free it." };
    }

    const moved = await tx.enrollment.updateMany({
      where: { id: enrollmentId, status: { in: ["PENDING", "WAITLISTED"] } },
      data: {
        status: "WAITLISTED",
        batchId: batchId ?? enrollment.batchId,
        decisionNote: note,
        decidedById,
        decidedAt: new Date(),
      },
    });
    if (moved.count !== 1) return { ok: false, error: DECISION_STALE };
    return { ok: true };
  });
}

/**
 * Decline a request → REJECTED with a note the student can read (docs 02 B6).
 * Declining an ACTIVE row releases its seat in the same transaction.
 *
 * A COMPLETED row is not declinable (reaudit N7): it has already taken its seat to
 * the end of the course and earned its certificate, so refusing it afterwards would
 * rewrite finished history and free a seat nobody vacated. Corrections belong on the
 * certificate and attendance records, not by turning the enrollment back into a
 * rejection.
 */
export async function declineEnrollment(
  enrollmentId: string,
  decidedById: string,
  note: string
): Promise<EnrollmentDecisionResult> {
  return db.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { status: true, batchId: true },
    });
    if (!enrollment) return { ok: false, error: ENROLLMENT_NOT_FOUND };
    if (enrollment.status === "COMPLETED") {
      return { ok: false, error: "This course is already finished, so it cannot be declined" };
    }

    const moved = await tx.enrollment.updateMany({
      where: { id: enrollmentId, status: { in: ["PENDING", "WAITLISTED", "ACTIVE"] } },
      data: {
        status: "REJECTED",
        decisionNote: note,
        decidedById,
        decidedAt: new Date(),
      },
    });
    if (moved.count !== 1) return { ok: false, error: DECISION_STALE };

    if (enrollment.status === "ACTIVE") await releaseSeat(tx, enrollment.batchId);
    return { ok: true };
  });
}

/**
 * Move an ACTIVE student between batches of the same course: release the old
 * seat and claim the new one in a single transaction, so the destination can
 * reject the move (full) without leaving the student seatless.
 */
export async function moveEnrollmentBatch(
  enrollmentId: string,
  toBatchId: string,
  decidedById: string
): Promise<EnrollmentDecisionResult> {
  return db.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { courseId: true, status: true, batchId: true },
    });
    if (!enrollment) return { ok: false, error: ENROLLMENT_NOT_FOUND };
    if (enrollment.status !== "ACTIVE") {
      return { ok: false, error: "Only an approved enrollment can be moved between batches" };
    }
    if (enrollment.batchId === toBatchId) return { ok: false, error: "Already in that batch" };

    const batch = await tx.batch.findUnique({
      where: { id: toBatchId },
      select: { courseId: true, status: true },
    });
    if (!batch || batch.courseId !== enrollment.courseId) {
      return { ok: false, error: "That batch does not belong to this course" };
    }
    if (batch.status === "CANCELLED" || batch.status === "COMPLETED") {
      return { ok: false, error: BATCH_CLOSED };
    }

    const moved = await tx.enrollment.updateMany({
      where: { id: enrollmentId, status: "ACTIVE", batchId: enrollment.batchId },
      data: { batchId: toBatchId, decidedById, decidedAt: new Date() },
    });
    if (moved.count !== 1) return { ok: false, error: DECISION_STALE };

    if (!(await claimSeat(tx, toBatchId))) throw new BatchFullError(toBatchId);
    await releaseSeat(tx, enrollment.batchId);
    return { ok: true };
  });
}

/**
 * Mark a course finished. `completedAt` is set here and only here (docs 02 B6)
 * so the portfolio's "completed courses" list has a reliable date; a student
 * who drops instead becomes DROPPED and frees the seat.
 */
export async function completeEnrollment(
  enrollmentId: string,
  decidedById: string
): Promise<EnrollmentDecisionResult> {
  return db.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { status: true, batchId: true, completedAt: true },
    });
    if (!enrollment) return { ok: false, error: ENROLLMENT_NOT_FOUND };

    const moved = await tx.enrollment.updateMany({
      where: { id: enrollmentId, status: "ACTIVE" },
      data: {
        status: "COMPLETED",
        completedAt: enrollment.completedAt ?? new Date(),
        decidedById,
        decidedAt: new Date(),
      },
    });
    if (moved.count !== 1) return { ok: false, error: DECISION_STALE };

    // A finished course keeps its historical seat: the nightly reconcile in
    // doc 07 counts ACTIVE and COMPLETED together.
    return { ok: true };
  });
}

/**
 * Student-initiated withdrawal. Kept separate from decline so the audit trail
 * can tell "we rejected them" from "they left" (docs 02 B6), and so the seat
 * goes back to the batch.
 */
export async function dropEnrollment(
  enrollmentId: string,
  studentId: string,
  reason: string | null
): Promise<EnrollmentDecisionResult> {
  return db.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.findFirst({
      where: { id: enrollmentId, studentId },
      select: { status: true, batchId: true },
    });
    if (!enrollment) return { ok: false, error: ENROLLMENT_NOT_FOUND };

    const moved = await tx.enrollment.updateMany({
      where: { id: enrollmentId, studentId, status: { in: ["PENDING", "WAITLISTED", "ACTIVE"] } },
      data: { status: "DROPPED", decisionNote: reason },
    });
    if (moved.count !== 1) return { ok: false, error: DECISION_STALE };

    if (enrollment.status === "ACTIVE") await releaseSeat(tx, enrollment.batchId);
    return { ok: true };
  });
}

/**
 * Points the profile at a new photo Media row and reports the replaced one so
 * the caller can destroy the stale asset. Student photos are single-owner, so
 * the replaced row is safe to delete.
 */
export async function replaceStudentPhoto(
  profileId: string,
  mediaId: string
): Promise<{ replacedMediaId: string | null; replacedPublicId: string | null }> {
  const current = await db.studentProfile.findUnique({
    where: { id: profileId },
    select: {
      photoId: true,
      photo: { select: { publicId: true, source: true } },
    },
  });
  await db.studentProfile.update({
    where: { id: profileId },
    data: { photoId: mediaId },
  });
  if (current?.photoId && current.photoId !== mediaId && current.photo?.source === "UPLOAD") {
    return { replacedMediaId: current.photoId, replacedPublicId: current.photo.publicId };
  }
  return { replacedMediaId: null, replacedPublicId: null };
}

export async function deleteStudentPhotoMedia(mediaId: string): Promise<void> {
  try {
    await db.media.delete({ where: { id: mediaId } });
  } catch {
    // Still referenced somewhere else (or already gone): keep the row.
  }
}
