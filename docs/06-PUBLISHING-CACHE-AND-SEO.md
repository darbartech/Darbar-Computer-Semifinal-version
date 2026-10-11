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

## SEO safety

When an item is unpublished:

- normal page should 404
- it should disappear from sitemap
- it should not appear in public navigation/listings

When a slug changes:

- old URL should either redirect through an explicit redirect system or intentionally 404 according to project policy
- cache must be invalidated for both old/new routes
