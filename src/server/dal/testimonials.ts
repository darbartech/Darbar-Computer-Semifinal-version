import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";
import { cached } from "../cache";
import { TESTIMONIAL_TAGS } from "../revalidate";

const include = { photo: true, course: { select: { id: true, title: true } } } satisfies Prisma.TestimonialInclude;
export const PAGE_SIZE = 20;

export const listPublishedTestimonials = cached(TESTIMONIAL_TAGS, async () => {
  return db.testimonial.findMany({ where: { isPublished: true }, include: { photo: true, course: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }] });
});

export const adminListTestimonials = async (filters: { q?: string; isPublished?: string; page?: number }) => {
  const conditions: Prisma.TestimonialWhereInput[] = [];
  if (filters.q) conditions.push({ name: { contains: filters.q, mode: "insensitive" } });
  if (filters.isPublished) conditions.push({ isPublished: filters.isPublished === "true" });
  const where = { AND: conditions };
  const total = await db.testimonial.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const rows = await db.testimonial.findMany({ where, include: { photo: { select: { id: true, url: true } }, course: { select: { id: true, title: true } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  return { rows, total, page, pageCount };
};

export const adminGetTestimonial = async (id: string) => db.testimonial.findUnique({ where: { id }, include });
export const createTestimonial = async (data: Prisma.TestimonialCreateInput) => db.testimonial.create({ data });

/** Public review submissions always land as unpublished drafts (docs/04 §2). */
export const createPublicReview = async (input: {
  name: string;
  courseLabel: string | null;
  quote: string;
  rating: number;
}) =>
  db.testimonial.create({
    data: {
      name: input.name,
      courseLabel: input.courseLabel,
      quote: input.quote,
      rating: input.rating,
      consentGiven: true,
      consentNote: "Submitted via website review form",
      isPublished: false,
    },
  });

export const updateTestimonial = async (id: string, data: Prisma.TestimonialUpdateInput) => db.testimonial.update({ where: { id }, data });
export const deleteTestimonial = async (id: string) => db.testimonial.delete({ where: { id } });

