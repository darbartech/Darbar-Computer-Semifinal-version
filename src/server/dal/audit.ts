import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";

export const PAGE_SIZE = 50;

export const adminListAuditLogs = async (filters: { q?: string; entity?: string; action?: string; page?: number }) => {
  const conditions: Prisma.AuditLogWhereInput[] = [];
  if (filters.entity) conditions.push({ entity: filters.entity });
  if (filters.action) conditions.push({ action: { contains: filters.action, mode: "insensitive" } });
  if (filters.q) conditions.push({
    OR: [
      { actorEmail: { contains: filters.q, mode: "insensitive" } },
      { summary: { contains: filters.q, mode: "insensitive" } },
    ],
  });
  const where = { AND: conditions };
  const total = await db.auditLog.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const rows = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return { rows, total, page, pageCount };
};
