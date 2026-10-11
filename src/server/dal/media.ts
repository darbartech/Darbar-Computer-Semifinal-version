import "server-only";
import { db } from "@/server/db";
import type { MediaSource, Prisma } from "@/generated/prisma/client";

export type MediaListFilters = {
  /** Free-text search over alt text and URL. */
  q?: string;
  page?: number;
  perPage?: number;
};

export type MediaListItem = {
  id: string;
  url: string;
  alt: string;
  publicId: string | null;
  source: MediaSource;
  mimeType: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  folder: string | null;
  createdAt: string;
  /** How many content rows reference this asset (0 = safe to delete). */
  usageCount: number;
};

export type MediaListResult = {
  rows: MediaListItem[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
};

export const MEDIA_DEFAULT_PER_PAGE = 24;
const MAX_PER_PAGE = 96;

/**
 * Admin media library list. Not cached — it is behind auth and changes on every
 * upload. Server-side pagination and search, per docs/05 §1.3.
 */
export async function adminListMedia(
  filters: MediaListFilters = {}
): Promise<MediaListResult> {
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(1, Math.floor(filters.perPage ?? MEDIA_DEFAULT_PER_PAGE))
  );
  const q = filters.q?.trim();

  const where: Prisma.MediaWhereInput = q
    ? {
        OR: [
          { alt: { contains: q, mode: "insensitive" } },
          { url: { contains: q } },
        ],
      }
    : {};

  const select = {
    id: true,
    url: true,
    alt: true,
    publicId: true,
    source: true,
    mimeType: true,
    bytes: true,
    width: true,
    height: true,
    folder: true,
    createdAt: true,
    _count: {
      select: {
        courses: true,
        posts: true,
        events: true,
        gallery: true,
        testimonials: true,
        team: true,
      },
    },
  } satisfies Prisma.MediaSelect;

  const [total, rows] = await Promise.all([
    db.media.count({ where }),
    db.media.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select,
    }),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      url: row.url,
      alt: row.alt,
      publicId: row.publicId,
      source: row.source,
      mimeType: row.mimeType,
      bytes: row.bytes,
      width: row.width,
      height: row.height,
      folder: row.folder,
      createdAt: row.createdAt.toISOString(),
      usageCount:
        row._count.courses +
        row._count.posts +
        row._count.events +
        row._count.gallery +
        row._count.testimonials +
        row._count.team,
    })),
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

/** Newest uploads first, for the ImagePicker "choose from library" dialog. */
export async function listRecentMedia(
  take = 48
): Promise<Pick<MediaListItem, "id" | "url" | "alt" | "width" | "height">[]> {
  const rows = await db.media.findMany({
    orderBy: { createdAt: "desc" },
    take: Math.min(120, Math.max(1, take)),
    select: { id: true, url: true, alt: true, width: true, height: true },
  });
  return rows;
}

export async function getMediaById(id: string) {
  return db.media.findUnique({
    where: { id },
    select: {
      id: true,
      url: true,
      alt: true,
      publicId: true,
      source: true,
      mimeType: true,
      bytes: true,
      width: true,
      height: true,
      folder: true,
      createdAt: true,
    },
  });
}

/**
 * Where an asset is used. Used by the admin UI ("used in" list) and by the
 * delete guard. Docs/05 §4.12: delete only when unused.
 */
export type MediaUsage = {
  total: number;
  courses: { id: string; title: string }[];
  posts: { id: string; title: string }[];
  events: { id: string; title: string }[];
  gallery: { id: string; title: string | null }[];
  testimonials: { id: string; name: string }[];
  team: { id: string; name: string }[];
};

export async function getMediaUsage(id: string): Promise<MediaUsage> {
  const row = await db.media.findUnique({
    where: { id },
    select: {
      courses: { select: { id: true, title: true } },
      posts: { select: { id: true, title: true } },
      events: { select: { id: true, title: true } },
      gallery: { select: { id: true, title: true } },
      testimonials: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });

  if (!row) {
    return {
      total: 0,
      courses: [],
      posts: [],
      events: [],
      gallery: [],
      testimonials: [],
      team: [],
    };
  }

  return {
    total:
      row.courses.length +
      row.posts.length +
      row.events.length +
      row.gallery.length +
      row.testimonials.length +
      row.team.length,
    courses: row.courses,
    posts: row.posts,
    events: row.events,
    gallery: row.gallery,
    testimonials: row.testimonials,
    team: row.team,
  };
}

export async function createMedia(data: {
  url: string;
  publicId: string | null;
  alt: string;
  width: number | null;
  height: number | null;
  bytes: number;
  mimeType: string;
  folder: string;
  uploadedById: string;
}) {
  return db.media.create({
    data: {
      source: "UPLOAD",
      url: data.url,
      publicId: data.publicId,
      alt: data.alt,
      width: data.width,
      height: data.height,
      bytes: data.bytes,
      mimeType: data.mimeType,
      folder: data.folder,
      uploadedById: data.uploadedById,
    },
  });
}

export async function updateMediaAlt(id: string, alt: string) {
  return db.media.update({
    where: { id },
    data: { alt },
    select: { id: true, url: true, alt: true },
  });
}

/**
 * Adds an image that is hosted somewhere else (the "From URL" option in
 * `ImagePicker`). Nothing is uploaded, so size, dimensions and MIME type stay
 * unknown and `publicId` is empty — deleting the row therefore never touches a
 * remote file.
 *
 * Re-using the same URL twice updates the alt text on the existing row instead
 * of creating a duplicate the media library would show twice.
 */
export async function createExternalMedia(data: {
  url: string;
  alt: string;
  folder: string | null;
  uploadedById: string;
}) {
  const existing = await db.media.findFirst({
    where: { url: data.url },
    select: { id: true, url: true, alt: true },
  });
  if (existing) {
    return db.media.update({
      where: { id: existing.id },
      data: { alt: data.alt },
      select: { id: true, url: true, alt: true },
    });
  }
  return db.media.create({
    data: {
      source: "EXTERNAL",
      url: data.url,
      publicId: null,
      alt: data.alt,
      width: null,
      height: null,
      bytes: null,
      mimeType: null,
      folder: data.folder,
      uploadedById: data.uploadedById,
    },
    select: { id: true, url: true, alt: true },
  });
}

export async function deleteMediaRow(id: string) {
  return db.media.delete({ where: { id } });
}

/** Finds an asset from its stored URL, e.g. to clean up a replaced profile picture. */
export async function findMediaByUrl(url: string) {
  return db.media.findFirst({
    where: { url },
    select: { id: true, publicId: true },
  });
}

export async function countMedia() {
  return db.media.count();
}