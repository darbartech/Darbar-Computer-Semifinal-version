# 02 — Content Source of Truth

## Goal

Convert the website from a mixed static/DB content model into a single production content pipeline.

## Runtime rule

Never do this in production page code:

```ts
import { posts } from "@/content/blog-posts";
```

Instead:

```ts
import { listPublishedPosts } from "@/server/dal/blog";

const posts = await listPublishedPosts();
```

The same rule applies to events, FAQs, gallery, testimonials and team.

## Mapping

### Blog

Static source:
`src/content/blog-posts.ts`

Database:
`BlogPost`, `Tag`

New DAL:
`src/server/dal/blog.ts`

New actions:
`src/server/actions/blog.ts`

Public pages:
- `/blog`
- `/blog/[slug]`

Admin:
- `/admin/blog`
- `/admin/blog/new`
- `/admin/blog/[id]`

### Events

Static source:
`src/content/events.ts`

Database:
`Event`

New DAL:
`src/server/dal/events.ts`

New actions:
`src/server/actions/events.ts`

Public:
- `/events`
- `/events/[slug]`

Admin:
- `/admin/events`
- `/admin/events/new`
- `/admin/events/[id]`

### FAQ

Static source:
`src/content/faq.ts`

Database:
`FaqCategory`, `Faq`

New DAL:
`src/server/dal/faq.ts`

New actions:
`src/server/actions/faq.ts`

Public:
`/faq`

Admin:
`/admin/faq`

### Gallery

Static source:
`src/content/gallery.ts`

Database:
`GalleryItem`, `Media`

New DAL:
`src/server/dal/gallery.ts`

New actions:
`src/server/actions/gallery.ts`

Public:
`/gallery`

Admin:
`/admin/gallery`

### Testimonials

Static source:
`src/content/testimonials.ts`

Database:
`Testimonial`

New DAL:
`src/server/dal/testimonials.ts`

New actions:
`src/server/actions/testimonials.ts`

Public components:
`TestimonialCarousel`

Admin:
`/admin/testimonials`

### Team

Database:
`TeamMember`

New DAL:
`src/server/dal/team.ts`

New actions:
`src/server/actions/team.ts`

Public usage:
About/team sections where applicable.

### Institute/About

Use `SiteSetting` for editable institutional configuration.

Do not put mutable business information back into a TypeScript constants file.

## Migration strategy

1. Keep old files temporarily.
2. Create seed/migration scripts that copy existing static values into DB.
3. Implement DAL.
4. Switch public pages to DAL.
5. Compare rendered output against current site.
6. Remove runtime imports from `src/content`.
7. Keep seed/reference files only if they are intentionally used for initial data.

## Data normalization rule

Public components should consume stable view models, not raw Prisma rows.

Example:

```ts
type PublicBlogPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  contentHtml: string;
  image: string | null;
  authorName: string;
  publishedAt: string;
  tags: string[];
};
```

The mapper belongs in the server layer.

## Important

Do not pass Prisma objects directly into client components. Convert dates, enums and nullable relations into serializable view models.
