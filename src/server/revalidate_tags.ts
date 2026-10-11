import 'server-only'
import { BLOG_TAGS, EVENT_TAGS } from './revalidate'

export function blogWriteTags(slugs: (string | null | undefined)[] = []): string[] {
  const t = new Set(BLOG_TAGS as unknown as string[])
  for (const s of slugs) {
    if (s) t.add('blog:' + s)
  }
  return Array.from(t)
}

export function eventWriteTags(slugs: (string | null | undefined)[] = []): string[] {
  const t = new Set(EVENT_TAGS as unknown as string[])
  for (const s of slugs) {
    if (s) t.add('event:' + s)
  }
  return Array.from(t)
}
