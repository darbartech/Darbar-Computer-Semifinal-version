import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";

export const PAGE_SIZE = 20;

export const adminListSubscribers = async (filters: { q?: string; status?: string; page?: number }) => {
  const conditions: Prisma.SubscriberWhereInput[] = [];
  if (filters.q) conditions.push({ email: { contains: filters.q, mode: "insensitive" } });
  if (filters.status) conditions.push({ status: filters.status as Prisma.EnumSubscriberStatusFilter });
  const where = { AND: conditions };
  const total = await db.subscriber.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const rows = await db.subscriber.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  return { rows, total, page, pageCount };
};

export const adminGetSubscriber = async (id: string) => db.subscriber.findUnique({ where: { id } });
export const updateSubscriber = async (id: string, data: Prisma.SubscriberUpdateInput) => db.subscriber.update({ where: { id }, data });
export const deleteSubscriber = async (id: string) => db.subscriber.delete({ where: { id } });

