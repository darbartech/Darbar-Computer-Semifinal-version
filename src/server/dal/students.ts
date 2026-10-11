import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { StudentApprovalStatus } from "@/generated/prisma/enums";
import { db } from "../db";
import { cached } from "../cache";
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

/**
 * Next sequential student code in the `DT-STU-{year}-{NNNNN}` series, derived
 * from the highest code already stored for the year. Mirrors
 * `generateStudentId` in `src/server/certificates/issuance.ts` — the DB unique
 * index on `studentCode` is the final backstop. Note the `STU` (portal) vs
 * `STD` (certificate recipient id) prefixes so the two series never collide.
 */
export async function generateStudentCode(
  year: number = new Date().getFullYear()
): Promise<string> {
  const prefix = `${STUDENT_CODE_PREFIX}-${year}-`;
  const rows = await db.studentProfile.findMany({
    where: { studentCode: { startsWith: prefix } },
    select: { studentCode: true },
  });

  let maxSequence = 0;
  for (const row of rows) {
    const suffix = row.studentCode.slice(prefix.length);
    if (/^\d+$/.test(suffix)) {
      const value = Number(suffix);
      if (Number.isSafeInteger(value) && value > maxSequence) maxSequence = value;
    }
  }

  const next = maxSequence + 1;
  if (!Number.isSafeInteger(next) || String(next).length > SEQUENCE_PADDING + 1) {
    throw new Error("Student code sequence exhausted for this year");
  }
  return `${prefix}${String(next).padStart(SEQUENCE_PADDING, "0")}`;
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
  const studentCode = await generateStudentCode();
  return db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: data.name,
        email: data.email,
        role: "STUDENT",
        isActive: true,
        emailVerified: true,
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

export type EnrollmentRequestResult =
  | { kind: "created" }
  | { kind: "existing"; status: string };

/**
 * Student-initiated enrollment request. Staff approve it later by moving the
 * row to ACTIVE; DROPPED rows can be re-requested.
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

  const existing = await db.enrollment.findUnique({
    where: { studentId_courseId: { studentId, courseId } },
    select: { status: true },
  });
  if (existing && existing.status !== "DROPPED") {
    return { kind: "existing", status: existing.status };
  }
  if (existing) {
    await db.enrollment.update({
      where: { studentId_courseId: { studentId, courseId } },
      data: { status: "PENDING" },
    });
    return { kind: "created" };
  }

  await db.enrollment.create({
    data: { studentId, courseId, status: "PENDING" },
  });
  return { kind: "created" };
}

export type StudentEnrollmentView = {
  id: string;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
  course: { id: string; slug: string; title: string; tagline: string; coverUrl: string | null };
  batch: { id: string; name: string; startDate: string; timeSlot: string } | null;
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
  pdfUrl: string | null;
};

/**
 * A student's certificates: linked explicitly via `studentId`, or matched by
 * the certificate's recipient id equal to the portal student code so an admin
 * can surface an already-issued certificate by pasting the code.
 */
export async function listStudentCertificates(
  profile: { id: string; studentCode: string }
): Promise<StudentCertificateView[]> {
  const rows = await db.certificate.findMany({
    where: {
      OR: [{ studentId: profile.id }, { recipientIdNumber: profile.studentCode }],
    },
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
      pdfUrl: true,
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
    pdfUrl: row.pdfUrl,
  }));
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
  email: string;
  phone: string | null;
  city: string | null;
  approvalStatus: string;
  createdAt: string;
};

/**
 * Registration review list. `approvalStatus` is declared PENDING-first in the
 * enum, so ascending enum order happens to surface pending rows on top.
 */
export async function listStudentsForAdmin(
  opts: { status?: string; query?: string } = {}
): Promise<AdminStudentRow[]> {
  const query = opts.query?.trim();
  const rows = await db.studentProfile.findMany({
    where: {
      ...(opts.status && opts.status !== "ALL"
        ? { approvalStatus: opts.status as StudentApprovalStatus }
        : {}),
      ...(query
        ? {
            OR: [
              { user: { name: { contains: query, mode: "insensitive" } } },
              { user: { email: { contains: query, mode: "insensitive" } } },
              { studentCode: { contains: query } },
            ],
          }
        : {}),
    },
    include: { user: { select: { name: true, email: true } } },
    orderBy: [{ approvalStatus: "asc" }, { createdAt: "desc" }],
    take: 200,
  });
  return rows.map((row) => ({
    id: row.id,
    studentCode: row.studentCode,
    name: row.user.name,
    email: row.user.email,
    phone: row.phone,
    city: row.city,
    approvalStatus: row.approvalStatus,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function countStudentsByStatus(): Promise<Record<string, number>> {
  const groups = await db.studentProfile.groupBy({
    by: ["approvalStatus"],
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
  email: string;
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
    course: { title: string; slug: string };
    batch: { name: string } | null;
  }[];
  projectCount: number;
};

export async function getStudentForAdmin(
  id: string
): Promise<AdminStudentDetail | null> {
  const row = await db.studentProfile.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      photo: { select: { url: true } },
      enrollments: {
        orderBy: { enrolledAt: "desc" },
        include: {
          course: { select: { title: true, slug: true } },
          batch: { select: { name: true } },
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
    email: row.user.email,
    phone: row.phone,
    dateOfBirth: row.dateOfBirth ? row.dateOfBirth.toISOString().slice(0, 10) : null,
    address: row.address,
    city: row.city,
    country: row.country,
    headline: row.headline,
    bio: row.bio,
    githubUrl: row.githubUrl,
    linkedinUrl: row.linkedinUrl,
    websiteUrl: row.websiteUrl,
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
      course: { title: e.course.title, slug: e.course.slug },
      batch: e.batch ? { name: e.batch.name } : null,
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

export async function setEnrollmentDecision(
  enrollmentId: string,
  status: "ACTIVE" | "DROPPED"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const row = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, status: true },
  });
  if (!row) return { ok: false, error: "Enrollment not found" };
  if (row.status !== "PENDING") {
    return { ok: false, error: "Only pending requests can be changed here" };
  }
  await db.enrollment.update({ where: { id: enrollmentId }, data: { status } });
  return { ok: true };
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
