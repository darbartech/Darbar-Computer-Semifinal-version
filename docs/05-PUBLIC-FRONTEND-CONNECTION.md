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

## Motion, focus and progress states

- `prefers-reduced-motion: reduce` beats the theme. `globals.css` flattens every animation
  and transition inside `@layer base`, and `Reveal` short-circuits to a plain element — no
  opacity, no translate, no transition delay — through `usePrefersReducedMotion()`. The hero's
  decorative code rain is a CSS animation, so `Hero.tsx` answers the same query with
  `animation: none` and its tokens stay at their inline `opacity: 0`. A new animated component
  reads that setting; it does not invent its own.
- The header's student chip has three states, not two. `useStudentChip()` returns
  `{ chip, resolved }`, and while `resolved` is false the header shows a placeholder of the
  same size instead of "Sign In" — a signed-in student is never told they are signed out while
  `/api/student/me` is in flight. A failed lookup counts as signed out rather than as an
  endless skeleton.
- Every layout gives keyboard users a skip link (`href="#main-content"` → that layout's
  `<main id="main-content">`), including `/techdarbar`, where the sidebar is two dozen tabs
  deep. The student portal renders inside the public layout's `<main>` and must not add its own.
- `e2e/accessibility.spec.ts` proves these in a browser: the first Tab reaches the skip link,
  activating it lands inside `<main>`, no tab stop is invisible, the confirm dialog keeps Tab
  inside itself, and reduced motion leaves no copy transparent.

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
