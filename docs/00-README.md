# Darbar Computer — Admin Panel + Client Frontend Implementation Pack

## Purpose

This implementation pack is derived from the uploaded `Darbar-Computer-Semifinal-version.zip`.

The project already contains:

- Next.js App Router public website
- Prisma/PostgreSQL schema
- Better-auth-style session/account models and admin login flow
- Role model: `SUPER_ADMIN`, `ADMIN`, `EDITOR`, `COUNSELOR`
- Course admin UI and server actions
- Leads/CRM admin UI and server actions
- Media library and Cloudinary upload flow
- Site settings
- Public inquiry/contact/newsletter server actions
- Cache/revalidation infrastructure
- Audit logging
- Public course pages already reading from the database

The main implementation problem is not "build a new admin panel from scratch". It is to complete the content-management pipeline:

`Admin UI -> permission -> Zod validation -> Server Action -> DAL -> Prisma -> audit -> cache invalidation -> public DAL -> public page`

For content that still uses `src/content/*`, the target is:

`Admin UI -> DB -> public DAL -> existing frontend component`

## Source-of-truth rule

After this implementation:

1. Prisma/PostgreSQL is the source of truth for editable website content.
2. `src/content/*` is seed/migration/reference data only.
3. Public pages must never import editable production content directly from `src/content/*`.
4. Admin writes must use Server Actions or protected server functions.
5. Public reads must use server-side DAL functions and mappers.
6. Cache tags must be invalidated after successful writes.
7. Existing visual components should be preserved unless a UI change is explicitly required.

## Implementation order

1. Read `01-IMPLEMENTATION-AUDIT.md`
2. Apply `02-CONTENT-SOURCE-OF-TRUTH.md`
3. Apply `03-ADMIN-MODULES.md`
4. Apply `04-SERVER-ACTION-AND-DAL-CONTRACT.md`
5. Apply `05-PUBLIC-FRONTEND-CONNECTION.md`
6. Apply `06-PUBLISHING-CACHE-AND-SEO.md`
7. Apply `07-CRM-FORMS-MEDIA.md`
8. Apply `08-RBAC-SECURITY-AUDIT.md`
9. Apply `09-TESTING-ACCEPTANCE.md`
10. Use `10-AI-IMPLEMENTATION-PROMPT.md` for implementation in an AI coding agent.

## Non-goals

- Do not redesign the public website.
- Do not replace working Course/Lead/Media/Settings architecture.
- Do not expose Prisma directly to client components.
- Do not create unnecessary REST APIs when Server Actions already satisfy the application.
- Do not duplicate business rules in browser code.
