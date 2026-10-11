"use server";
import "server-only";
import { z } from 'zod';
import type { Prisma } from "@/generated/prisma/client";
import { isRedirectError, requirePermission } from '@/server/session';
import { audit, type AuditActor } from '@/server/services/audit';
import { BLOG_TAGS, invalidate } from '@/server/revalidate';
import { blogFilterSchema, blogWriteSchema } from '@/lib/validators/blog';
import {
  adminListBlogPosts,
  createBlogPost,
  slugIsTaken,
  updateBlogPost,
  getBlogPostWriteSnapshot,
} from '@/server/dal/blog';

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

const GENERIC_FAILURE = 'Something went wrong. Please try again.';

function invalid(error: z.ZodError): ActionResult<never> {
  return { ok: false, error: 'Please fix the highlighted fields', fieldErrors: z.flattenError(error).fieldErrors };
}
function fail(message: string): ActionResult<never> {
  return { ok: false, error: message };
}

export async function listBlogPosts(
  input: unknown
): Promise<ActionResult<Awaited<ReturnType<typeof adminListBlogPosts>>>> {
  try {
    await requirePermission('blog.write');
    const parsed = blogFilterSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    return { ok: true, data: await adminListBlogPosts(parsed.data) };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return fail(GENERIC_FAILURE);
  }
}

export async function saveBlogPost(input: unknown): Promise<ActionResult<{ id: string; slug: string; status: string }>> {
  let actor: AuditActor | null = null;
  try {
    const user = await requirePermission('blog.write');
    actor = { id: user.id, email: user.email };
    const parsed = blogWriteSchema.safeParse(input);
    if (!parsed.success) return invalid(parsed.error);
    const data = parsed.data;
    const id = data.id ? data.id : null;
    if (await slugIsTaken(data.slug, id ?? undefined)) {
      return { ok: false, error: 'That URL is already in use', fieldErrors: { slug: ['Another post already uses this URL'] } };
    }
    if (id && !(await getBlogPostWriteSnapshot(id))) return fail('That post was not found');
    const base = {
      title: data.title,
      slug: data.slug,
      excerpt: data.excerpt,
      contentMd: data.contentMd,
      cover: data.coverId ? { connect: { id: data.coverId } } : { disconnect: true } as const,
      authorName: data.authorName,
      readingMinutes: data.readingMinutes,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
      status: data.status,
      publishedAt: data.status === 'PUBLISHED' && data.publishedAt ? data.publishedAt : (data.status === 'PUBLISHED' ? new Date() : null),
    };
    let result;
    if (id) {
      const updateValues: Prisma.BlogPostUpdateInput = base;
      result = await updateBlogPost(id, updateValues);
      if (actor) await audit({ actor, action: 'blog.update', entity: 'BlogPost', entityId: result.id, summary: result.title });
    } else {
      const createValues: Prisma.BlogPostCreateInput = base as Prisma.BlogPostCreateInput;
      result = await createBlogPost(createValues);
      if (actor) await audit({ actor, action: 'blog.create', entity: 'BlogPost', entityId: result.id, summary: result.title });
    }
    invalidate(...BLOG_TAGS, `blog:${result.slug}`);
    return { ok: true, data: { id: result.id, slug: result.slug, status: result.status } };
  } catch (error) {
    if (isRedirectError(error)) throw error;
    return { ok: false, error: GENERIC_FAILURE };
  }
}

