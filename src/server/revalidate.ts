import 'server-only'
import { revalidateTag, updateTag } from 'next/cache'
/**
 * Every admin write goes through a Server Action, so `updateTag` gives us
 * read-your-own-writes: the tag expires immediately and the next request waits
 * for fresh data. This used to call `revalidateTag(tag, 'max')`, which serves
 * the stale copy first and refreshes in the background - after saving in the
 * admin the public page still showed the old content until it was reloaded a
 * second time.
 *
 * `updateTag` throws outside a Server Action, so the fallback keeps this usable
 * from a Route Handler if one ever needs it.
 */
export function invalidate(...tags: string[]): void {
  for (const tag of tags) {
    try {
      updateTag(tag)
    } catch (error) {
      console.error('[invalidate] updateTag failed for', tag, error instanceof Error ? error.message : 'unknown')
      try {
        revalidateTag(tag, 'max')
      } catch (fallbackError) {
        console.error(
          '[invalidate] revalidateTag failed for',
          tag,
          fallbackError instanceof Error ? fallbackError.message : 'unknown'
        )
      }
    }
  }
}
/**
 * Invalidation for work that finishes *after* the Server Action has responded, such
 * as PDF rendering kicked off in the background.
 *
 * `updateTag` is only supported while a Server Action is still executing, so calling
 * it from a detached continuation logs `used "updateTag" ... during render which is
 * unsupported` and leaves the cache stale. `revalidateTag(tag, 'max')` is the
 * documented API for every other context: it is safe here and gives
 * stale-while-revalidate, which is what a background PDF write wants anyway - the
 * read-your-own-writes guarantee is already covered by the synchronous
 * `invalidate()` call the action makes when it commits the certificate itself.
 */
export function invalidateDetached(...tags: string[]): void {
  for (const tag of tags) {
    try {
      revalidateTag(tag, 'max')
    } catch (error) {
      console.error(
        '[invalidateDetached] revalidateTag failed for',
        tag,
        error instanceof Error ? error.message : 'unknown'
      )
    }
  }
}

export const LEAD_TAGS = ['leads', 'dashboard'] as const
export const MESSAGE_TAGS = ['messages', 'dashboard'] as const
export const SUBSCRIBER_TAGS = ['subscribers', 'dashboard'] as const
export const COURSE_TAGS = ['courses', 'sitemap'] as const
export const CATEGORY_TAGS = ['courses', 'categories'] as const
export const SETTINGS_TAGS = ['settings', 'courses', 'sitemap'] as const
export const BLOG_TAGS = ['blog', 'sitemap'] as const
export const EVENT_TAGS = ['events', 'sitemap'] as const
export const FAQ_TAGS = ['faq', 'sitemap'] as const
export const GALLERY_TAGS = ['gallery', 'sitemap'] as const
export const TESTIMONIAL_TAGS = ['testimonials', 'sitemap'] as const
export const TEAM_TAGS = ['team', 'sitemap'] as const
export const BATCH_TAGS = ['batches', 'courses'] as const
export const ASSIGNMENT_TAGS = ['assignments', 'courses'] as const
export const NOTICE_TAGS = ['notices'] as const
export const USER_TAGS = ['users'] as const
export const CERTIFICATE_TAGS = ['certificates', 'certificates:list'] as const
export const SIGNATORY_TAGS = ['certificate:signatories'] as const
export const TEMPLATE_TAGS = ['certificate:templates'] as const
export const STUDENT_TAGS = ['students'] as const
export const PORTFOLIO_TAGS = ['portfolio'] as const

/**
 * Tags to drop after any student profile / project write. Portfolios are cached
 * under the shared `portfolio` tag; the per-slug tag is added so a future
 * per-slug cache entry can be invalidated without a rewrite.
 */
export function portfolioWriteTags(slug?: string | null): string[] {
  const tags = new Set<string>(PORTFOLIO_TAGS)
  if (slug) tags.add(`portfolio:${slug}`)
  return [...tags]
}

/**
 * Per-token tag for one certificate's public verification record.
 *
 * `certificateWriteTags` drops this on issue/revoke/reissue so a status change
 * can never be served from a stale public cache entry. The lookup in
 * `src/server/dal/certificates` is cached under `PUBLIC_VERIFY_TAGS`, which
 * includes the shared `certificates` tag — so invalidation works even for
 * writes that do not know the token.
 */
export function certificateVerifyTag(token: string): string {
  return `certificate:verify:${token}`
}

/**
 * Cache tags for the public `/verify/[token]` lookup. Declared here rather than
 * inline in the DAL so the read side and the invalidation side cannot drift.
 */
export const PUBLIC_VERIFY_TAGS: readonly string[] = [
  ...CERTIFICATE_TAGS,
  'verify'
]
export function courseWriteTags(slugs: (string | null | undefined)[]): string[] {
  const tags = new Set<string>(COURSE_TAGS)
  for (const slug of slugs) {
    if (slug) tags.add(`course:${slug}`)
  }
  return [...tags]
}

export function certificateWriteTags(params: { id?: string | null; verificationToken?: string | null }): string[] {
  const tags = new Set<string>(CERTIFICATE_TAGS)
  if (params.id) tags.add(`certificate:${params.id}`)
  if (params.verificationToken) tags.add(certificateVerifyTag(params.verificationToken))
  return [...tags]
}


