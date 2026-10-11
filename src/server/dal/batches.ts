import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";
import { cached } from "../cache";
import { BATCH_TAGS } from "../revalidate";

export const PAGE_SIZE = 20;

export const adminListBatches = async (filters: { q?: string; courseId?: string; status?: string; page?: number }) => {
  const conditions: Prisma.BatchWhereInput[] = [];
  if (filters.q) conditions.push({ name: { contains: filters.q, mode: "insensitive" } });
  if (filters.courseId) conditions.push({ courseId: filters.courseId });
  if (filters.status) conditions.push({ status: filters.status as Prisma.EnumBatchStatusFilter });
  const where = { AND: conditions };
  const total = await db.batch.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const rows = await db.batch.findMany({ where, include: { course: { select: { id: true, title: true } } }, orderBy: [{ startDate: "asc" }, { createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  return { rows, total, page, pageCount };
};

export const adminGetBatch = async (id: string) => db.batch.findUnique({ where: { id }, include: { course: true } });
export const createBatch = async (data: Prisma.BatchCreateInput) => db.batch.create({ data });
export const updateBatch = async (id: string, data: Prisma.BatchUpdateInput) => db.batch.update({ where: { id }, data });
export const deleteBatch = async (id: string) => db.batch.delete({ where: { id } });

