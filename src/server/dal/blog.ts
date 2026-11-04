import "server-only";
import type { Prisma } from "../../generated/prisma/client";
import { db } from "../db";
import { cached } from "../cache";
import { PUBLIC_LIST_LIMIT } from "../constants";
import { BLOG_TAGS } from "../revalidate";

const blogInclude = {
  cover: true,
  author: { select: { id: true, name: true } },
  tags: true,
} satisfies Prisma.BlogPostInclude;

export const BLOG_PAGE_SIZE = 20;

export const listPublishedBlogPosts = cached(
  BLOG_TAGS,
  async () => {
    return db.blogPost.findMany({
      where: { status: "PUBLISHED" },
      include: blogInclude,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: PUBLIC_LIST_LIMIT,
    });
  }
);

export const getPublishedBlogPostBySlug = cached(
  ["blog"],
  async (slug: string) => {
    return db.blogPost.findFirst({
      where: { slug, status: "PUBLISHED" },
      include: blogInclude,
    });
  }
);

export const adminListBlogPosts = async (filters: {
  q?: string;
  status?: string;
  page?: number;
}) => {
  const conditions: Prisma.BlogPostWhereInput[] = [];
  if (filters.q) {
    conditions.push({
      OR: [
        { title: { contains: filters.q, mode: "insensitive" } },
        { slug: { contains: filters.q, mode: "insensitive" } },
      ],
    });
  }
  if (filters.status) {
    conditions.push({ status: filters.status as Prisma.EnumPublishStatusFilter });
  }
  const where: Prisma.BlogPostWhereInput = { AND: conditions };

  const total = await db.blogPost.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE));
  const page = Math.min(Math.max(1, filters.page ?? 1), pageCount);

  const rows = await db.blogPost.findMany({
    where,
    include: { cover: { select: { id: true, url: true } }, author: { select: { id: true, name: true } } },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    skip: (page - 1) * BLOG_PAGE_SIZE,
    take: BLOG_PAGE_SIZE,
  });

  return { rows, total, page, pageCount };
};

export const adminGetBlogPost = async (id: string) => {
  return db.blogPost.findUnique({
    where: { id },
    include: blogInclude,
  });
};

export const slugIsTaken = async (slug: string, excludeId?: string) => {
  const found = await db.blogPost.findUnique({ where: { slug }, select: { id: true } });
  if (!found) return false;
  if (excludeId && found.id === excludeId) return false;
  return true;
};

export const createBlogPost = async (data: Prisma.BlogPostCreateInput) => {
  return db.blogPost.create({ data });
};

export const updateBlogPost = async (id: string, data: Prisma.BlogPostUpdateInput) => {
  return db.blogPost.update({ where: { id }, data });
};

export const getBlogPostWriteSnapshot = async (id: string) => {
  return db.blogPost.findUnique({ where: { id } });
};

