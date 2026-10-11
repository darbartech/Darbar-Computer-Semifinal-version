import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";
import { cached } from "../cache";
import {
  CATEGORY_PAGE_SIZE,
  categoryFilterSchema,
  type CategoryFilters,
} from "@/lib/validators/course";

/* ────────────────────────────── public reads (cached) ────────────────────────────── */

/** Active groups with their active categories, for selects and the filter UI. */
export const listActiveCategoryGroups = cached(
  ["courses", "categories"],
  async () =>
    db.categoryGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          where: { isActive: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, slug: true, groupId: true },
        },
      },
    })
);

/* ─────────────────────────────── admin reads (uncached) ─────────────────────────── */

export type AdminCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  groupId: string;
  groupLabel: string;
  courseCount: number;
};

export type AdminCategoryListResult = {
  rows: AdminCategoryRow[];
  total: number;
  page: number;
  pageCount: number;
};

export async function adminListCategories(
  filters: CategoryFilters
): Promise<AdminCategoryListResult> {
  const conditions: Prisma.CategoryWhereInput[] = [];
  if (filters.q) {
    conditions.push({
      OR: [
        { name: { contains: filters.q, mode: "insensitive" } },
        { slug: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.group) conditions.push({ groupId: filters.group });
  const where: Prisma.CategoryWhereInput = { AND: conditions };

  const total = await db.category.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / CATEGORY_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page), pageCount);

  const rows = await db.category.findMany({
    where,
    orderBy: [{ group: { sortOrder: "asc" } }, { sortOrder: "asc" }, { name: "asc" }],
    skip: (page - 1) * CATEGORY_PAGE_SIZE,
    take: CATEGORY_PAGE_SIZE,
    include: { group: { select: { id: true, label: true } } },
  });

  const courseCounts = await db.course.groupBy({
    by: ["categoryId"],
    where: { categoryId: { in: rows.map((row) => row.id) } },
    _count: { _all: true },
  });
  const countById = new Map(courseCounts.map((row) => [row.categoryId, row._count._all]));

  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      groupId: row.group.id,
      groupLabel: row.group.label,
      courseCount: countById.get(row.id) ?? 0,
    })),
    total,
    page,
    pageCount,
  };
}

export async function adminListCategoryGroups(): Promise<
  { id: string; label: string; slug: string; sortOrder: number; categoryCount: number }[]
> {
  const groups = await db.categoryGroup.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { categories: true } } },
  });
  return groups.map((group) => ({
    id: group.id,
    label: group.label,
    slug: group.slug,
    sortOrder: group.sortOrder,
    categoryCount: group._count.categories,
  }));
}

export async function adminGetCategory(id: string) {
  return db.category.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      sortOrder: true,
      isActive: true,
      groupId: true,
    },
  });
}

/** Courses that would be orphaned or hidden by a rename/deactivation. */
export async function countCoursesInCategory(id: string): Promise<number> {
  return db.course.count({ where: { categoryId: id } });
}

/* ──────────────────────────────── writes (never cached) ─────────────────────────── */

export type CategoryWrite = {
  groupId: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

export async function categorySlugIsTaken(
  slug: string,
  exceptId?: string
): Promise<boolean> {
  const existing = await db.category.findUnique({
    where: { slug },
    select: { id: true },
  });
  return !!existing && existing.id !== exceptId;
}

export async function categoryGroupExists(groupId: string): Promise<boolean> {
  const group = await db.categoryGroup.findUnique({
    where: { id: groupId },
    select: { id: true },
  });
  return !!group;
}

export async function createCategory(
  values: CategoryWrite
): Promise<{ id: string; slug: string }> {
  return db.category.create({
    data: values,
    select: { id: true, slug: true },
  });
}

export async function updateCategory(
  id: string,
  values: CategoryWrite
): Promise<{ id: string; slug: string }> {
  return db.category.update({
    where: { id },
    data: values,
    select: { id: true, slug: true },
  });
}

export type { CategoryFilters };
export { categoryFilterSchema };
