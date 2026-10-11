# 04 — Server Action + DAL Contract

## Golden rule

Client code never receives Prisma access.

Use:

```text
Client
  |
  | Server Action
  v
Permission
  |
  v
Zod
  |
  v
DAL / transaction
  |
  v
Prisma
  |
  +--> Audit
  |
  +--> Revalidate
```

## Action result

Use the existing project pattern:

```ts
type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[]>;
    };
```

## Mutation sequence

Every admin mutation must execute in this order:

1. `requirePermission(...)`
2. `schema.safeParse(...)`
3. Load existing record if update/delete.
4. Check business invariants.
5. Write transaction.
6. Create audit entry.
7. Invalidate relevant tags.
8. Return serializable result.

Do not trust client-provided role, user ID, ownership or publication status.

## DAL separation

DAL functions are split into:

### Public reads

Examples:

```ts
listPublishedPosts()
getPublishedPostBySlug(slug)
listPublishedEvents()
getPublishedFaq()
listPublishedGallery()
listPublishedTestimonials()
listPublishedTeam()
```

These may be cached.

### Admin reads

Examples:

```ts
adminListPosts(filters)
adminGetPost(id)
adminListEvents(filters)
adminGetEvent(id)
```

These must not use public cache.

## Transaction examples

Publishing:

```ts
await db.$transaction(async (tx) => {
  const existing = await tx.blogPost.findUnique(...);

  const updated = await tx.blogPost.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      publishedAt: existing?.publishedAt ?? new Date(),
    },
  });

  await tx.auditLog.create(...);

  return updated;
});
```

If the existing project's audit service is intentionally outside the Prisma transaction, preserve that established service pattern, but ensure failed writes cannot be presented as successful.

## Delete policy

Prefer lifecycle operations over hard deletion:

- Course -> ARCHIVED
- Blog -> ARCHIVED
- Event -> CANCELLED
- Testimonial -> hidden/unpublished
- FAQ -> delete only when no historical requirement exists
- Media -> hard delete only when usage count is zero

## Slug policy

Slugs are public identifiers.

Before changing a published slug:

1. Check uniqueness.
2. Save old slug.
3. Save new slug.
4. Invalidate old route.
5. Invalidate new route.
6. Update sitemap source.

If SEO redirects are required, add a redirect model rather than silently losing the old URL.

## API routes

Do not create REST endpoints for every admin operation.

Use API routes only for:

- authentication callback endpoints
- upload signing
- external webhook integrations
- third-party consumers that require HTTP

The existing `/api/upload/sign` pattern is appropriate.
