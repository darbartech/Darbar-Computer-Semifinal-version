import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";
import { MESSAGE_TAGS } from "../revalidate";

export const PAGE_SIZE = 20;

export const adminListMessages = async (filters: { q?: string; status?: string; page?: number }) => {
  const conditions: Prisma.ContactMessageWhereInput[] = [];
  if (filters.q) {
    conditions.push({ OR: [{ name: { contains: filters.q, mode: "insensitive" } }, { email: { contains: filters.q, mode: "insensitive" } }, { subject: { contains: filters.q, mode: "insensitive" } }] });
  }
  if (filters.status) conditions.push({ status: filters.status as Prisma.EnumMessageStatusFilter });
  const where = { AND: conditions };
  const total = await db.contactMessage.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const rows = await db.contactMessage.findMany({ where, orderBy: [{ createdAt: "desc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  return { rows, total, page, pageCount };
};

export const adminGetMessage = async (id: string) => db.contactMessage.findUnique({ where: { id } });
export const updateMessage = async (id: string, data: Prisma.ContactMessageUpdateInput) => db.contactMessage.update({ where: { id }, data });
export const deleteMessage = async (id: string) => db.contactMessage.delete({ where: { id } });

