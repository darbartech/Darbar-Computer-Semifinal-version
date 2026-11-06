# 06 — Publishing, Cache, SEO and Sitemap

## Cache tags

Use domain-level tags:

```text
courses
categories
blog
events
faq
gallery
testimonials
team
settings
```

For individual pages, use:

```text
course:{slug}
blog:{slug}
event:{slug}
```

## Mutation invalidation

Examples:

### Blog

```ts
invalidate("blog", `blog:${oldSlug}`, `blog:${newSlug}`);
```

### Event

```ts
invalidate("events", `event:${oldSlug}`, `event:${newSlug}`);
```

### FAQ

```ts
invalidate("faq");
```

### Gallery

```ts
invalidate("gallery");
```

### Settings

Use the existing settings tag mechanism.

## Draft behavior

Normal public queries must always include:

```ts
where: { status: "PUBLISHED" }
```

or the equivalent publication flag.

Never rely on the UI to hide drafts.

## Publication timestamp

When transitioning from DRAFT to PUBLISHED:

```ts
publishedAt = existing.publishedAt ?? new Date()
```

Do not overwrite the original publication date on every edit.

## Metadata

`generateMetadata()` must read the same published DAL as the page.

This prevents:

- page title showing old data
- metadata showing static data
- wrong social image
- stale description

## Sitemap

`src/app/sitemap.ts` must use DB-backed published slugs for:

- courses
- blog
- events
- any other indexable published content

Never import static production content into sitemap generation.

### `lastmod`

- A record carries its own `updatedAt`, read from the same uncapped slug list the
  prerender uses. Adding a field to those DAL reads is fine; `safeStaticParams`
  projects them back down to `{ slug }` before Next sees them.
- A marketing page has no record and therefore no `lastmod`. `new Date()` used to
  sit on all eleven static routes, which made the whole site look like it changed
  every crawl — a `lastmod` that is always "today" is a `lastmod` that is never
  believed. Omit the field instead of inventing one.
- No `noindex` URL is ever listed. `/student`, `/techdarbar` and `/verify` are
  absent on purpose; a contradictory signal is worse than a missing one.

## Metadata rules

- `buildMetadata` is the only producer of page metadata, and `alternates.canonical`
  is composed from `general.siteUrl` + the `path` argument **after** the overrides
  are spread: a hand-written `localhost` canonical cannot survive, and a page that
  forgets `path` silently declares itself a duplicate of `/`. Detail routes pass
  the path even on their not-found branch.
- No site-wide canonical in the root layout — it would claim every URL that has no
  canonical of its own is the home page.
- No `keywords` block, site-wide or in `buildMetadata`. Google states it ignores
  them, and the same list on every page is what manipulative metadata looks like.
  A page with genuine topic keywords (a course, a post) still sets its own.
- `robots.ts` has no `host` directive: it is non-standard, Google ignores it, and
  it is a second place for the canonical origin to be wrong.

## Imagery hosts

Seed marketing imagery is served from `/public/images/seed` (see
`public/images/seed/README.md`), not from Pexels/Unsplash/Webflow. That is what
lets `IMAGE_HOSTS` in `src/lib/csp.ts` and `images.remotePatterns` in
`next.config.mjs` name only Cloudinary. Real photography goes through the media
library; student faces are never committed to the repository.

## SEO safety

When an item is unpublished:

- normal page should 404
- it should disappear from sitemap
- it should not appear in public navigation/listings

When a slug changes:

- old URL should either redirect through an explicit redirect system or intentionally 404 according to project policy
- cache must be invalidated for both old/new routes
