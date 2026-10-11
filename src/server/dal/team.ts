import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";
import { cached } from "../cache";
import { TEAM_TAGS } from "../revalidate";

const include = { photo: true } satisfies Prisma.TeamMemberInclude;
export const PAGE_SIZE = 20;

export const listPublishedTeam = cached(TEAM_TAGS, async () => {
  return db.teamMember.findMany({ where: { isPublished: true }, include: { photo: true }, orderBy: [{ sortOrder: "asc" }] });
});

export const adminListTeam = async (filters: { q?: string; isPublished?: string; page?: number }) => {
  const conditions: Prisma.TeamMemberWhereInput[] = [];
  if (filters.q) conditions.push({ name: { contains: filters.q, mode: "insensitive" } });
  if (filters.isPublished) conditions.push({ isPublished: filters.isPublished === "true" });
  const where = { AND: conditions };
  const total = await db.teamMember.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const rows = await db.teamMember.findMany({ where, include: { photo: { select: { id: true, url: true } } }, orderBy: [{ sortOrder: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  return { rows, total, page, pageCount };
};

export const adminGetTeamMember = async (id: string) => db.teamMember.findUnique({ where: { id }, include });
export const createTeamMember = async (data: Prisma.TeamMemberCreateInput) => db.teamMember.create({ data });
export const updateTeamMember = async (id: string, data: Prisma.TeamMemberUpdateInput) => db.teamMember.update({ where: { id }, data });
export const deleteTeamMember = async (id: string) => db.teamMember.delete({ where: { id } });

