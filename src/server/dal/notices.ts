import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import { cached } from "../cache";
import { NOTICE_TAGS } from "../revalidate";

/**
 * Site notices (holiday closure, lab down, exam announcement). One table feeds
 * both the admin CRUD and the popup every visitor sees, so a notice an editor
 * publishes is the same row a visitor reads — no separate "public" copy to keep
 * in sync.
 */

export const PAGE_SIZE = 20;

/** How many notices one visitor can be shown at a time. */
export const MAX_VISIBLE_NOTICES = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export type NoticeWriteData = {
  type: "HOLIDAY" | "CLOSURE" | "ANNOUNCEMENT";
  title: string;
  body: string;
  startsAt: Date | null;
  endsAt: Date | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  imageId: string | null;
};

/** The picture is optional, so only the fields the popup needs are joined. */
const imageSelect = { id: true, url: true, alt: true } satisfies Prisma.MediaSelect;

const noticeSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  startsAt: true,
  endsAt: true,
  status: true,
  imageId: true,
  image: { select: imageSelect },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.NoticeSelect;

type NoticeRow = Prisma.NoticeGetPayload<{ select: typeof noticeSelect }>;

export type AdminNoticeView = {
  id: string;
  type: string;
  title: string;
  body: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  imageId: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  createdAt: string;
};

function toAdminNotice(row: NoticeRow): AdminNoticeView {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    status: row.status,
    imageId: row.imageId,
    imageUrl: row.image?.url ?? null,
    imageAlt: row.image?.alt ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const adminListNotices = async (filters: {
  q?: string;
  status?: string;
  type?: string;
  page?: number;
}) => {
  const conditions: Prisma.NoticeWhereInput[] = [];
  if (filters.q) {
    conditions.push({
      OR: [
        { title: { contains: filters.q, mode: "insensitive" } },
        { body: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.status) conditions.push({ status: filters.status as Prisma.EnumPublishStatusFilter });
  if (filters.type) conditions.push({ type: filters.type as Prisma.EnumNoticeTypeFilter });
  const where = { AND: conditions };

  const total = await db.notice.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);
  const rows = await db.notice.findMany({
    where,
    select: noticeSelect,
    // Newest window first; undated notices fall back to how recently they were made.
    orderBy: [{ startsAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  return { rows: rows.map(toAdminNotice), total, page, pageCount };
};

/** Existence check for the write action. */
export const adminGetNotice = async (id: string) =>
  db.notice.findUnique({ where: { id }, select: { id: true } });

export const createNotice = async (data: NoticeWriteData) =>
  db.notice.create({
    data: {
      type: data.type,
      title: data.title,
      body: data.body,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      status: data.status,
      ...(data.imageId ? { image: { connect: { id: data.imageId } } } : {}),
    },
    select: { id: true },
  });

/** An unset picture is an explicit removal, so update must disconnect. */
export const updateNotice = async (id: string, data: NoticeWriteData) =>
  db.notice.update({
    where: { id },
    data: {
      type: data.type,
      title: data.title,
      body: data.body,
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      status: data.status,
      image: data.imageId ? { connect: { id: data.imageId } } : { disconnect: true },
    },
    select: { id: true },
  });

export const deleteNotice = async (id: string) => db.notice.delete({ where: { id } });

// ───────────── Public (what visitors see) ─────────────

export type PublicNotice = {
  id: string;
  type: string;
  title: string;
  body: string;
  startsAt: string | null;
  endsAt: string | null;
  imageUrl: string | null;
  imageAlt: string;
};

/**
 * Published notices that have not finished yet. Only `endsAt` retires one: a
 * holiday or closure is announced BEFORE it begins, so gating on `startsAt` too
 * would hide the notice until the event had already started — which is exactly
 * the announcement visitors need in advance.
 *
 * Cached under `NOTICE_TAGS`, so publishing or unpublishing one is visible on the
 * next page view instead of after the static pages revalidate.
 */
export const listVisibleNotices = cached(NOTICE_TAGS, async (): Promise<PublicNotice[]> => {
  const now = new Date();
  const rows = await db.notice.findMany({
    where: {
      status: "PUBLISHED",
      // `endsAt` is midnight of the chosen day, so that day is still live for ~6
      // more hours in Asia/Kathmandu — grace one full day.
      OR: [{ endsAt: null }, { endsAt: { gte: new Date(now.getTime() - DAY_MS) } }],
    },
    // What is happening soonest goes first; an undated announcement falls behind
    // the dated ones rather than jumping the queue every time it is re-saved.
    orderBy: [{ startsAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    take: MAX_VISIBLE_NOTICES,
    select: {
      id: true,
      type: true,
      title: true,
      body: true,
      startsAt: true,
      endsAt: true,
      image: { select: imageSelect },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    imageUrl: row.image?.url ?? null,
    imageAlt: row.image?.alt ?? "",
  }));
});
