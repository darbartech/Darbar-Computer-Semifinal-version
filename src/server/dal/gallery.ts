import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";
import { cached } from "../cache";
import { PUBLIC_LIST_LIMIT } from "../constants";
import { GALLERY_TAGS } from "../revalidate";

const include = { media: true } satisfies Prisma.GalleryItemInclude;
export const PAGE_SIZE = 20;

export const listPublishedGallery = cached(GALLERY_TAGS, async () => {
  return db.galleryItem.findMany({ where: { isPublished: true }, include: { media: true }, orderBy: [{ sortOrder: "asc" }], take: PUBLIC_LIST_LIMIT });
});

export const adminListGalleryItems = async (filters: { q?: string; category?: string; isPublished?: string; page?: number }) => {
  const conditions: Prisma.GalleryItemWhereInput[] = [];
  if (filters.category) conditions.push({ category: filters.category as Prisma.EnumGalleryCategoryFilter });
  if (filters.isPublished) conditions.push({ isPublished: filters.isPublished === "true" });
  const where = { AND: conditions };
  const total = await db.galleryItem.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const rows = await db.galleryItem.findMany({ where, include: { media: true }, orderBy: [{ sortOrder: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  return { rows, total, page, pageCount };
};

export const adminGetGalleryItem = async (id: string) => db.galleryItem.findUnique({ where: { id }, include });
export const createGalleryItem = async (data: Prisma.GalleryItemCreateInput) => db.galleryItem.create({ data });
export const updateGalleryItem = async (id: string, data: Prisma.GalleryItemUpdateInput) => db.galleryItem.update({ where: { id }, data });
export const deleteGalleryItem = async (id: string) => db.galleryItem.delete({ where: { id } });

