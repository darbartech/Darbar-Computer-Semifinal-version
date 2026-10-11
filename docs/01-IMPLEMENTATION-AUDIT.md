# 01 — Implementation Audit

## 1. Current project state

### Already substantially implemented

| Area | Current state | Action |
|---|---|---|
| Course database model | Implemented | Preserve |
| Course admin list/form | Implemented | Finish edge cases/tests |
| Course Server Actions | Implemented | Preserve contract |
| Course public DAL | Implemented | Use as reference architecture |
| Course public pages | DB-backed | Preserve pattern |
| Categories | Admin UI + DB | Finish publish/cache integration |
| Leads | Admin UI + actions | Finish CRM completeness |
| Media | Upload/register/delete/alt | Preserve security flow |
| Settings | Admin tabs + typed validation | Preserve |
| Auth/session | Present | Audit route/page protection |
| RBAC | Present | Audit each mutation |
| Audit log | Present | Require for all admin mutations |
| Public inquiry/contact | Server Actions | Preserve |
| Newsletter | Server Action | Preserve |

## 2. Main remaining gap

The project still contains production-facing imports from:

- `src/content/blog-posts.ts`
- `src/content/courses.ts`
- `src/content/events.ts`
- `src/content/faq.ts`
- `src/content/gallery.ts`
- `src/content/institute.ts`
- `src/content/testimonials.ts`

Known public areas using static content include:

- About
- Blog
- Events
- FAQ
- Gallery
- Testimonials
- Some constants/institute content
- Sitemap

The final system must remove these runtime dependencies for editable content.

## 3. Missing admin coverage

The database contains content models for:

- BlogPost
- Tag
- Event
- FaqCategory
- Faq
- GalleryItem
- Testimonial
- TeamMember
- SiteSetting

But the current protected admin routes are primarily:

- Dashboard
- Categories
- Courses
- Leads
- Media
- Settings

Therefore the implementation should add admin modules for:

- `/admin/blog`
- `/admin/events`
- `/admin/faq`
- `/admin/gallery`
- `/admin/testimonials`
- `/admin/team`
- `/admin/batches`
- `/admin/messages`
- `/admin/subscribers`
- `/admin/users` — SUPER_ADMIN only
- `/admin/audit` — SUPER_ADMIN/ADMIN according to policy

## 4. Important architectural observation

Do not rebuild the system around client-side fetching.

This project is a Next.js App Router application. The cleanest connection is:

- Server Component reads DB through DAL.
- Client Component receives serializable props.
- Client-side interaction uses Server Actions.
- Cache invalidation refreshes the public result.
- API routes are reserved for cases that genuinely need an HTTP API.

This preserves the project's existing architecture and avoids exposing database logic to the browser.

## 5. Definition of done

A content change is complete only when:

1. Admin can create/edit it.
2. Admin can save a draft.
3. Admin can publish/unpublish/archive where applicable.
4. Permission is checked server-side.
5. Zod validation runs server-side.
6. Database transaction succeeds.
7. Audit record is created.
8. Relevant cache tags are invalidated.
9. Public page reads the new value from DB.
10. SEO metadata/sitemap uses the same published source.
11. No stale `src/content/*` runtime dependency remains for that content.
