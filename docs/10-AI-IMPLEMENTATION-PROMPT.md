# 10 — AI Implementation Prompt

Use this prompt with an AI coding agent after placing this documentation inside the repository.

---

You are implementing the final Admin Panel + Client Frontend data connection for the Darbar Computer Next.js project.

Read these files first:

- `docs/01-IMPLEMENTATION-AUDIT.md`
- `docs/02-CONTENT-SOURCE-OF-TRUTH.md`
- `docs/03-ADMIN-MODULES.md`
- `docs/04-SERVER-ACTION-AND-DAL-CONTRACT.md`
- `docs/05-PUBLIC-FRONTEND-CONNECTION.md`
- `docs/06-PUBLISHING-CACHE-AND-SEO.md`
- `docs/07-CRM-FORMS-MEDIA.md`
- `docs/08-RBAC-SECURITY-AUDIT.md`
- `docs/09-TESTING-ACCEPTANCE.md`

## Primary objective

Complete the existing architecture without redesigning the website.

Convert editable production content from static `src/content/*` imports to:

`Admin -> Server Action -> DAL -> Prisma -> Audit -> Revalidate -> Public DAL -> Existing UI`

## Mandatory rules

1. Preserve existing Course/Lead/Media/Settings architecture.
2. Do not rewrite correct code unnecessarily.
3. Do not expose Prisma or database credentials to client components.
4. Use Server Actions for admin mutations.
5. Use existing permission/session helpers.
6. Use existing Zod validator architecture.
7. Use existing audit service.
8. Use existing cache/revalidation mechanism.
9. Reuse existing UI components and styling.
10. Do not redesign public pages.
11. Keep existing URLs/slugs compatible.
12. Do not remove useful seed data until DB migration/seed is complete.
13. Return only edited/new files if this is being executed as a patch task.

## Implement in this order

### Phase 1 — inspect

Identify every runtime import from:

- `src/content/blog-posts.ts`
- `src/content/courses.ts`
- `src/content/events.ts`
- `src/content/faq.ts`
- `src/content/gallery.ts`
- `src/content/institute.ts`
- `src/content/testimonials.ts`

Separate:
- seed/reference usage
- runtime production usage

### Phase 2 — DAL

Create:

```text
src/server/dal/blog.ts
src/server/dal/events.ts
src/server/dal/faq.ts
src/server/dal/gallery.ts
src/server/dal/testimonials.ts
src/server/dal/team.ts
```

Each must provide:
- public published reads
- admin uncached reads
- stable view-model mappers

### Phase 3 — validators

Create:

```text
src/lib/validators/blog.ts
src/lib/validators/events.ts
src/lib/validators/faq.ts
src/lib/validators/gallery.ts
src/lib/validators/testimonials.ts
src/lib/validators/team.ts
```

### Phase 4 — actions

Create:

```text
src/server/actions/blog.ts
src/server/actions/events.ts
src/server/actions/faq.ts
src/server/actions/gallery.ts
src/server/actions/testimonials.ts
src/server/actions/team.ts
```

Every action:

`permission -> validation -> DB -> audit -> invalidate`

### Phase 5 — admin pages

Create protected admin pages for:

```text
/admin/blog
/admin/blog/new
/admin/blog/[id]

/admin/events
/admin/events/new
/admin/events/[id]

/admin/faq
/admin/gallery
/admin/testimonials
/admin/team
/admin/batches
/admin/messages
/admin/subscribers
```

Add user/audit administration only according to the existing permission system.

### Phase 6 — public connection

Replace static imports in:

- blog list/detail
- events list/detail
- FAQ
- gallery
- testimonials
- team/about
- sitemap

with DB-backed DAL reads.

Pass serializable view models into existing client components.

### Phase 7 — cache/SEO

Add domain tags and invalidate them after writes.

Ensure:
- draft is not public
- unpublished detail returns 404
- metadata uses DB
- sitemap uses DB
- publishedAt is stable
- slug changes invalidate old/new paths

### Phase 8 — CRM/media

Ensure public inquiry course selection comes from published courses.

Ensure media is reused through `ImagePicker` and deletion is blocked while referenced.

### Phase 9 — tests

Run:
- typecheck
- lint
- Prisma validation/generation
- unit tests
- E2E tests

Add tests for every new content module.

## Final verification

Search the entire `src/app` and `src/components` tree for production imports from `src/content/*`.

The only remaining imports should be intentional seed/reference code.

Do not declare the implementation complete until the admin-to-public propagation path has been tested for at least:

- Course
- Blog
- Event
- FAQ
- Gallery
- Testimonial

## Output requirement

At the end provide:

1. changed files
2. new files
3. database migration/seed changes
4. tests added
5. remaining limitations, if any
