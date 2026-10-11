import "server-only";
import type { Course as CourseView } from "@/types/course";
import type {
  CourseLevel,
  LearningMode,
  Prisma,
  PublishStatus,
  TimeSlot,
} from "../../generated/prisma/client";
import { db } from "../db";
import { cached } from "../cache";
import { toCourseView, type CourseRow } from "./mappers";
import {
  COURSE_PAGE_SIZE,
  courseFilterSchema,
  type CourseFilters,
} from "@/lib/validators/course";

/**
 * Everything a public read needs; keeps every query in one place. Declared with
 * `satisfies` rather than `as const` so Prisma still infers the relation
 * includes on `findMany`.
 */
const publicInclude = {
  category: true,
  cover: true,
} satisfies Prisma.CourseInclude;

const publicOrderBy: Prisma.CourseOrderByWithRelationInput[] = [
  { sortOrder: "asc" },
  { title: "asc" },
];

/* ────────────────────────────── public reads (cached) ────────────────────────────── */

/** Every published course, in catalog order (docs/04 §3.2). */
export const listPublishedCourses = cached(["courses"], async (): Promise<CourseView[]> => {
  const rows = await db.course.findMany({
    where: { status: "PUBLISHED" },
    include: publicInclude,
    orderBy: [...publicOrderBy],
  });
  return rows.map(toCourseView);
});

/**
 * One published course. Drafts and archived courses are invisible here, which
 * is what makes an archived course 404 (docs/04 §3.3).
 */
export const getPublishedCourseBySlug = cached(
  ["course"],
  async (slug: string): Promise<CourseView | null> => {
    const row = await db.course.findFirst({
      where: { slug, status: "PUBLISHED" },
      include: publicInclude,
    });
    return row ? toCourseView(row) : null;
  }
);

/** Home page and footer "popular courses" (docs/05 §4.4: max 8 featured). */
export const getFeaturedCourses = cached(
  ["courses", "featured-courses"],
  async (count = 6): Promise<CourseView[]> => {
    const rows = await db.course.findMany({
      where: { status: "PUBLISHED", isFeatured: true },
      include: publicInclude,
      orderBy: [{ featuredOrder: "asc" }, { title: "asc" }],
      take: count,
    });
    return rows.map(toCourseView);
  }
);

/**
 * Same-category suggestions for the bottom of a course page. Mirrors the old
 * `getRelatedCourses(course, 3)`: same category, excluding the course itself.
 * Keyed by slug so the cache key stays small.
 */
export const getRelatedCourses = cached(
  ["courses"],
  async (slug: string, count = 3): Promise<CourseView[]> => {
    const course = await db.course.findUnique({
      where: { slug },
      select: { id: true, categoryId: true },
    });
    if (!course) return [];

    const rows = await db.course.findMany({
      where: {
        status: "PUBLISHED",
        id: { not: course.id },
        categoryId: course.categoryId,
      },
      include: publicInclude,
      orderBy: [...publicOrderBy],
      take: count,
    });
    return rows.map(toCourseView);
  }
);

/**
 * The 6 filter groups for `/courses`, in the shape `CoursesClient` already
 * expects (`{ id, label, categories }`). `id` is the group slug so existing
 * `?category=basic-computer` links keep working (docs/01: URLs never change).
 */
export type CourseCategoryGroup = {
  id: string;
  label: string;
  categories: string[];
};

export const listCategoryGroups = cached(
  ["courses", "categories"],
  async (): Promise<CourseCategoryGroup[]> => {
    const groups = await db.categoryGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { name: true },
        },
      },
    });
    return groups.map((group) => ({
      id: group.slug,
      label: group.label,
      categories: group.categories.map((category) => category.name),
    }));
  }
);

/**
 * Published course count per category name, for the category directory. Keys are
 * category names so the component stays unchanged.
 */
export const countPublishedCoursesByCategory = cached(
  ["courses", "categories"],
  async (): Promise<Record<string, number>> => {
    const grouped = await db.course.groupBy({
      by: ["categoryId"],
      where: { status: "PUBLISHED" },
      _count: { _all: true },
    });
    if (grouped.length === 0) return {};

    const categories = await db.category.findMany({
      where: { id: { in: grouped.map((row) => row.categoryId) } },
      select: { id: true, name: true },
    });
    const nameById = new Map(categories.map((category) => [category.id, category.name]));

    const counts: Record<string, number> = {};
    for (const row of grouped) {
      const name = nameById.get(row.categoryId);
      if (name) counts[name] = (counts[name] ?? 0) + row._count._all;
    }
    return counts;
  }
);

/* ─────────────────────────────── admin reads (uncached) ─────────────────────────── */

export type AdminCourseListRow = {
  id: string;
  slug: string;
  title: string;
  categoryName: string;
  categoryId: string;
  level: string;
  durationWeeks: number;
  feeNPR: number;
  status: string;
  isFeatured: boolean;
  featuredOrder: number | null;
  updatedAt: string;
};

export type AdminCourseListResult = {
  rows: AdminCourseListRow[];
  total: number;
  page: number;
  pageCount: number;
};

function adminCourseWhere(filters: CourseFilters): Prisma.CourseWhereInput {
  const conditions: Prisma.CourseWhereInput[] = [];

  if (filters.status) conditions.push({ status: filters.status });
  if (filters.category) conditions.push({ category: { slug: filters.category } });
  if (filters.featured) conditions.push({ isFeatured: true });
  if (filters.q) {
    conditions.push({
      OR: [
        { title: { contains: filters.q, mode: "insensitive" } },
        { slug: { contains: filters.q, mode: "insensitive" } },
        { tagline: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }

  return { AND: conditions };
}

/** Admin table (docs/05 §4.4): filters arrive from the URL. Never cached. */
export async function adminListCourses(
  filters: CourseFilters
): Promise<AdminCourseListResult> {
  const where = adminCourseWhere(filters);
  const total = await db.course.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / COURSE_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), pageCount);

  const rows = await db.course.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    skip: (page - 1) * COURSE_PAGE_SIZE,
    take: COURSE_PAGE_SIZE,
    include: { category: { select: { id: true, name: true } } },
  });

  return {
    rows: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      categoryName: row.category.name,
      categoryId: row.category.id,
      level: row.level,
      durationWeeks: row.durationWeeks,
      feeNPR: row.feeNPR,
      status: row.status,
      isFeatured: row.isFeatured,
      featuredOrder: row.featuredOrder,
      updatedAt: row.updatedAt.toISOString(),
    })),
    total,
    page,
    pageCount,
  };
}

/**
 * Everything the tabbed admin form needs (docs/05 §4.4), including relations the
 * public mapper drops.
 */
export type AdminCourseDetail = {
  id: string;
  slug: string;
  status: string;
  title: string;
  tagline: string;
  shortDescription: string;
  overview: string | null;
  categoryId: string;
  level: string;
  durationWeeks: number;
  learningModes: string[];
  timeSlots: string[];
  batchFrequency: string | null;
  targetStudents: string;
  prerequisites: string | null;
  instituteCertificate: string;
  industryCertifications: string[];
  internship: string | null;
  seatsNote: string | null;
  feeNPR: number;
  feeNote: string | null;
  skillsGained: string[];
  softwareTools: string[];
  portfolioProjects: string[];
  careerOpportunities: string[];
  learningObjectives: string[];
  ctaText: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  coverId: string | null;
  cover: { id: string; url: string; alt: string } | null;
  isFeatured: boolean;
  featuredOrder: number | null;
  sortOrder: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export async function adminGetCourse(id: string): Promise<AdminCourseDetail | null> {
  const row = await db.course.findUnique({
    where: { id },
    include: { cover: { select: { id: true, url: true, alt: true } } },
  });
  if (!row) return null;

  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    title: row.title,
    tagline: row.tagline,
    shortDescription: row.shortDescription,
    overview: row.overview,
    categoryId: row.categoryId,
    level: row.level,
    durationWeeks: row.durationWeeks,
    learningModes: row.learningModes,
    timeSlots: row.timeSlots,
    batchFrequency: row.batchFrequency,
    targetStudents: row.targetStudents,
    prerequisites: row.prerequisites,
    instituteCertificate: row.instituteCertificate,
    industryCertifications: row.industryCertifications,
    internship: row.internship,
    seatsNote: row.seatsNote,
    feeNPR: row.feeNPR,
    feeNote: row.feeNote,
    skillsGained: row.skillsGained,
    softwareTools: row.softwareTools,
    portfolioProjects: row.portfolioProjects,
    careerOpportunities: row.careerOpportunities,
    learningObjectives: row.learningObjectives,
    ctaText: row.ctaText,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    coverId: row.coverId,
    cover: row.cover,
    isFeatured: row.isFeatured,
    featuredOrder: row.featuredOrder,
    sortOrder: row.sortOrder,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every published slug, for `generateStaticParams()` on `/courses/[slug]`. */
export const listPublishedCourseSlugs = cached(
  ["courses"],
  async (): Promise<{ slug: string }[]> => {
    return db.course.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true },
      orderBy: [...publicOrderBy],
    });
  }
);

/** Published course id + title, for admin dropdowns that link to a course. */
export async function listPublishedCourseOptions(): Promise<
  { id: string; title: string }[]
> {
  return db.course.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });
}

/**
 * All courses, id + title, for admin dropdowns (e.g. certificates). Carries the
 * duration and the module-source arrays so the certificate form can auto-fill the
 * duration sentence and the four module rows from the chosen course.
 */
export type AdminCourseSimple = {
  id: string;
  title: string;
  durationWeeks: number;
  skillsGained: string[];
  softwareTools: string[];
  portfolioProjects: string[];
  learningObjectives: string[];
};

export async function adminListCoursesSimple(): Promise<AdminCourseSimple[]> {
  return db.course.findMany({
    orderBy: { title: "asc" },
    select: {
      id: true,
      title: true,
      durationWeeks: true,
      skillsGained: true,
      softwareTools: true,
      portfolioProjects: true,
      learningObjectives: true,
    },
  });
}

/** Slug + title for the admin duplicate-course dialog. */
export async function listAdminCourseSlugs(): Promise<
  { id: string; slug: string; title: string }[]
> {
  return db.course.findMany({
    orderBy: { title: "asc" },
    select: { id: true, slug: true, title: true },
  });
}

/** Row shape used by the admin write action's audit `before` snapshot. */
export async function getCourseWriteSnapshot(id: string) {
  return db.course.findUnique({
    where: { id },
    select: { id: true, slug: true, status: true, title: true, categoryId: true },
  });
}

export type { CourseRow, CourseFilters };
export { courseFilterSchema };

/* ──────────────────────────────── writes (never cached) ─────────────────────────── */

/** Exactly the fields `courseWriteSchema` validates, typed for Prisma. */
export type CourseWrite = {
  title: string;
  slug: string;
  tagline: string;
  shortDescription: string;
  overview: string | null;
  categoryId: string;
  level: CourseLevel;
  durationWeeks: number;
  learningModes: LearningMode[];
  timeSlots: TimeSlot[];
  batchFrequency: string | null;
  targetStudents: string;
  prerequisites: string | null;
  instituteCertificate: string;
  industryCertifications: string[];
  internship: string | null;
  seatsNote: string | null;
  feeNPR: number;
  feeNote: string | null;
  skillsGained: string[];
  softwareTools: string[];
  portfolioProjects: string[];
  careerOpportunities: string[];
  learningObjectives: string[];
  ctaText: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  coverId: string | null;
  status: PublishStatus;
  isFeatured: boolean;
  sortOrder: number;
};

/** `true` when another course already owns this slug (the unique index backs this up). */
export async function slugIsTaken(
  slug: string,
  exceptId?: string
): Promise<boolean> {
  const existing = await db.course.findUnique({
    where: { slug },
    select: { id: true },
  });
  return !!existing && existing.id !== exceptId;
}

/** `true` when the category exists and is active. */
export async function categoryExists(categoryId: string): Promise<boolean> {
  const category = await db.category.findFirst({
    where: { id: categoryId, isActive: true },
    select: { id: true },
  });
  return !!category;
}

/** `true` when the media asset exists (cover images come from the media library). */
export async function mediaExists(coverId: string): Promise<boolean> {
  const media = await db.media.findFirst({
    where: { id: coverId },
    select: { id: true },
  });
  return !!media;
}

/**
 * Featured position: an explicit number when the editor set one, otherwise the
 * next slot so the home page order stays stable without manual bookkeeping.
 */
async function resolveFeaturedOrder(
  isFeatured: boolean,
  requested?: number
): Promise<number | null> {
  if (!isFeatured) return null;
  if (requested !== undefined) return requested;
  const last = await db.course.findFirst({
    where: { isFeatured: true },
    orderBy: { featuredOrder: "desc" },
    select: { featuredOrder: true },
  });
  return (last?.featuredOrder ?? 0) + 1;
}

/**
 * `publishedAt` is stamped the first time a course goes live and never moved
 * afterwards, so "newest" ordering stays meaningful.
 */
function publishedAtFor(
  status: PublishStatus,
  current: Date | null
): Date | null {
  if (status !== "PUBLISHED") return current;
  return current ?? new Date();
}

export async function createCourse(
  values: CourseWrite,
  featuredOrder?: number
): Promise<{ id: string; slug: string; status: PublishStatus }> {
  const created = await db.course.create({
    data: {
      ...values,
      featuredOrder: await resolveFeaturedOrder(values.isFeatured, featuredOrder),
      publishedAt: publishedAtFor(values.status, null),
    },
    select: { id: true, slug: true, status: true },
  });
  return created;
}

export async function updateCourse(
  id: string,
  values: CourseWrite,
  featuredOrder?: number
): Promise<{ id: string; slug: string; status: PublishStatus }> {
  const current = await db.course.findUniqueOrThrow({
    where: { id },
    select: { publishedAt: true, featuredOrder: true },
  });

  return db.course.update({
    where: { id },
    data: {
      ...values,
      // An unchecked "featured" box clears the position rather than leaving a
      // stale number behind.
      featuredOrder: await resolveFeaturedOrder(values.isFeatured, featuredOrder),
      publishedAt: publishedAtFor(values.status, current.publishedAt),
    },
    select: { id: true, slug: true, status: true },
  });
}

/** Archive (docs/05 §4.4): never a hard delete — leads reference courses. */
export async function archiveCourseById(
  id: string
): Promise<{ id: string; slug: string }> {
  return db.course.update({
    where: { id },
    data: { status: "ARCHIVED", isFeatured: false, featuredOrder: null },
    select: { id: true, slug: true },
  });
}

/** Restore an archived course, keeping its previous featured position out of it. */
export async function restoreCourseById(
  id: string
): Promise<{ id: string; slug: string }> {
  return db.course.update({
    where: { id },
    data: { status: "DRAFT", isFeatured: false, featuredOrder: null },
    select: { id: true, slug: true },
  });
}

/**
 * "Duplicate as draft" (docs/05 §4.4). Copies every content column, never the
 * identity: new id, new slug, unpublished, not featured.
 */
export async function duplicateCourseById(
  id: string,
  slug: string
): Promise<{ id: string; slug: string }> {
  const source = await db.course.findUniqueOrThrow({ where: { id } });

  return db.course.create({
    data: {
      categoryId: source.categoryId,
      title: source.title,
      slug,
      tagline: source.tagline,
      shortDescription: source.shortDescription,
      overview: source.overview,
      durationWeeks: source.durationWeeks,
      learningModes: source.learningModes,
      timeSlots: source.timeSlots,
      batchFrequency: source.batchFrequency,
      targetStudents: source.targetStudents,
      prerequisites: source.prerequisites,
      instituteCertificate: source.instituteCertificate,
      industryCertifications: source.industryCertifications,
      internship: source.internship,
      seatsNote: source.seatsNote,
      feeNPR: source.feeNPR,
      feeNote: source.feeNote,
      skillsGained: source.skillsGained,
      softwareTools: source.softwareTools,
      portfolioProjects: source.portfolioProjects,
      careerOpportunities: source.careerOpportunities,
      learningObjectives: source.learningObjectives,
      ctaText: source.ctaText,
      level: source.level,
      coverId: source.coverId,
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      status: "DRAFT",
      isFeatured: false,
      featuredOrder: null,
      publishedAt: null,
      sortOrder: source.sortOrder,
    },
    select: { id: true, slug: true },
  });
}
