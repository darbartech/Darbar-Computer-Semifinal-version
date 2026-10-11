# Phase 5 Final Integration Audit — Specification (UPDATED after actual audit)

## Problem
Final integration audit of the Darbar Computer project (already ~95% complete) identifies concrete, verifiable failures:
- **13 TypeScript errors** from `npm run typecheck` (Date/string type mismatches, action form return types, DAL input type narrowing, boolean/string mismatch)
- **Missing admin route**: `/admin/events/[id]/page.tsx` edit page does not exist (list and new exist)
- **3 unit test failures** in `permissions.test.ts` — drift between actual PERMISSIONS table and EXPECTED snapshot (missing subscriber.update, users.read, users.write entries)
- **6 ESLint errors** (explicit any, sync setState in effect) + 16 warnings (no-async-client-component, unused imports, react-hooks incompatible-library)
- **Architectural antipattern in 5 admin pages**: `"use client"` at file top combined with an async default server page export that calls `requirePermission()` + server DAL imports — this breaks Next.js server-only module boundaries at runtime

## Users
- **End users (public)**: Public pages must continue working; types must compile so site builds
- **Content editors (ADMIN/EDITOR)**: Events edit route must exist so editors can modify existing events
- **Counselors/SUPER_ADMIN**: Existing lead/message/subscriber flows need type-correct admin pages
- **SUPER_ADMIN**: Permissions matrix snapshot must match actual grants

## Goals
1. Fix all 13 TypeScript errors so `npm run typecheck` exits 0
2. Create the missing events edit page following the existing blog edit pattern
3. Fix the 3 failing permission snapshot tests (update EXPECTED table to match actual production grants, or vice versa — match the documented RBAC matrix from docs/08)
4. Fix ESLint errors (no-explicit-any violations in admin pages, sync setState in UsersTable useEffect)
5. Fix the 5 admin pages with wrong "use client" mixing pattern — properly split server page wrappers from client components so server-only imports stay server-side
6. Run lint, typecheck, build, unit tests; confirm everything passes (or document pre-existing environmental issues)
7. Produce the 12-section final summary

## Non-goals
- Do not redesign public UI components or add features
- Do not replace Server Actions with REST APIs or replace Prisma/auth
- Do not modify server actions' business logic beyond fixing type narrowing
- Do not touch public pages/visuals (already verified correct)
- Do not create new REST APIs
- Do not make DB schema changes (none required)

## Functional Requirements

### FR-01 — TypeCheck Passes (13 TS errors fixed)
FR-01 (rule): `npm run typecheck` (tsc --noEmit) MUST exit code 0. Individual fixes:

- **FR-01a (rule)**: audit-log page passes serialized Date strings (toISO) to AuditLogsTable instead of raw Date objects. Or row type widened to accept both and formatDateTime handles both.
- **FR-01b (rule)**: messages page passes serialized Date strings to MessagesTable, or MessageRow type accepts `Date | string`.
- **FR-01c (rule)**: subscribers page same pattern for SubscriberRow.createdAt and unsubscribedAt.
- **FR-01d (rule)**: testimonials page same pattern for TestimonialRow.createdAt. TestimonialsManager row createdAt type accepts Date.
- **FR-01e (rule)**: users page passes emailVerified as serialized date string (ISO) or null to UsersTable (matches declared UserRow.emailVerified: string | null). Or type widened and renderer uses truthy check.
- **FR-01f (rule)**: faq/page.tsx form action wrapper for server actions that return ActionResult — wrapped handlers return void (handle result with toast/error inside the wrapper).
- **FR-01g (rule)**: gallery/page.tsx same action wrapper pattern for saveGalleryItem action return.
- **FR-01h (rule)**: blog.ts saveBlogPost — correct type narrowing so createBlogPost() receives CreateInput (not UpdateInput). Fix the `values` union typing by splitting into createValues / updateValues local variables with correct Prisma types before calling DAL.
- **FR-01i (rule)**: events.ts saveEvent same Prisma input type narrowing fix as blog.

### FR-02 — Missing Events Edit Route Added
FR-02 (rule): Directory `src/app/admin/(protected)/events/[id]/` exists with `page.tsx`. Pattern matches existing `blog/[id]/page.tsx` and existing `events/new/page.tsx`:
- Async server page: `requirePermission("events.write")`, loads event via `adminGetEvent(id)`, 404 if missing, loads `listRecentMedia(24)`, calls `can()` for write flag.
- Contains a client EventFormClient component (reusable or inlined from new) that accepts event prop and calls saveEvent action.
- Links back to /admin/events and shows public URL when published.

### FR-03 — Permissions Unit Tests Pass (3 fixed)
FR-03 (rule): `npm test permissions.test.ts` exits 0. The documented RBAC matrix in docs/08 states:
- users.write → SUPER_ADMIN only
- audit.read → SUPER_ADMIN + ADMIN
- lead.assign → SUPER_ADMIN + ADMIN + COUNSELOR (not EDITOR)

Fix approach: Align EXPECTED snapshot with actual PERMISSIONS table AND docs/08 matrix. Add missing EXPECTED entries for:
- subscriber.update → ADMIN + SUPER_ADMIN (counselor permission if doc-supported, else ADMIN+)
- users.read → ADMIN + SUPER_ADMIN
- users.write → SUPER_ADMIN only

### FR-04 — ESLint Errors Fixed (0 errors exit)
FR-04 (rule): `npm run lint` exits with 0 ERRORs. Warning-level items acceptable but errors must be fixed. Specifically:
- **FR-04a (rule)**: Replace `any` typed props in admin pages with proper types (use Awaited<ReturnType<typeof dalFn>> pattern already used in public pages).
- **FR-04b (rule)**: UsersTable.tsx useEffect no longer calls setState synchronously — convert initial row role setup to useState initializer callback that reads props.rows directly, or defer with queueMicrotask/startTransition, or drop the effect entirely and compute draft inline.

### FR-05 — Server/Client Boundary Correct on Admin Pages
FR-05 (rule): Admin pages for blog, events (list/new/edit) must NOT have "use client" at file top when the default export is an async server page calling server-only modules (requirePermission, admin DAL). Correct pattern:
- **Page file**: NO "use client". Server function: permission check → data load → render a separate named client component.
- **Client component**: Extracted to same file exported inner component with "use client" OR to its own file. Contains useRouter, useForm, react hooks, imports server actions (which are safe to import in client because of "use server" directive).
- Applies to: blog/page.tsx, blog/new/page.tsx, blog/[id]/page.tsx, events/page.tsx, events/new/page.tsx, events/[id]/page.tsx (new). The goal is no `no-async-client-component` ESLint warning for the default page export.

### FR-06 — Build & Test Final
FR-06 (rule): After all fixes run the following and document:
- `npm run lint` → exit 0 with 0 errors (warnings acceptable only if pre-existing and non-blocking)
- `npm run typecheck` → exit 0
- `npm run build` → exit 0 (or document environmental block like missing DB connection not fixable at code level)
- `npm run test` → run; document failures. Known DB/env failures are acceptable if documented.

## Non-functional Requirements

### NFR-01 — No Runtime src/content Imports (already verified)
NFR-01 (rubric, 0-2, threshold 2): No production public code/page/sitemap imports editable content from src/content. Score:
- 2 = verified (grep returned 0 actual imports)
- 1 = 1 remaining but documented
- 0 = >1 real imports
Already verified by source audit; only comments reference src/content. Should score 2.

### NFR-02 — Drafts Unpublished Inaccessible (public)
NFR-02 (rubric, 0-2, threshold 2): All public DAL fns filter by status='PUBLISHED' (or equivalent). Score:
- 2 = BlogPost, Event, Course, Gallery, FAQ, Testimonial, Team public list/getBySlug functions all verify published status
- 1 = 1-2 missing
- 0 = >2 missing
Verified during inspection — all public DALs use correct filters.

### NFR-03 — Architectural Integrity
NFR-03 (rubric, 0-2, threshold 2): Data flow remains Admin UI → Perm → Zod → Action → DAL → Prisma → Audit + Invalidate → Public DAL → Public Frontend. No new REST APIs, no direct Prisma in client. Score 2 if architecture preserved exactly; 1 minor deviation; 0 antipatterns.

## Constraints
- Prisma 7 pinned, Next.js 16 App Router, Zod 4
- `src/server/*` keeps `server-only` imports
- Pages = Server Components where possible
- Admin layout already has requireUser(); pages add scoped permission
- Existing TestimonialsManager/TeamManager/GalleryForms/etc. component patterns are reference; do not invent new form pattern.

## Dependencies
- Existing: `src/server/actions/blog.ts`, `events.ts`, `faq.ts`, `gallery.ts`, `testimonials.ts`, `team.ts`, `messages.ts`, `subscribers.ts`, `users.ts`, `leads.ts`, `media.ts`, `settings.ts`, `batches.ts`, `public-forms.ts`
- DALs: `src/server/dal/*` (all 13 domains present)
- Validators: `src/lib/validators/*` (all present)
- Client components in `src/components/admin/*` (mostly present).

## Assumptions
1. Docker DB needed for build but not for lint/typecheck/unit tests.
2. Server actions are correctly secured (grep confirms all call requirePermission first; verified for blog, courses, events, media, settings, leads, testimonials, users, batches, messages, subscribers, FAQ).

## Acceptance Criteria

### AC-01 TypeScript 0 Errors
(rule) `npm run typecheck` exit code 0.

### AC-02 Events Edit Route Exists
(rule) Directory/file `src/app/admin/(protected)/events/[id]/page.tsx` exists; imports adminGetEvent + saveEvent + requirePermission; follows blog/[id] layout pattern.

### AC-03 Permissions Tests Pass
(rule) `npx vitest run tests/permissions.test.ts` exits 0.

### AC-04 Lint Passes (0 Errors)
(rule) `npm run lint` exit 0 errors (0 actual lint ERRORs).

### AC-05 Admin Pages Boundary Correct
(rule) Blog and Events admin list/new/edit pages have default export as a synchronous or async server function WITHOUT `"use client"` at file top; client hooks code is in separate scoped client components.

### AC-06 Build, typecheck, lint, unit tests executed
(rule) All 4 commands run and exit codes documented.

### AC-07 Final 12-Section Report Produced
(rule) The final user response contains all 12 required sections as specified in the user request.
