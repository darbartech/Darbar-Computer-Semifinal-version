import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";
import { cached } from "../cache";
import { EVENT_TAGS } from "../revalidate";

const include = { cover: true } satisfies Prisma.EventInclude;
export const PAGE_SIZE = 20;

export const listPublishedEvents = cached(EVENT_TAGS, async () => {
  return db.event.findMany({
    where: { status: "PUBLISHED" },
    include,
    orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
  });
});

export const getPublishedEventBySlug = cached(["events"], async (slug: string) => {
  return db.event.findFirst({ where: { slug, status: "PUBLISHED" }, include });
});

export const adminListEvents = async (filters: { q?: string; status?: string; category?: string; page?: number }) => {
  const conditions: Prisma.EventWhereInput[] = [];
  if (filters.q) {
    conditions.push({ OR: [{ title: { contains: filters.q, mode: "insensitive" } }, { slug: { contains: filters.q, mode: "insensitive" } }] });
  }
  if (filters.status) conditions.push({ status: filters.status as Prisma.EnumEventStatusFilter });
  if (filters.category) conditions.push({ category: filters.category as Prisma.EnumEventCategoryFilter });
  const where = { AND: conditions };
  const total = await db.event.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const rows = await db.event.findMany({ where, include: { cover: { select: { id: true, url: true } } }, orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  return { rows, total, page, pageCount };
};

export const adminGetEvent = async (id: string) => db.event.findUnique({ where: { id }, include });
export const eventSlugIsTaken = async (slug: string, excludeId?: string) => {
  const found = await db.event.findUnique({ where: { slug }, select: { id: true } });
  if (!found) return false;
  if (excludeId && found.id === excludeId) return false;
  return true;
};
export const createEvent = async (data: Prisma.EventCreateInput) => db.event.create({ data });
export const updateEvent = async (id: string, data: Prisma.EventUpdateInput) => db.event.update({ where: { id }, data });
export const getEventWriteSnapshot = async (id: string) => db.event.findUnique({ where: { id } });

