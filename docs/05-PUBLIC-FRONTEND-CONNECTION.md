# 05 — Public Frontend Connection

## Objective

Make the existing client-facing website display admin-managed data without redesigning the UI.

## Public page pattern

A public page should be a Server Component whenever possible.

Example:

```tsx
export default async function BlogPage() {
  const posts = await listPublishedPosts();

  return <BlogClient posts={posts} />;
}
```

The client component only handles:

- filtering
- tabs
- dialogs
- animation
- browser-only interactions

It should not query Prisma.

## Required migrations

### Blog

Replace static imports in:

- `src/app/(public)/blog/page.tsx`
- `src/app/(public)/blog/[slug]/page.tsx`

with:

```ts
getPublishedPostBySlug(slug)
listPublishedPosts()
```

### Events

Replace static imports in:

- `/events`
- `/events/[slug]`

with event DAL functions.

### FAQ

Replace static FAQ imports with:

```ts
getPublishedFaq()
```

Pass the returned view model into `FAQAccordion`.

### Gallery

Replace static gallery data with:

```ts
listPublishedGallery()
```

Pass results to `GalleryClient`.

### Testimonials

Replace static testimonial imports with:

```ts
listPublishedTestimonials()
```

Pass results into `TestimonialCarousel`.

### About/team

Use DB-backed settings/team DAL for editable sections.

## Course pattern

The course implementation is already the reference model:

```text
DB
 -> listPublishedCourses()
 -> toCourseView()
 -> CoursesPage
 -> CoursesClient
```

Do the same for every content domain.

## Client component contract

Client components should receive plain serializable objects.

Avoid:

```tsx
<Course data={prismaCourse} />
```

Prefer:

```tsx
<Course data={courseView} />
```

## Empty states

Every public collection must handle:

- no records
- no published records
- missing image
- missing optional metadata

Do not render admin-only drafts.

## Preview mode

Optional future feature:

- Admin preview token
- Preview server route
- Preview draft data only after explicit authorization

Do not expose draft content through normal public URLs.
